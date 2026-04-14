# Code Architecture Improvements

A working list of deepening opportunities (Ousterhout sense: small interface, large implementation) surfaced by an architectural friction walk of the PGB codebase. Each entry names a cluster, why its seams are awkward today, and what would become testable if it were deepened.

The meta-pattern across all six: **event-bus-mediated coordination where the command logic lives inside subscription callbacks**. No explicit command objects, no transaction semantics. Questions like *"if assembly A is emphasized and PCA coordinate K is selected, what should the visual state be?"* are not directly testable today — the answer is spread across several `on(...)` handlers with implicit ordering.

---

## Guiding philosophy — Looks as shade trees

Every entry in this document is subordinate to the following philosophy. Refactor proposals that violate it should be rejected regardless of how clean they look on paper.

**Intellectual lineage.** PGB's visual architecture is modeled on Rob Cook's shade trees and the RenderMan-era shader model developed at ILM / Pixar in the 1980s. In that model, appearance authorship belongs in a small, self-contained unit — the shader — that is *allowed to grow rich* in exchange for the rest of the pipeline staying simple. Complexity is managed by **offloading it into a library of shaders**, not by wrapping the library in coordinators.

**How this maps to PGB.** A `Look` is a "shader" in this conceptual sense (not the GL sense). `NodeEmphasisLook`, `HeatmapLook`, and future looks are entries in PGB's shader library. Each one owns its materials, its emphasis semantics, and the user interactions that drive its appearance. The Look system is the heart and soul of the app and is where visual complexity is *meant* to accumulate.

**Consequences for refactoring.**

- **Deepen Looks; do not decompose them.** If a Look is getting larger because it's absorbing appearance logic, that is the architecture working correctly. Growth *inside* a Look is fine; growth in the negotiation *between* Looks and the rest of the app is the smell.
- **Reject refactors that pull logic out of Looks into generic coordinators, reducers, command pipelines, or hexagonal cores.** These inversions take appearance ownership away from the shader library and hand it to a scene graph telling shaders what to be — the opposite of a shade tree. An earlier RFC draft in #40 proposed exactly this and was rejected in review. Entry #2 below was reframed for the same reason.
- **New visualizations are new Looks or new Look parameters — never ad-hoc hacks outside the framework.** The genomics collaborators this app serves regularly request new visualization modes. Each request should be met by either creating a new Look subclass or introducing new uniforms/parameters on an existing one.
- **A Look's subscribed events are its parameter-binding interface.** Analogous to the uniforms a RenderMan shader declares. "What can this Look be driven by?" should be answerable by reading the Look's `activate()` body — not by tracing a command bus.
- **The Look surface must remain the easiest part of the system to manipulate, extend, and alter.** Minimal needless abstraction around it. If a proposed change makes Looks harder to write or harder to reason about locally, it is the wrong change even if it improves some other metric.

---

## 1. Look + Scene activation lifecycle — ✅ COMPLETED (PR #41)

**Landed in PR #41** (merged; closed issue #40). Approach: **deepening, not decomposition.** An earlier RFC draft proposed a hexagonal core with a reducer/controller pipeline — that direction was rejected in review because it took appearance-authorship ownership away from Looks, which is the opposite of the shade-tree philosophy laid out above.

**What changed:**
- **Broke the Look → SceneManager → LookManager → Look cycle.** `LookManager` now hands the scene in via `Look.activate(scene)`; Looks no longer carry a `sceneManager` field. `Look.deactivate()` nulls `activeScene`, making stale-scene bugs across dataset swaps structurally impossible.
- **Lifted subscription lifecycle into the `Look` base class.** New protected `subscribe<K>(event, handler)` helper records unsubscribes; `Look.deactivate()` drains them. `NodeEmphasisLook` and `HeatmapLook` dropped their per-subclass unsub bookkeeping and `deactivate()` overrides (−71 lines).
- **Collapsed `setNodeEmphasis` + `setNodeAbsence` into one method.** Signature: `setNodeEmphasis(assembly, emphasizedSet, color, absentSet, deemphasisColor)`. The remainder-bucket rule (deemphasized if anything is emphasized, normal otherwise) moved inside the method.
- **Deleted state-aware Z-offset machinery entirely.** `NODE_LINE_DEEMPHASIS_Z_OFFSET`, `NodeEmphasisLook.getZOffset()`, `Look.getZOffset()`, `Look.updateGeometryPositions()` — all gone (−70 lines). Replaced by a single `mesh.renderOrder` integer per mesh, which guarantees emphasized nodes paint on top without Z-buffer games.

