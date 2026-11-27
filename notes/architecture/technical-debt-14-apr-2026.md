# Technical Debt Assessment

**Date:** 2026-04-16 (updated)
**Status:** All 6 roadmap entries resolved (#5 closed by PR #54). Of the 5 non-roadmap debt items, none is fully resolved: singletons down 5 → 4 (`lineMaterialResolutionService` absorbed into `src/ribbonNode.ts` by PR #54); TypeScript is now the majority (59 TS / 40 JS); `: any` down 99 → 94; `globals.*` up 29 → 37. Verified against `src/` 2026-11-26. The analysis below is the 2026-04-16 text; inline *Verified 2026-11-26* notes record what has changed since.
**Context:** Updated after PRs #48 and #50 landed — completing roadmap entries #6 (PCLAI triangle) and #4 (AnnotationRenderService catch-all). The original assessment was written 2026-04-14 after PRs #41, #43, and #45. All five roadmap entries that had clear refactors (#1–#4, #6) are now resolved.

**Overall level:** low-to-moderate. The five deepenings (#41, #43, #45, #48, #50) eliminated every architectural smell that was diagnosed in the original roadmap. What remains is structural: a singleton pattern blocking test coverage, a TypeScript adoption that stalled in an awkward middle, and a `globals.*` coordination backdoor. None of these are worsening, but they limit the ability to add features confidently and write tests cheaply.

---

## Roadmap entries — resolved

### #6 — PCLAI triangle: RESOLVED (PR #48)

`pclaiChartService.js` (1031 lines, the largest file in the app) was split into a deep-module triangle:
- **`PclaiCoordinateSpace`** — pure projection math, immutable, no DOM, no events
- **`PclaiChart`** — view layer (DOM construction, dot rendering)
- **`PclaiChartController`** — event wiring, state machine (`{hoveredNodeId, selectedCoordinateKey}`)
- **`pclaiAbsenceCoordinator`** — refcount gatekeeper for 3D absence mode *(removed in #179: absence became selection-relative)*
- **`mountPclaiChart()`** facade — single entry point from `app.ts`

The old singleton `pclaiChartService.js` is deleted. `PclaiCoordinateSpace` is the second service in the app with real unit tests (8 characterization tests in `pclaiCoordinateSpace.test.js`). The deselect toggle (`pclaiWidget:deselect`) cleans up a UX gap at the same time.

### #4 — AnnotationRenderService catch-all: RESOLVED (PR #50)

`annotationRenderService.ts` (436 lines, five unrelated concerns) was split into four focused modules:
- **`AnnotationCoordinateIndex`** (271 lines) — pure bp↔xyz coordinate math, no DOM, no events
- **`AnnotationCanvas`** (172 lines) — canvas rendering, DPR resize, visual feedback, spinner
- **`AnnotationTrackController`** (188 lines) — event bus + DOM mouse wiring, assembly emphasis orchestration
- **`mountAnnotationTrack()`** (44 lines) — facade returning `{coordinateIndex, clear, dispose}`

Also absorbed `annotationTrackUtils.js` (148 lines) into the coordinate index. 19 characterization tests pin coordinate math invariants (monotonicity, flipped-node anchoring, boundary values, roundtrips).

### #1 — Look activation lifecycle: RESOLVED (PR #41)

### #2 — Widget→Look activation path: RESOLVED (PR #43)

### #3 — Dataset loading fan-out: RESOLVED (PR #45)

---

## Roadmap entry still open

*Verified 2026-11-26: none — #5 is resolved.*

### #5 — RibbonLine raycast + material/Z-offset split: RESOLVED (PR #54)

*Verified 2026-11-26:* PR #54 (merged 2026-04-25, closes #53) collapsed `ribbonLine.js`, the node-ribbon parts of `lineFactory.js`, and `lineMaterialResolutionService.js` into a single `src/ribbonNode.ts`. Raycast now reads a module-scope `halfWidth` snapshot instead of material uniforms, and the Z layering constant has one private home. `src/ribbonLine.js` and `lineMaterialResolutionService.js` no longer exist. Original description follows.

`src/ribbonLine.js` (134 lines) raycasts by sampling the spline 48× per pointer move and is tightly bound to shader `halfWidth` uniforms owned by `lineMaterialResolutionService`. PR #41 deleted the Look-side Z-offset half, which was progress.

The `ribbon-mesh` branch is where this ultimately gets resolved. On `main` the raycast / shader-uniform split still exists.

**Severity:** low. The file is small, the behavior is correct, and the `ribbon-mesh` branch will supersede it.

---

## Debt not in the roadmap

### The singleton pattern is everywhere and it blocks testing

Down from six to five singletons after PR #48 deleted `pclaiChartService`:

- `pclaiCoordinateService` — constructor-guard singleton
- `assemblyMetadataService` — constructor-guard singleton
- `frequencyAnalysisService` — constructor-guard singleton
- `materialService` — constructor-guard singleton
- `lineMaterialResolutionService` — constructor-guard singleton

*Verified 2026-11-26 — still open, 4 remain.* `lineMaterialResolutionService` is gone (absorbed into `src/ribbonNode.ts` by PR #54; only a comment there mentions it). `pclaiCoordinateService` (`src/widgets/pclaiCoordinateService.js`) and `assemblyMetadataService` (`src/assemblyMetadataService.ts`) still carry a constructor guard; `frequencyAnalysisService` and `materialService` are module-level instances exported from their files. None has been converted to the plain-class + facade pattern yet. (`eventBus` and `textureService` are also module-level singletons but were never counted here.)

The effect is unchanged:
- Services cannot be instantiated with fresh state.
- They cannot be mocked or replaced for tests.
- They cannot be independently exercised without booting the app.

**Progress note:** PRs #48 and #50 demonstrated the alternative. `PclaiCoordinateSpace` and `AnnotationCoordinateIndex` are plain classes constructed by their facades — no singleton guard, no module-level instance. Both have unit tests. This is the pattern to follow.

**Recommended approach:** same as before — incremental, one service per month. Start with `pclaiCoordinateService` (cleanest internal state), then `assemblyMetadataService`, then `frequencyAnalysisService`. `materialService` and `lineMaterialResolutionService` are tightly coupled to Three.js and can wait.

### TypeScript adoption is stalled in an awkward middle

Current split:
- **43 JS files** (non-test, non-igvCore)
- **19 TS files**

TS file count went from 16 → 19 (the four annotation modules from PR #50 are TS). JS file count went from 40 → 43 (the four PCLAI modules from PR #48 are JS).

*Verified 2026-11-26 — no longer stalled; partly resolved.* Now **59 TS / 40 JS** (non-test, non-igvCore, excluding `env.d.ts`). Most new code is TS — `src/tubemap/` alone is 27 TS files — and `ribbonNode.ts` replaced three JS files. `: any` is down to **94 across 14 TS files**: `app.ts` 18, `populationWidget.ts` 11, `populationOnlyWidget.ts` 11, `annotationCanvas.ts` 8, `looks/look.ts` 7, `annotationTrackController.ts` 7, `pclaiWidget.ts` 4, `assemblyWidget.ts` 4, `mountAnnotationTrack.ts` 3, `nodeEmphasisLook.ts` 2, `heatmapLook.ts` 2, and 1 each in `utils/eventMap.ts`, `assemblyMetadataService.ts`, `annotationCoordinateIndex.ts`. All four JS candidates listed below and the four PCLAI files are still JS.

**99 `: any` annotations across 13 TS files:**
- `app.ts`: 21
- `looks/look.ts`: 19
- `widgets/populationWidget.ts`: 11
- `widgets/populationOnlyWidget.ts`: 11
- `annotationCoordinateIndex.ts`: 8 *(new)*
- `annotationTrackController.ts`: 7 *(new)*
- `annotationCanvas.ts`: 4 *(new)*
- `widgets/assemblyWidget.ts`: 4
- `looks/heatmapLook.ts`: 4
- `mountAnnotationTrack.ts`: 3 *(new)*
- `widgets/pclaiWidget.ts`: 3
- `looks/nodeEmphasisLook.ts`: 3
- `assemblyMetadataService.ts`: 1

The annotation split moved 12 `: any` annotations from one file into four files and added 10 more — a net increase. The typed event bus (PR #37) still can't propagate type guarantees to most consumers.

**Biggest TS candidates among JS files** (updated):
- `pangenomeService.js` (663 lines)
- `raycastService.js` (335 lines)
- `geometryFactory.js` (297 lines)
- `sceneManager.js` (267 lines)
- The four PCLAI triangle files (JS; ~400 lines combined) — these are new, small, and `PclaiCoordinateSpace` is already unit-tested, making it a low-risk conversion

### `globals.*` as a coordination backdoor

29 references across 9 files — unchanged. The PR #50 annotation split routes through `globals.annotationTrack` for the facade handle, adding no new references but not reducing them either.

*Verified 2026-11-26 — still open, worse:* 37 `globals.*` references across 9 files.

**Severity:** low per-site, medium in aggregate.

### Widget DOM construction is imperative and duplicated

**194 direct DOM calls across 16 files** (up from 147 / 14). The increase comes from the PCLAI and annotation splits — DOM construction that was in one file is now spread across dedicated view modules. The duplication across widgets is unchanged.

**Severity:** low. The per-file DOM call counts are smaller and more focused. The absolute increase is structural, not a regression.

*Verified 2026-11-26 — still open.* Widgets still build DOM imperatively. The original counting method wasn't recorded; counting `document.createElement` / `getElementById` / `querySelector(All)`, `.appendChild(` and `.innerHTML` gives 167 across 22 files, which can't be compared directly with 194.

### Event bus typing coverage is incomplete

36 subscribe/publish call sites across 11 files (was 37 / 9). The PCLAI and annotation refactors distributed event subscriptions into their controller modules. The typed-bus guarantee still doesn't propagate to most handlers.

*Verified 2026-11-26 — still open.* 58 `eventBus.subscribe`/`publish` sites across 15 files. More of them are in TS now, but 40 JS files still consume the bus untyped.

---

## Explicitly *not* debt

- **The Look system.** Post-#41 and #43 it is the cleanest subsystem in the app. Don't touch except to add new Looks or new Look parameters.
- **`datasetParser` + `datasetModel`.** Pure and testable; #45 made them the authoritative source for dataset-derived facts. Architectural high point.
- **The event bus itself.** The channel is fine. The gap is consumer-side typing.
- **The widget → Look activation path.** PR #43 settled this.
- **`App.loadDataset` (from #45).** Thin fan-out, correctly placed.
- **The PCLAI triangle.** PR #48 made this the second-cleanest subsystem. `PclaiCoordinateSpace` is pure, tested, and immutable. `PclaiChartController` owns all event state. `pclaiAbsenceCoordinator` is a clean refcount pattern. Leave it. *(The coordinator was later removed in #179, when absence became selection-relative.)*
- **The annotation track modules.** PR #50 followed the same deep-module pattern. `AnnotationCoordinateIndex` is pure and tested. `mountAnnotationTrack()` facade is the entry point. Leave it.

---

## Recommended order for the next round

The two highest-leverage items from the previous assessment (#6 and #4) are done. What remains is more diffuse — no single item is as high-leverage as the PCLAI or annotation splits were. Pick based on what's blocking the next feature.

1. **Break one singleton per month, starting with `pclaiCoordinateService`.**
   - **Why first:** the PCLAI and annotation refactors proved the pattern — plain class + facade + unit tests. Applying it to existing singletons is now a known-quantity operation.
   - **Order suggestion:** `pclaiCoordinateService` → `assemblyMetadataService` → `frequencyAnalysisService`. Save `materialService` and `lineMaterialResolutionService` until `ribbon-mesh` lands.
   - **Risk:** touches every import site. One service per PR.
   - *Verified 2026-11-26: not started.* `pclaiCoordinateService` is still a constructor-guard singleton. `lineMaterialResolutionService` went away with PR #54 rather than through this plan.

2. **Convert the PCLAI triangle files to TypeScript.**
   - **Why:** they're new, small, and `PclaiCoordinateSpace` already has tests pinning behavior. Low-risk conversion that moves the JS/TS balance in the right direction and gives the typed event bus more typed consumers.
   - **Risk:** minimal — four small files, no external consumers beyond `app.ts` and `pclaiWidget.ts`.
   - *Verified 2026-11-26: not done.* All four files are still JS, and together they have grown to about 910 lines (`pclaiChart.js` 357, `mountPclaiChart.js` 319, `pclaiChartController.js` 152, `pclaiCoordinateSpace.js` 82).

3. **Targeted `: any` sweep of `app.ts` (21 occurrences) and `look.ts` (19 occurrences).**
   - **Why:** these two files account for 40 of the 99 `: any` annotations. Typing them properly would let the event bus guarantees propagate through the two most central files in the app.
   - **Risk:** `app.ts` is 545 lines and touches everything; `look.ts` is a base class — changes ripple to subclasses. Needs care but not creativity.
   - *Verified 2026-11-26: partly done.* `look.ts` is down 19 → 7 (the `@types/three` work typed the three.js surfaces) and `app.ts` is down 21 → 18 (`app.ts` is now 623 lines).

---

## Metrics snapshot (2026-04-16)

For comparison at the next assessment. The last column was re-measured 2026-11-26 (same scope: non-test, non-igvCore `src/` files, `env.d.ts` excluded).

| Metric | Value | Delta from 04-14 | 2026-11-26 |
|---|---|---| --- |
| Source files (excluding tests + igvCore) | 62 | +6 | 99 |
| TS files | 19 | +3 | 59 |
| JS files | 43 | +3 | 40 |
| Total source LOC | 10,837 | −104 | 21,865 |
| Largest file | `pangenomeService.js` (663) | was `pclaiChartService.js` (1031) | `tubemap/bandSurface.ts` (1467); largest JS still `pangenomeService.js` (663) |
| `: any` annotations | 99 across 13 TS files | +10 / +3 files | 94 across 14 TS files |
| `globals.*` references | 29 across 9 files | unchanged | 37 across 9 files |
| `eventBus.*` subscribe/publish sites | 36 across 11 files | −1 / +2 files | 58 across 15 files |
| Direct DOM calls | 194 across 16 files | +47 / +2 files | 167 across 22 files (method differs; see above) |
| Service test files | 2 (`pclaiCoordinateSpace`, `annotationCoordinateIndex`) | +2 | 45 non-igvCore test files in all |
| Parser test files | 1 (`datasetParser.test.js`, 37 tests) | unchanged | (included in the 45) |
| igvCore test files | 22 | unchanged | 24 |
| Total passing tests | 220 | +27 | 731 (69 files) |

---

## History

- **2026-04-14** — Initial assessment after PRs #41, #43, #45 landed.
- **2026-04-16** — Updated after PRs #48 (PCLAI triangle split) and #50 (annotation track split). Roadmap entries #4 and #6 marked resolved. Metrics refreshed. Recommendations reordered: singleton pattern and TS conversion are now the top priorities.
- **2026-11-26** — Verified against `src/`. Roadmap #5 marked resolved (PR #54, `src/ribbonNode.ts`). `lineMaterialResolutionService` dropped from the singleton list. Added a `**Status:**` line, inline verification notes per item, and a 2026-11-26 metrics column. The analysis text was left as written.
