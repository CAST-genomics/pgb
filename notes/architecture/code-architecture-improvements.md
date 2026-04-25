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

## 2. Active-Look selection — ✅ COMPLETED (PR #43, closes #42)

**Landed in PR #43.** Deepening of `widgetService`, not decomposition — no `ActivateWidgetCommand`, no coordinator class, no reducer, no state machine. An earlier RFC draft proposed exactly that kind of command-layer inversion and was rejected for the same reason the hexagonal-core RFC in #40 was rejected: it would pull shader-parameter logic into a generic layer and leave Looks as passive recipients, inverting the shade-tree philosophy.

**What changed:**
- **`widgetService.activateLook(sceneName)`** — new widget-facing entry point. All 4 internal call sites in `widgetService.js` routed through it.
- **`populationWidget.ts` / `populationOnlyWidget.ts`** — previously called `globals.app!.setActiveScene(...)` directly, bypassing the coordinator. Now go through `globals.widgetService.activateLook(...)` (8 call sites total). The "widgets never call `app.setActiveScene()` directly" invariant is now enforceable by reading one file.
- **`app.setActiveScene()` intact** — the issue draft originally claimed it could be deleted; during implementation it turned out to own three app-level concerns only `App` can see: animation loop control, scene + renderer + camera wiring (`sceneManager.setActiveScene` + `renderer.compile`), and per-scene raycast visual-feedback installation. Bootstrap and data-load paths legitimately need all three, so they continue to call it directly. `widgetService.activateLook()` is a thin facade that delegates to `globals.app.setActiveScene(name, true)` — its job is to be the **one place** widgets go.
- **Shader-parameter events formalized, not refactored away** — doc blocks added to `NodeEmphasisLook` and `HeatmapLook` listing each Look's subscribed events and what they drive. These events are the Look's "shader uniforms" under the shade-tree model — the parameter-binding interface widgets use to manipulate appearance. Goal: "what can this Look be driven by?" is answerable by reading the Look file alone.

**Lesson worth preserving:** the cluster had two problems that looked identical from the outside — "widget X calls Y which calls Z" is a smell either way — but only one was real. Problem A (no single owner of widget-side Look activation) was a deepening opportunity. Problem B (widget → Look parameter events) *looked* like a smell but was the architecture working correctly: widgets are the parameter panel for the active shader, and the event bus is how parameters bind. The fix for A (`widgetService.activateLook`) and the non-fix for B (doc blocks on Looks) both landed in the same PR because they belong to the same reframing. When something looks like a coupling smell, ask whether it's actually a *parameter interface* before wrapping it in a coordinator.

---

## 3. Dataset loading + service fan-out — ✅ COMPLETED (PR #45, closes #44)

**Landed in PR #45.** Deepening, not decomposition — no coordinator/reducer/command layer was introduced.

**What changed:**
- **`DatasetIndex` sub-object on `DatasetModel`** — populated once by `datasetParser` in a single post-normalization traversal. Contains pclai bounding box, coordinate-key union, absent-node set, assembly totals, and data-presence flags. Pure data; no THREE, no event bus, no DOM. 5 new parser tests cover v1 + v2 invariants.
- **Services stopped re-traversing `dataset.nodes`** — `pclaiCoordinateService`, `assemblyMetadataService`, and the pre-refactor `pcaChartService` now read from the index instead. `pclaiCoordinateService` keeps only its runtime THREE.Color map construction; `assemblyMetadataService` dropped its count-sum loop and unused per-node field; `pcaChartService.initializeGlobalBoundingBox` now starts from the dataset bbox and widens with reference data. Accessor surfaces unchanged, net −72 lines.
- **`App.loadDataset(dataset)`** — `App.processData` delegates the entire data-side fan-out to this new method. Ordering among `pangenomeService`, `assemblyMetadataService`, `pclaiCoordinateService`, `pcaChartService`, `genomicService`, and `widgetService` is owned by `loadDataset` instead of spread across `processData`'s recipe. Geometry creation, scene activation, camera fitting, and animation control stay in `processData`.

**Lesson worth preserving:** the win came from pushing the *computation* (index building) up into the parser and leaving the *runtime state* (Three.js colors, etc.) in the services. Callers outside `App` saw no change — the accessor surfaces on the three services returned the same values, only their provenance moved. When a cluster has multiple independent traversals over the same shape, the fix is usually "compute it once in the thing that already knows the shape," not "introduce a coordinator."

---