**Net diff:** roughly −150 / +30 lines. No new files, no new abstractions, no new tests.

**Lesson worth preserving:** each change followed the same shape — find a piece of knowledge that callers had to hold and push it *into* the module. Circular refs, cleanup bookkeeping, emphasis-vs-absence branching, Z-offset coordination — all were things the outside had to understand. After #41 they're things only `Look` understands. Deepening here did *not* mean "introduce a state-machine object" — it often meant "delete the negotiation and let `Look` own the concept outright." Apply this pattern to future Look work.

---

## 2. Active-Look selection (reframed)

**Files:**
- `src/widgets/widgetService.js` (~150 lines)
- `src/looks/lookManager.js`
- `src/widgets/assemblyWidget.ts` (~314 lines)
- `src/widgets/pcaWidget.ts` (~256 lines)
- `src/widgets/populationWidget.ts` (~218 lines)

**Framing note — this entry was reframed after PR #41.** The original version lumped two different problems together and proposed an `ActivateWidgetCommand` coordinator. That proposal is **rejected** for the same reason the hexagonal-core RFC was rejected in #40: it would pull shader-parameter logic into a generic command layer and leave Looks as passive recipients, which inverts the shade-tree philosophy above.

**The cluster actually contains two problems — only one is a real deepening opportunity:**

### Problem A — Shader selection (the real opportunity)
"Which Look is bound right now?" has no single owner today. The answer is implicit in the chain: button click → widget event → `widgetService` → `globals.app.setActiveScene()` → `lookManager` activates look. No module owns "active Look" as a first-class concept.

**Deepening move:** give `LookManager` direct ownership via a method like `lookManager.activate(lookName)`. Widgets (or `widgetService` on their behalf) call it directly. No command objects, no coordinator class, no new abstraction layer — just `LookManager` absorbing a concept that's currently diffused across event wiring. This is the same shape as the PR #41 changes: a deepening of one existing module, not a new one.

### Problem B — Shader parameterization (leave alone, on purpose)
`AssemblyWidget` publishes `assembly:emphasis` → `NodeEmphasisLook` consumes it. `PCAWidget` publishes coordinate selections → same Look consumes them. Under the shade-tree lens, **this is not a smell — it is the architecture working correctly.** Widgets are the parameter panel for the active shader; a parameter panel talking to its shader is the whole point.

**Instead of refactoring this away, formalize it.** Document that a Look's subscribed events *are* its parameter-binding interface — analogous to the uniforms a RenderMan shader declares. "What can this Look be driven by?" should be answered by reading the Look's `activate()` body, not by tracing a command bus. A short doc block on each concrete Look listing the events it binds to would make this explicit without touching code structure.

**Test surface that would shrink (revised):** once Problem A is fixed, widget tests only need to stub the event bus — they can assert on the parameter events directly, which is what you want to test anyway. No coordinator is needed to get that win.

---

## 3. Dataset loading + service fan-out

**Files:**
- `src/datasetParser.ts` (~337 lines)
- `src/datasetModel.ts`
- `src/widgets/pclaiCoordinateService.js`
- `src/assemblyMetadataService.ts` (~200 lines)
- `src/geometryFactory.*`
- `src/frequencyAnalysisService.*`

**Cluster / concept co-owned:** post-parse initialization of every service that indexes the dataset.

