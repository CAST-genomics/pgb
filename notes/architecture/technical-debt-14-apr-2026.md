# Technical Debt Assessment

**Date:** 2026-04-14
**Context:** Written after PRs #41, #43, and #45 landed — the three refactors corresponding to entries #1, #2, and #3 of the [code architecture improvements roadmap](./code-architecture-improvements.md). This document captures the state of the codebase *after* those three deepenings and names what remains.

**Overall level:** moderate. Not alarming, not close to done. The deepest architectural smells from six weeks ago — circular refs, scattered lifecycles, widget bypass paths, re-traversal of the dataset — are gone. What's left is sized and shaped: one giant file, one catch-all, a singleton pattern blocking test coverage, and a TS adoption that stalled. None of it is on fire. All of it is doing slow damage to the ability to add features and write tests.

---

## Roadmap entries still open

These were diagnosed in `code-architecture-improvements.md` before PRs #41/#43/#45; the three landed PRs did not touch them.

### #6 — PCA triangle (HIGHEST leverage remaining)

`src/widgets/pcaChartService.js` is **1031 lines** — by far the largest file in the app. Next is `pangenomeService.js` at 663.

One class owns all of:
- DOM construction (43 direct DOM calls)
- CSS layout reads (`getComputedStyle`, `--pca-chart-surface-size`)
- Coordinate-space math (bbox, scaling, padding, clamping)
- Reference data loading (TSV fetch + parse)
- Event fan-in (9 subscriptions)
- Dot rendering (dataset dots, reference dots)
- Hover/click emphasis + size multipliers
- Drag behavior

Phase 2 of PR #45 shaved ~40 lines off `initializeGlobalBoundingBox` by reading the dataset bbox from `DatasetModel.index` instead of re-walking nodes — cosmetic relative to the total.

**The obvious split:** a pure `PcaCoordinateSpace` object (bbox, scale, project) and a thin `PcaChartRenderer` (DOM, event handlers). The coordinate-space object would be the first service in the app with real unit tests.

### #4 — AnnotationRenderService catch-all

`src/annotationRenderService.ts` — 435 lines, five unrelated concerns in one class:
- Data loading (GFF3 tracks from `genomicService`)
- DOM layout (canvas container, header, reset button)
- Canvas resize handling
- Event subscriptions (5 events: `lineIntersection`, `clearIntersection`, `population:selected`, etc.) with no documented firing order
- Derived indices (`bpIndex`, `splineParameterMap`) rebuilt across scattered methods
- Feature rendering (canvas draw calls)

Pure index-building is separable from rendering. After the split, the index becomes trivially testable and the renderer gets tested against a fake index.

### #5 — RibbonLine raycast + material/Z-offset split

`src/ribbonLine.js` (134 lines) raycasts by sampling the spline 48× per pointer move and is tightly bound to shader `halfWidth` uniforms owned by `lineMaterialResolutionService`. Z-offset logic is split between `GeometryFactory` constants and (historically) `Look.getZOffset()` — PR #41 deleted the Look-side half, which was progress.

The `ribbon-mesh` branch is where this ultimately gets resolved. On `main` the raycast / shader-uniform split still exists.

---

## Debt not in the roadmap

Smells that weren't in the original architectural walk but surfaced in this assessment.

### The singleton pattern is everywhere and it blocks testing

`pcaChartService`, `pclaiCoordinateService`, `assemblyMetadataService`, `frequencyAnalysisService`, `materialService`, `lineMaterialResolutionService` all follow the same pattern:

```js
class FooService {
    constructor() {
        if (FooService.instance) return FooService.instance;
        // ...
        FooService.instance = this;
    }
}
const fooService = new FooService();
export { fooService };
```

Consumers import the default instance. The effect:
- Services cannot be instantiated with fresh state.
- They cannot be mocked or replaced for tests.
- They cannot be independently exercised without booting the app.

**The symptom this produces:** the app has **zero tests for any service**. The only test file touching app code is `datasetParser.test.js` — and the parser is the one module that happens to be a pure function. Everything else is a singleton graph.

This is the single biggest reason test coverage isn't growing organically. Any refactor that wants to unlock testing has to break the singleton pattern first.

**Recommended approach:** incremental — one service per month. Stop using `Class.instance`, accept the service via `App`'s constructor, and write one test to prove it works. After three or four of these, the pattern tips and the rest follow.

### TypeScript adoption is stalled in an awkward middle

Current split:
- **40 JS files** (non-test, non-igvCore)
- **16 TS files**

And among the TS files, **89 `: any` annotations across 10 files**:
- `app.ts`: 21
- `looks/look.ts`: 19
- `annotationRenderService.ts`: 12
- `widgets/populationWidget.ts`: 11
- `widgets/populationOnlyWidget.ts`: 11
- `widgets/pcaWidget.ts`: 3
- `widgets/assemblyWidget.ts`: 4
- `looks/heatmapLook.ts`: 4
- `looks/nodeEmphasisLook.ts`: 3
- `assemblyMetadataService.ts`: 1