## 4. AnnotationRenderService catch-all — ✅ COMPLETED (PR #50, closes #49)

**Landed in PR #50.** The 436-line `AnnotationRenderService` catch-all was split into three collaborators behind a `mountAnnotationTrack()` facade — the same kernel → view → controller pattern that landed in PR #48 for the PCA triangle.

**What changed:**
- **`AnnotationCoordinateIndex`** (phase 1) — pure bp↔xyz coordinate-mapping class. Absorbs the five functions from `annotationTrackUtils.js` as private implementation. Owns `bpIndex`, `bpIndexMap`, `endpointMap`, `splineParameterMap`. Public methods: `build(spine, sceneManager)`, `getTrackParamFromLineIntersection(nodeName, t)`, `getXYZFromTrackParam(param, sceneManager)`. Pinned by 19 characterization tests: lifecycle, build invariants, splineParameterMap monotonicity, flipped-node endpoint anchoring, boundary values, roundtrip monotonicity.
- **`AnnotationCanvas`** (phase 2) — owns the canvas element, DPR-aware resize, two rendering modes (IGVCore gene annotations or extent tick marks), visual feedback element positioning, and spinner. No event bus import, no coordinate math.
- **`AnnotationTrackController`** (phase 3) — owns all four event bus subscriptions (`assembly:emphasis`, `assembly:normal`, `lineIntersection`, `clearIntersection`) and the three DOM mouse handlers. Orchestrates the assembly emphasis lifecycle: build index → load genome → delegate rendering to canvas.
- **`mountAnnotationTrack()` facade** (phase 4) — replaces the `AnnotationRenderService` class. Returns `{coordinateIndex, clear, dispose}`. `main.js` constructs it; `app.ts` calls `clear()` on dataset swap. `annotationRenderService.ts` deleted.

**Files deleted:** `src/annotationRenderService.ts` (436 lines), `src/utils/annotationTrackUtils.js` (148 lines).

**Net diff:** +1007 / −588 lines. All 220 tests pass (201 existing + 19 new characterization tests).

**Lesson worth preserving:** the refactor was staged as five independently committable phases, each keeping the app working. Phase 1 (pure coordinate index) was the highest-value change — the coordinate math that was previously scattered across six instance fields and multiple methods became a single testable class. The `coordinateIndex` is exposed read-only on the facade handle, making it available to future consumers (tooltips, search-to-3D navigation) without touching annotation rendering internals.

See also: [annotation-track-interaction.md](./annotation-track-interaction.md) for full sequence diagrams.

---

## 5. RibbonLine raycast + material lifecycle — ✅ COMPLETED (PR #54, closes #53)

**Landed in PR #54.** Three shallow modules (`ribbonLine.js`, the node-ribbon parts of `lineFactory.js`, and `lineMaterialResolutionService.js`) collapsed into a single deepened module, `src/ribbonNode.ts`. Two entry points across the cluster: `RibbonNode.create(geometry, spline, material)` and `tickRibbonResolution({camera, container})`. Look stopped touching geometry construction, material registration, and Z wiring.

**What changed:**

- **Single source of truth for node Z.** `NODE_Z_OFFSET = -8` is now a private module-scope constant inside `ribbonNode.ts`. It's baked into vertex positions by `buildNodeRibbonGeometry` and read back by `raycast()` and `getPoint()` from the same place. The previous three-way duplication (geometry positions ↔ `mesh.userData.zOffset` ↔ raycast read) is gone. `userData.zOffset` is no longer written or read by anyone. Z drift between geometry and hit-testing is now structurally impossible.
- **Raycast severed from shader uniforms.** `RibbonNode.raycast()` reads a module-scope `lastHalfWidth` snapshot updated by `tickRibbonResolution()` per frame, **not** `material.uniforms.halfWidth.value`. Hit-testing no longer depends on the per-frame uniform tick having run, and unit tests can set the snapshot directly via an `__setHalfWidthForTests(v)` hook.
- **Registration moved from Look to RibbonNode.** Look's four material getters (`getNodeRibbonMaterial / Emphasis / Deemphasis / Absence`) lost their `lineMaterialResolutionService.registerRibbonMaterial(...)` calls. Registration is now a side effect of `RibbonNode.create()` — the registry tracks **nodes**, not materials, and the per-frame tick walks `node.material.uniforms.halfWidth` for whatever material is currently bound. Material swaps during emphasis transitions are picked up automatically on the next frame.
- **Disposal-leak invariants are assertable.** `RibbonNode.registeredCount` exposes the live count. `Look.dispose()` lost its manual unregister loop — the `clearRibbonRegistry()` bulk-clear at dataset reload (called from `App.clearCurrentData()`) drops the whole set. Tests verify `create → dispose → count === 0`, idempotent `dispose`, and bulk-clear semantics.
- **Vestigial `Look.zOffset` field deleted.** Dead code from PR #41's deletion pass.