**Why the seams are awkward:**
- The parsed `DatasetModel` is hand-fed to 5+ services, each calling its own `loadMetadata` / `loadCoordinates`.
- Multiple services iterate `dataset.nodes` independently with overlapping access logic.
- No orchestrator — callers must remember which services to initialize and in what order.
- No tests verify the post-load invariant that all services are consistent with each other.

**Test surface that would shrink:** a single boundary test — "given dataset D, all services report a consistent view of it" — replaces ad-hoc per-service init tests.

**Leverage note:** cleanest pure win if the goal is low-risk deepening. Also connects to the V2 ingestion redesign work.

---

## 4. AnnotationRenderService catch-all

**File:** `src/annotationRenderService.ts` (~435 lines)

**Cluster / concept co-owned:** everything about annotation tracks — data load, DOM layout, canvas resize, event subscriptions, feature rendering, and derived indices (`bpIndex`, `splineParameterMap`).

**Why the seams are awkward:**
- One class owns at least five concerns.
- `setupEventBusSubscriptions()` subscribes to 5 different events (`lineIntersection`, `clearIntersection`, `population:selected`, …) with no documented contract about firing order or invariants.
- Derived indices must rebuild on dataset change, but rebuild logic is scattered across methods.

**Test surface that would shrink:** split index-building (pure) from rendering (DOM/canvas). The pure index builder becomes trivially testable; the render layer gets tested against a fake index.

---

## 5. RibbonLine raycast + material/Z-offset split

**Files:**
- `src/ribbonLine.js`
- `src/looks/look.ts`
- `src/lineMaterialResolutionService.js` (~52 lines)
- `src/geometryFactory.*`

**Cluster / concept co-owned:** the geometric and visual identity of a ribbon node (raycast hit-testing, shader uniforms, Z-offset, material lifecycle).

**Why the seams are awkward:**
- `RibbonLine.raycast()` samples the spline 48+ times per pointer move and is tightly bound to the shader's `halfWidth` uniform — but that uniform is managed by `lineMaterialResolutionService`.
- Z-offset logic split between `GeometryFactory.NODE_LINE_Z_OFFSET` / `NODE_LINE_DEEMPHASIS_Z_OFFSET` constants and Look's `getZOffset()` override.
- Material cache in Look is cleared at disposal, but there's no way to verify all materials are unregistered from the resolution service.

**Test surface that would shrink:** pointer-hit tests can run without the resolution service; disposal-leak invariants become assertable.

---

## 6. PCA triangle

**Files:**
- `src/widgets/pcaWidget.ts` (~256 lines)
- `src/widgets/pclaiCoordinateService.js` (~200 lines)
- `src/widgets/pcaChartService.js` (~1000 lines)

**Cluster / concept co-owned:** PCA visualization — key list, coordinate-space bookkeeping, 2D scatter rendering.

**Why the seams are awkward:**
- Three modules interact; `pclaiCoordinateService` holds the bounding box, color maps, and absence set, but only `pcaChartService` uses the bbox for scaling.
- `pclaiCoordinateService` also computes `nodeColorMapForCoordinateKey`, passed to Look's emphasis methods — the data flow `nodeId → coordinateKey → color → mesh material` is hard to trace.
- Chart coord-space sync with the coordinate service currently requires rendering the full chart DOM to verify.

**Test surface that would shrink:** a deepened coord service could be tested headlessly; the chart becomes a thin renderer over a trusted coord-space object.

---

## How to use this document

When you want to do a refactor, pick one cluster and invoke `/improve-codebase-architecture` pointing at it — the skill will frame the problem space, spawn parallel interface designs, and land on a GitHub issue RFC. Entries are independent; they can be taken in any order. #1 is done (PR #41); #3 remains the lowest-risk standalone win.

**Philosophy constraint on all remaining entries:** PGB is built on a shade-tree model of appearance (Rob Cook / RenderMan lineage). Looks are conceptual shaders; the Look system is where visual complexity is *meant* to accumulate. Refactors that pull logic *out* of Looks into generic coordinators, reducers, or command pipelines should be rejected by default — that's the move that was rejected in #40 and reframed in #2. Deepen existing modules instead of introducing coordinator layers around them.