The typed event bus (PR #37) was a real win, but most TS files opted out of their own types via `any`. The typed bus's payoff requires typed consumers — today most consumers are either JS files or TS files escape-hatched to `any`, so the bus's type guarantees don't propagate to the places they'd help most.

There is a documented TypeScript strategic adoption plan in project memory. Reading the TS files today, the plan isn't far along.

**Biggest TS candidates among JS files** (measured by size and by having class bodies — i.e., places where typing would pay the most):
- `pangenomeService.js` (663 lines)
- `sceneManager.js` (267 lines)
- `geometryFactory.js` (297 lines)
- `raycastService.js` (335 lines)
- `pcaChartService.js` (1031 lines — but see #6 above; split first, then type)

### `globals.*` as a coordination backdoor

29 references across 9 files: `app.ts`, `contextMenuService.js`, `locusInput.js`, `raycastService.js`, `widgets/widgetService.js`, `widgets/populationWidget.ts`, `widgets/populationOnlyWidget.ts`, `annotationRenderService.ts`, `main.js`.

Usually appears where proper DI would have been fine but the call site didn't have the reference handy. It's the kind of debt that's cheap to fix file-by-file but nobody does because nothing is broken.

**Severity:** low per-site, medium in aggregate. A good janitorial sweep for a slow afternoon.

### Widget DOM construction is imperative and duplicated

**147 direct DOM calls across 14 files.** Each widget (`assemblyWidget`, `populationWidget`, `populationOnlyWidget`, `pcaWidget`) builds its list-item template in its own loop, with `createElement` / `appendChild` by hand.

No component layer, no template helper. If a fifth widget appears, it will be a fifth copy of the pattern.

**Severity:** low. Widgets are small and the duplication is honest, not subtle. Flagging so it doesn't slide in later under the cover of "just another widget."

### Event bus typing coverage is incomplete

37 subscribe/publish call sites across 9 files. This is consistent with the shade-tree philosophy — events *are* the parameter binding for Looks, and that's how the architecture is supposed to work.

The issue isn't the bus itself; it's that the typed event bus (PR #37) only helps callers that are themselves typed. Most of the subscribers today are either JS files or `any`-laced TS files, so the type guarantees on the bus don't reach the handlers. The investment in PR #37 is partially stranded until the consumer files are typed up.

---

## Explicitly *not* debt

Worth naming so "do we need to refactor X" doesn't slide in later under the assumption that anything untouched is suspect.

- **The Look system.** Post-#41 and #43 it is the cleanest subsystem in the app, and the shade-tree philosophy says it is *supposed* to accumulate visual complexity. Don't touch except to add new Looks or new Look parameters.
- **`datasetParser` + `datasetModel`.** The V2 redesign made these pure and testable; #45 made them the authoritative source for dataset-derived facts. This is now the architectural high point of the app.
- **The event bus itself.** The channel is fine. The gap is consumer-side typing.
- **The widget → Look activation path.** PR #43 just settled this. Leave it.
- **`App.loadDataset` (new from #45).** Still a thin fan-out, but correctly placed and properly scoped to data loading only. Future dataset-consuming services go here; non-data concerns (geometry, scene, camera) stay in `processData`.

---

## Recommended order for the next round

If only three things get tackled before the next assessment, I'd pick in this order:

1. **#6 — split `pcaChartService` into coordinate-space + renderer.**
   - **Why first:** biggest single file, most concerns, the split is obvious, and the coordinate-space object becomes the first unit-testable service in the app. That alone changes the test-coverage trajectory.
   - **Risk:** PCA widget + chart are user-visible on HPRC data. Need Playwright coverage of the hover + click paths before starting.

2. **Break one singleton per month, starting with `pclaiCoordinateService`.**
   - **Why:** unblocks testing across the whole app. Doesn't need to be fast — three or four converted services and the pattern tips.
   - **Order suggestion:** start with `pclaiCoordinateService` (cleanest internal state), then `assemblyMetadataService`, then `frequencyAnalysisService`. Save `pcaChartService` until after #6 splits it.
   - **Risk:** touches every import site. Best done one service at a time with a single PR each.

3. **#4 — split `annotationRenderService` into index-builder + renderer**, *or* do a targeted `: any` sweep of `app.ts` (21 occurrences).
   - **Why either:** both are medium-sized, low-risk wins. #4 is higher-leverage; the `any` sweep is lower-risk.
   - **Pick based on appetite:** if the team has bandwidth for a multi-day cleanup, do #4. If it's a solo afternoon, do the `any` sweep.

---

## Metrics snapshot (2026-04-14)

For comparison at the next assessment.

| Metric | Value |
|---|---|
| Source files (excluding tests + igvCore) | 56 |
| TS files | 16 |
| JS files | 40 |
| Total source LOC | 10,941 |
| Largest file | `pcaChartService.js` (1031) |
| `: any` annotations | 89 across 10 TS files |
| `globals.*` references | 29 across 9 files |
| `eventBus.*` subscribe/publish sites | 37 across 9 files |
| Direct DOM calls | 147 across 14 files |
| Service test files | 0 |
| Parser test files | 1 (`datasetParser.test.js`, 37 tests) |
| igvCore test files | 22 |
| Total passing tests | 193 |

---

## History

- **2026-04-14** — Initial assessment after PRs #41, #43, #45 landed. This document.