**Net diff:** −530 lines (12 files changed, 3 deleted, 1 new TS module). 229/229 tests pass — 5 new boundary tests cover Z source-of-truth (`getPoint(u).z === NODE_Z_OFFSET`; geometry vertex z values) and registration lifecycle. Typecheck and Vite build clean.

**Status note on the original framing:** when this entry was first drafted, sub-bullet #2 called out "Z-offset logic split between `GeometryFactory` constants and Look's `getZOffset()` override." That split no longer existed by the time the refactor began — PR #41 had already deleted `NODE_LINE_DEEMPHASIS_Z_OFFSET`, `Look.getZOffset()`, and `Look.updateGeometryPositions()`, replacing state-aware Z-offset with `mesh.renderOrder`. The entry was reframed before issue filing to focus on the actual remaining smells (raycast/uniform coupling, three-way Z duplication, vestigial field, leak verifiability). Lesson: re-walk a friction cluster against the current code before drafting an RFC; doc entries from a prior cluster review can be partially stale.

**Lesson worth preserving:** three competing designs were evaluated in parallel before filing — minimal-interface merge, profile/registry with extension seams, and a `RibbonLine.fromSpline` factory that also restructured Look's material-cache. The minimal-interface design won because it solved the headline cluster (geometry/raycast/uniform/Z) with the smallest blast radius and left Look's appearance authority untouched per the shade-tree philosophy. The "expose a registered-count introspection getter for leak tests" idea was cherry-picked from the factory design. *Reject scope expansion that touches Look's material-cache architecture* — that's a separate question about emphasis transitions (cached materials vs. uniform mutation) that deserves its own RFC if it's ever justified.

**Implementation discovery worth recording:** the issue spec named `RibbonNode.create(spline, material)` (geometry built inside `create`), but `GeometryFactory` builds geometries once per dataset and shares them across multiple scene/look pairs. Per-call construction would multiply node-geometry CPU cost by the number of looks. The interface adjusted to `RibbonNode.create(geometry, spline, material)` with the geometry builder exposed as a standalone `buildNodeRibbonGeometry(spline)` for `GeometryFactory` to call — preserving the share-geometry pattern without disturbing the deepening goal.

---

## 6. PCA triangle — ✅ COMPLETED (PR #48, closes #46 and #47)

**Landed in PR #48.** The 970-line `pcaChartService.js` singleton was split into a four-part deep-module structure and then a long-standing event-wiring bug (#47) was fixed on top of the new shape.

