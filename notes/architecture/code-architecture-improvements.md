# Code Architecture Improvements

A working list of deepening opportunities (Ousterhout sense: small interface, large implementation) surfaced by an architectural friction walk of the PGB codebase. Each entry names a cluster, why its seams are awkward today, and what would become testable if it were deepened.

The meta-pattern across all six: **event-bus-mediated coordination where the command logic lives inside subscription callbacks**. No explicit command objects, no transaction semantics. Questions like *"if assembly A is emphasized and PCA coordinate K is selected, what should the visual state be?"* are not directly testable today — the answer is spread across several `on(...)` handlers with implicit ordering.

---

## 1. Look + Scene activation lifecycle

**Files:**
- `src/looks/look.ts` (~430 lines — sprawling `updateNodeEmphasis`, `setNodeEmphasis`, `applyEmphasisState`)
- `src/looks/lookManager.js`
- `src/sceneManager.js` (~268 lines)

**Cluster / concept co-owned:** the emphasis state machine (normal / emphasized / deemphasized / absent) and scene lifecycle.

**Why the seams are awkward:**
- Bidirectional dependency chain: Look → SceneManager → LookManager → Look.
- Each Look holds a `sceneManager` reference and directly traverses the scene's `NodeMeshGroup` to mutate materials.
- Emphasis transitions live on Look but are driven from 5+ unrelated event handlers (assembly, PCA widget, population, hover, …).
- Z-offset logic is split between `GeometryFactory` constants and Look's `getZOffset()` override.

**Test surface that would shrink:** today you need a full scene graph to unit-test emphasis transitions. A deepened state-machine object would let you test transitions as pure functions and separately verify that a single adapter applies them to meshes.

**Leverage note:** deepening this naturally shrinks clusters #2 and #6. Highest-leverage candidate.

---

## 2. Widget event coordination hub

**Files:**
- `src/widgets/widgetService.js` (~150 lines)
- `src/widgets/assemblyWidget.ts` (~314 lines)
- `src/widgets/pcaWidget.ts` (~256 lines)
- `src/widgets/populationWidget.ts` (~218 lines)

**Cluster / concept co-owned:** "which widget is active, and what scene/look should be showing as a result."

**Why the seams are awkward:**
- Flow is circular: button click → widget event → widgetService → `globals.app.setActiveScene()` → lookManager activates look → look subscribes to event.
- Several widgets also directly manipulate scene state (e.g., AssemblyWidget publishes `assembly:emphasis` which NodeEmphasisLook listens to).
- No single module owns "scene selection" — it's implicit in the event wiring.

**Test surface that would shrink:** an explicit coordinator / command boundary (e.g., `ActivateWidgetCommand`) replaces brittle per-widget tests that currently have to stub the event bus, scene manager, and look manager together.

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

When you want to do a refactor, pick one cluster and invoke `/improve-codebase-architecture` pointing at it — the skill will frame the problem space, spawn parallel interface designs, and land on a GitHub issue RFC. Entries are independent; they can be taken in any order, though #1 has the most downstream leverage and #3 is the lowest-risk standalone win.
