# Technical Debt Assessment

**Date:** 2026-04-16 (updated)
**Context:** Updated after PRs #48 and #50 landed — completing roadmap entries #6 (PCA triangle) and #4 (AnnotationRenderService catch-all). The original assessment was written 2026-04-14 after PRs #41, #43, and #45. All five roadmap entries that had clear refactors (#1–#4, #6) are now resolved.

**Overall level:** low-to-moderate. The five deepenings (#41, #43, #45, #48, #50) eliminated every architectural smell that was diagnosed in the original roadmap. What remains is structural: a singleton pattern blocking test coverage, a TypeScript adoption that stalled in an awkward middle, and a `globals.*` coordination backdoor. None of these are worsening, but they limit the ability to add features confidently and write tests cheaply.

---

## Roadmap entries — resolved

### #6 — PCA triangle: RESOLVED (PR #48)

`pcaChartService.js` (1031 lines, the largest file in the app) was split into a deep-module triangle:
- **`PcaCoordinateSpace`** — pure projection math, immutable, no DOM, no events
- **`PcaChart`** — view layer (DOM construction, dot rendering)
- **`PcaChartController`** — event wiring, state machine (`{hoveredNodeId, selectedCoordinateKey}`)
- **`pcaAbsenceCoordinator`** — refcount gatekeeper for 3D absence mode
- **`mountPcaChart()`** facade — single entry point from `app.ts`

The old singleton `pcaChartService.js` is deleted. `PcaCoordinateSpace` is the second service in the app with real unit tests (8 characterization tests in `pcaCoordinateSpace.test.js`). The deselect toggle (`pcaWidget:deselect`) cleans up a UX gap at the same time.

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

### #5 — RibbonLine raycast + material/Z-offset split

`src/ribbonLine.js` (134 lines) raycasts by sampling the spline 48× per pointer move and is tightly bound to shader `halfWidth` uniforms owned by `lineMaterialResolutionService`. PR #41 deleted the Look-side Z-offset half, which was progress.

The `ribbon-mesh` branch is where this ultimately gets resolved. On `main` the raycast / shader-uniform split still exists.

**Severity:** low. The file is small, the behavior is correct, and the `ribbon-mesh` branch will supersede it.

---

## Debt not in the roadmap

### The singleton pattern is everywhere and it blocks testing

Down from six to five singletons after PR #48 deleted `pcaChartService`:

- `pclaiCoordinateService` — constructor-guard singleton
- `assemblyMetadataService` — constructor-guard singleton
- `frequencyAnalysisService` — constructor-guard singleton
- `materialService` — constructor-guard singleton
- `lineMaterialResolutionService` — constructor-guard singleton

The effect is unchanged:
- Services cannot be instantiated with fresh state.
- They cannot be mocked or replaced for tests.
- They cannot be independently exercised without booting the app.

**Progress note:** PRs #48 and #50 demonstrated the alternative. `PcaCoordinateSpace` and `AnnotationCoordinateIndex` are plain classes constructed by their facades — no singleton guard, no module-level instance. Both have unit tests. This is the pattern to follow.

**Recommended approach:** same as before — incremental, one service per month. Start with `pclaiCoordinateService` (cleanest internal state), then `assemblyMetadataService`, then `frequencyAnalysisService`. `materialService` and `lineMaterialResolutionService` are tightly coupled to Three.js and can wait.

### TypeScript adoption is stalled in an awkward middle

Current split:
- **43 JS files** (non-test, non-igvCore)
- **19 TS files**

TS file count went from 16 → 19 (the four annotation modules from PR #50 are TS). JS file count went from 40 → 43 (the four PCA modules from PR #48 are JS).

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
- `widgets/pcaWidget.ts`: 3
- `looks/nodeEmphasisLook.ts`: 3
- `assemblyMetadataService.ts`: 1

The annotation split moved 12 `: any` annotations from one file into four files and added 10 more — a net increase. The typed event bus (PR #37) still can't propagate type guarantees to most consumers.

**Biggest TS candidates among JS files** (updated):
- `pangenomeService.js` (663 lines)
- `raycastService.js` (335 lines)
- `geometryFactory.js` (297 lines)
- `sceneManager.js` (267 lines)
- The four PCA triangle files (JS; ~400 lines combined) — these are new, small, and `PcaCoordinateSpace` is already unit-tested, making it a low-risk conversion

### `globals.*` as a coordination backdoor

29 references across 9 files — unchanged. The PR #50 annotation split routes through `globals.annotationTrack` for the facade handle, adding no new references but not reducing them either.

**Severity:** low per-site, medium in aggregate.

### Widget DOM construction is imperative and duplicated

**194 direct DOM calls across 16 files** (up from 147 / 14). The increase comes from the PCA and annotation splits — DOM construction that was in one file is now spread across dedicated view modules. The duplication across widgets is unchanged.

**Severity:** low. The per-file DOM call counts are smaller and more focused. The absolute increase is structural, not a regression.

### Event bus typing coverage is incomplete

36 subscribe/publish call sites across 11 files (was 37 / 9). The PCA and annotation refactors distributed event subscriptions into their controller modules. The typed-bus guarantee still doesn't propagate to most handlers.

---

## Explicitly *not* debt

- **The Look system.** Post-#41 and #43 it is the cleanest subsystem in the app. Don't touch except to add new Looks or new Look parameters.
- **`datasetParser` + `datasetModel`.** Pure and testable; #45 made them the authoritative source for dataset-derived facts. Architectural high point.
- **The event bus itself.** The channel is fine. The gap is consumer-side typing.
- **The widget → Look activation path.** PR #43 settled this.
- **`App.loadDataset` (from #45).** Thin fan-out, correctly placed.
- **The PCA triangle.** PR #48 made this the second-cleanest subsystem. `PcaCoordinateSpace` is pure, tested, and immutable. `PcaChartController` owns all event state. `pcaAbsenceCoordinator` is a clean refcount pattern. Leave it.
- **The annotation track modules.** PR #50 followed the same deep-module pattern. `AnnotationCoordinateIndex` is pure and tested. `mountAnnotationTrack()` facade is the entry point. Leave it.

---

## Recommended order for the next round

The two highest-leverage items from the previous assessment (#6 and #4) are done. What remains is more diffuse — no single item is as high-leverage as the PCA or annotation splits were. Pick based on what's blocking the next feature.

1. **Break one singleton per month, starting with `pclaiCoordinateService`.**
   - **Why first:** the PCA and annotation refactors proved the pattern — plain class + facade + unit tests. Applying it to existing singletons is now a known-quantity operation.
   - **Order suggestion:** `pclaiCoordinateService` → `assemblyMetadataService` → `frequencyAnalysisService`. Save `materialService` and `lineMaterialResolutionService` until `ribbon-mesh` lands.
   - **Risk:** touches every import site. One service per PR.

2. **Convert the PCA triangle files to TypeScript.**
   - **Why:** they're new, small, and `PcaCoordinateSpace` already has tests pinning behavior. Low-risk conversion that moves the JS/TS balance in the right direction and gives the typed event bus more typed consumers.
   - **Risk:** minimal — four small files, no external consumers beyond `app.ts` and `pcaWidget.ts`.

3. **Targeted `: any` sweep of `app.ts` (21 occurrences) and `look.ts` (19 occurrences).**
   - **Why:** these two files account for 40 of the 99 `: any` annotations. Typing them properly would let the event bus guarantees propagate through the two most central files in the app.
   - **Risk:** `app.ts` is 545 lines and touches everything; `look.ts` is a base class — changes ripple to subclasses. Needs care but not creativity.

---

## Metrics snapshot (2026-04-16)

For comparison at the next assessment.

| Metric | Value | Delta from 04-14 |
|---|---|---|
| Source files (excluding tests + igvCore) | 62 | +6 |
| TS files | 19 | +3 |
| JS files | 43 | +3 |
| Total source LOC | 10,837 | −104 |
| Largest file | `pangenomeService.js` (663) | was `pcaChartService.js` (1031) |
| `: any` annotations | 99 across 13 TS files | +10 / +3 files |
| `globals.*` references | 29 across 9 files | unchanged |
| `eventBus.*` subscribe/publish sites | 36 across 11 files | −1 / +2 files |
| Direct DOM calls | 194 across 16 files | +47 / +2 files |
| Service test files | 2 (`pcaCoordinateSpace`, `annotationCoordinateIndex`) | +2 |
| Parser test files | 1 (`datasetParser.test.js`, 37 tests) | unchanged |
| igvCore test files | 22 | unchanged |
| Total passing tests | 220 | +27 |

---

## History

- **2026-04-14** — Initial assessment after PRs #41, #43, #45 landed.
- **2026-04-16** — Updated after PRs #48 (PCA triangle split) and #50 (annotation track split). Roadmap entries #4 and #6 marked resolved. Metrics refreshed. Recommendations reordered: singleton pattern and TS conversion are now the top priorities.