**What changed:**
- **`PcaCoordinateSpace`** (phase 1) — pure, immutable projection math. `project(x, y) → {left, top, size}` with per-axis linear scaling, padding, and edge clamping. Pinned by 8 characterization tests retargeted from the pre-refactor jsdom tests — no DOM, no singleton, no fetch stub, runs in ~3ms.
- **`PcaChart`** (phases 2 + 3b) — owns the chart surface, axes, dataset dots, and reference dots. Knows nothing about the event bus, the dataset model, or the card chrome. Hover emphasis and reference desaturation live here.
- **`PcaChartController`** (phases 3a + 3d) — owns event subscriptions and interaction state. Reshaped in 3d into a small state machine: every handler updates `{hoveredNodeId, selectedCoordinateKey}` and calls a single `render()` path, so the rendered chart is a pure function of that state.
- **`mountPcaChart()` facade** (phase 3c) — replaces the auto-instantiating `pcaChartService` singleton. `App` constructs it explicitly in its constructor and stores the handle as `this.pcaChart`. `pcaChartService.js` was deleted.
- **`pcaAbsenceCoordinator`** (phase 3d) — tiny refcount gatekeeper for the 3D graph's absence mode. Both the PCA widget card and the PCA chart panel `acquire`/`release` through it, so presenting either one paints absence and absence stays visible until the last presenter is dismissed. Previously, dismissing the widget while the chart was still open would wipe the absence state the chart still needed.
- **`pcaWidget:deselect` event** — new event the widget fires when the user re-clicks the already-selected coordinate key. The controller subscribes to it and clears `selectedCoordinateKey`, which (via the pure `render()` path) returns the chart to idle. This fixes the toggle-off half of #47.
- **`pcaWidget.reset()` narrowed** — now only clears emphasis for the previously-selected key instead of all nodes, so it no longer stomps absence state another presenter still needs. *(Follow-up: this narrowing was too aggressive — it left the deemphasized-remainder painted when the widget was dismissed without a prior deselect. Fixed in PR #55 by making `reset()` mimic the deselect path: fire `pcaWidget:absence` to collapse `emphasized + deemphasized` to `normal-remainder` while keeping absent painted, then let `hideCard()`'s `releaseAbsence` finish the job. Reset must run before hideCard for the absence release to land on a graph that's already in absence-only state.)*

**Net diff:** roughly +1170 / −1040 lines across the branch. `pcaChartService.js` deleted (−1031). All 201 tests pass; new characterization tests added for `PcaCoordinateSpace`.

**Lesson worth preserving:** the refactor was staged as *characterize → split → visually confirm* across seven independently committable phases (1, 2, 3a, 3b, 3c, 3d plus the pre-refactor characterization). Each phase was bug-for-bug identical to the one before it, except the explicitly-scoped bug fix in 3d. This let the RFC's scope stay small at every step — the #47 fix was deferred until after the controller had been pulled out, so the fix landed in the right module on day one without double-patching the old tangled service.

---

## How to use this document

When you want to do a refactor, pick one cluster and invoke `/improve-codebase-architecture` pointing at it — the skill will frame the problem space, spawn parallel interface designs, and land on a GitHub issue RFC. Entries are independent; they can be taken in any order.

**All six original clusters are now complete:** #1 (PR #41), #2 (PR #43), #3 (PR #45), #4 (PR #50), #5 (PR #54), #6 (PR #48).

This document captured one architectural-friction walk; future walks should produce new documents (e.g., `code-architecture-improvements-2.md`) rather than appending here, so each walk's framing stays anchored to the codebase as it existed at the time of the walk.

## Patterns worth carrying forward

Six landed refactors give us enough signal to name what worked:

- **Deepening, not decomposition.** Every entry asked "what knowledge does the outside have to hold?" and pushed it into the module. Circular refs (#1), cleanup bookkeeping (#1), emphasis-vs-absence branching (#1), state-aware Z-offset (#1), widget activation routing (#2), per-service traversals over the dataset (#3), the annotation render catch-all (#4), the PCA chart god-singleton (#6), and the geometry/raycast/uniform/Z tangle (#5) all became *single-module* concerns. The smell to watch for is *negotiation* between modules over a shared concept; deepen the module that owns the concept rather than building a coordinator over it.
- **Reject coordinator/reducer/command-bus inversions.** They land easily because they look clean on paper, but they pull shader-parameter authority out of Looks and invert the shade-tree model. The hexagonal-core RFC for #1 was rejected for this reason; #2 was reframed for the same reason. Whenever a proposal wants to make Looks *passive recipients* of a generic dispatch layer, that's the wrong direction.
- **Three competing interfaces in parallel beats one careful design.** #5 and #6 both ran 3+ parallel design agents under different constraints (minimal interface / maximum flexibility / common-case-optimal). The winning design was usually the minimal one with one or two cherry-picks from a flexible alternative. The exercise is cheap and consistently surfaces the speculative-generality trap.
- **Stage long refactors as characterize → split → confirm.** #4 and #6 used 4–7 independently committable phases, each bug-for-bug identical to the previous one except for explicitly-scoped fixes. This kept review surface small and made `git bisect` useful when something broke.
- **Re-walk the cluster against current code before filing.** Entry #5's original framing was partially stale by the time it was picked up — PR #41 had already deleted the state-aware Z-offset machinery. Reframing happened before issue filing. A doc entry is a snapshot; verify before acting.
- **Visual verification is a first-class test channel.** Tests + typecheck don't catch a stale-uniform regression a human eye catches in two seconds. Every graphics-touching refactor closed with an explicit visual sanity pass before merge.

## Philosophy constraint (preserved for future walks)

PGB is built on a shade-tree model of appearance (Rob Cook / RenderMan lineage). Looks are conceptual shaders; the Look system is where visual complexity is *meant* to accumulate. Refactors that pull logic *out* of Looks into generic coordinators, reducers, or command pipelines should be rejected by default — that's the move that was rejected in #40 and reframed in #2. Deepen existing modules instead of introducing coordinator layers around them.
