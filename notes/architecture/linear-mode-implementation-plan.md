# Linear Mode — Implementation Plan

**Status:** implemented
**Branch:** `linear-lab`
**Date:** 2026-07-23

Linear mode displays the pangenome linearized with respect to a selected assembly. The backend accepts `linear` (bool) and `assembly` (str) on the `/json` endpoint and returns a lane-based layout instead of a force-directed one. This document covers the frontend work.

---

## 1. The central decision: selection does not fetch, Rebuild fetches

The obvious design — "select an assembly, get its linearization" — makes assembly selection a network round-trip. Selection is currently free: `onAssemblySelectorClick` (`assemblyWidget.ts:112`) flips a field and publishes `assembly:emphasis`; every consumer reads the already-computed `genomicService.assemblyWalkMap`. Instant. Making the same click cost a fetch + full geometry rebuild + camera refit is a large, invisible change in what a click means.

**Decision: an explicit Rebuild button is the only thing that fetches.** Selecting an assembly re-emphasizes within the current layout, as it does today.

This resolves three separate problems at once:

| Problem | How Rebuild resolves it |
|---|---|
| Rapid-click race — several fetches in flight, out-of-order arrival | Fetches are user-initiated, one at a time. Disable the button while in flight; no sequence token needed. |
| Deselect semantics undefined in linear mode (`assemblyWidget.ts:115-118`) | Deselect is unchanged — it drops emphasis. Layout is untouched because layout is no longer coupled to selection. |
| Latency surprise on a formerly-instant interaction | The cost is attached to a button that visibly means "reload the view." |

### The property that makes it work

`assemblyWalkMap` is built for **every** assembly in the dataset during `genomicService.initialize` (`genomicService.js:60-100`), independent of how the graph is laid out. So selecting HG00099 while the layout is linearized on HG00097 renders HG00099's walk emphasized against HG00097's linear axis.

That is not a degraded state — it is a genuinely useful comparison view, and it falls out for free. Linear mode gets a capability the auto-fetch design would have hidden.

### Derived staleness

Layout spine and selected assembly become independent variables:

```
dataset.layout.spineAssembly   — what the geometry is laid out against
assemblyWidget.selectedAssembly — what is currently emphasized
```

Rebuild is enabled exactly when they differ. No extra state, no bookkeeping, no invalidation logic — it is a comparison of two values that already exist. The button's enabled state *is* the staleness indicator, which makes "your layout doesn't match your selection" visible instead of something the user has to track.

---

## 2. State model

```ts
// datasetModel.ts
export interface DatasetLayout {
    mode: 'linear' | 'force';
    spineAssembly: string | null;   // null when mode === 'force'
    refetchable: boolean;           // false for dropped files / arbitrary URLs
}
```

Lives on `DatasetModel` (`datasetModel.ts:75`), not in the widget.

**Reasoning.** Three consumers need it and none of them can reach widget state cleanly:

- `GeometryFactory.createGeometryData(dataset)` needs `mode` to pick edge geometry. It already receives the whole dataset, so this costs zero signature changes.
- `AssemblyWidget` needs `spineAssembly` to compute staleness and restore selection after reload.
- `LocusInput` needs `mode` + `spineAssembly` to build the next request URL.

Putting it on the model also keeps the parse-once rule intact (`notes/architecture/dataset-parser-architecture.md`): consumers read domain objects, never raw JSON and never out-of-band config. A boolean threaded through `handleSearch → processData → createGeometry` would work but reintroduces exactly the fan-out coupling the parser was built to remove.

`refetchable` is what disables the toggle for dropped files — see §6.3.

---

## 3. Phases

### Phase 0 — Backend contract (do first, unblocks nothing else)

Confirm what the response carries. Two workable answers:

**(a) Response echoes `linear` and `assembly`.** Parser reads them directly. Preferred: the dataset self-describes, so a linearized file saved to disk and later dragged in still renders correctly.

**(b) Response does not echo.** Client snapshots the request parameters and attaches them to the parsed model. Works for API loads; a dropped linear file cannot self-identify and must be handled manually.

Plan below is written for (b), because it is the weaker assumption and (a) is a strict simplification of it — if the echo exists, Phase 2's snapshot plumbing shrinks to a parser field read. Nothing else changes.

> Sample file `public/datasets/api-v3/linear-lab/chr6_linearized.json` is v1 format (top-level `locus` string, no `queried_locus`/`actual_locus`) and will be rejected by `assertV3Format` (`datasetParser.ts:54`). Regenerate it from the updated endpoint before using it as a fixture.

### Phase 1 — `DatasetModel.layout`

1. Add `DatasetLayout` to `datasetModel.ts`; add `layout: DatasetLayout` to `DatasetModel` (`:75`).
2. `normalizeV3` (`datasetParser.ts:189`) populates it in the returned object (`:274`). Default `{ mode: 'force', spineAssembly: null, refetchable: false }`.
3. `parseDataset` (`:29`) gains an optional second parameter carrying the request context:

```ts
export function parseDataset(json: unknown, requestLayout?: Partial<DatasetLayout>): DatasetModel
```

**Reasoning for defaulting to `'force'`:** every existing dataset, fixture, and test keeps working untouched. Linear is strictly additive. No migration.

**Test:** `src/__tests__/datasetParser.test.js` — assert default layout on an existing fixture; assert `requestLayout` passthrough.

### Phase 2 — Request plumbing

`locusInput.js:13`:

```js
const pangenomeURLTemplate = `https://pangenome-api.ucsd.edu:8000/json?chrom=_CHR_&start=_START_&end=_END_&graphtype=minigraph&version=v2&debug_small_graphs=false&minnodelen=5&nodeseglen=20&edgelen=5&nodelenpermb=1000`
```

Append `&linear=_LINEAR_&assembly=_ASSEMBLY_` when linear; omit both entirely when force. Omitting rather than sending `linear=false` keeps existing request URLs byte-identical, so nothing about the current path can regress.

`ingestLocus` (`:171`) takes the layout and does the substitution. `handleSearch` (`app.ts:204`) takes it and passes it to `processData` → `parseDataset(json, requestLayout)`.

> **Adjacent bug, same line.** The template hardcodes `version=v2` and `ingestLocus` then calls `.replace('_VERSION_', this.version)` — a no-op, since `_VERSION_` does not appear in the string. The version dropdown (`locusInput.js:85-88`) therefore does nothing but log. Fix or delete while editing this line; do not leave a second dead substitution next to the new live ones.

### Phase 3 — Widget UI

The card footer (`index.html:71-79`) currently holds one switch + label, driving `emphasisMode`. Add a second row: a linear switch and a Rebuild button.

`AssemblyWidget` gains:

```ts
linearEnabled: boolean            // the toggle
datasetLayout: DatasetLayout      // from the last loaded dataset
```

- `initializeLinearSwitch()` / `initializeRebuildButton()` — follow the existing lazy-query pattern (`initializeSwitchInput`, `:184`), since footer elements are only reachable once the card is shown.
- `updateRebuildState()` — enable the button iff `datasetLayout.refetchable && linearEnabled && selectedAssembly && selectedAssembly.name !== datasetLayout.spineAssembly`. Call it from selection change, toggle change, and dataset load.
- Toggling linear **on** with an assembly selected fires one rebuild immediately. Otherwise the toggle appears inert and the user has to discover the button.
- Toggling linear **off** fires a rebuild back to force layout.

Wiring — the widget publishes, it does not fetch:

```ts
eventBus.publish('layout:rebuild', { mode: 'linear', spineAssembly: assemblyKey })
```

Add to `EventMap` (`utils/eventMap.ts`). `main.js` subscribes and calls `app.handleSearch(url, layout)`, alongside the existing print-panel wiring.

**Reasoning:** the codebase's stated convention is that widgets are event producers with no knowledge of what consumes them (`notes/architecture/look/look-system-architecture.md`). Handing `AssemblyWidget` an `app` reference to call `handleSearch` would make it the only widget with a network dependency. Keeping the fetch at the composition root also means the whole effect of the toggle is visible in one file.

**Locus source:** `dataset.locus.actualLocus` (`datasetModel.ts:77`), not the locus input's current text. The textbox may have been edited since load, or cleared by a drag-drop (`clearLocusInput`). The widget does not currently know the locus at all — it arrives with the layout on `datasetLoaded`.

### Phase 4 — Edge geometry

`GeometryFactory.#createEdgeGeometries` (`geometryFactory.js:86`) is the sole origin of every edge quad; `Look.createEdgeMesh` (`looks/look.ts:186`) only attaches material. Branch there on `dataset.layout.mode`.

Keep the existing straight-quad path verbatim for `'force'`. `createGeometryData` (`:16`) must thread `dataset.layout` down to the private method.

**Why new geometry is required, not merely nicer.** Measured against the linearized sample — 28 nodes on spine `y≈0`, lanes at `y=±30`, nodes as horizontal segments:

| Class | Example | Endpoints | Current result |
|---|---|---|---|
| Spine-adjacent | `110051+→110052+` | `(29.6,0)` → `(29.6,0)` | **Degenerate.** `direction = end-start` is the zero vector; `normalize()` leaves it zero; all four corners collapse to one point. Zero-area quad. |
| Spine-skip | `110054+→110057+` | `(179.6,0)` → `(239.6,0)` | Chord lies exactly along the spine ribbons. Invisible — and this is the deletion/bypass edge carrying the most signal. |
| Lane-hop | `110051+→560672+` | `(29.6,0)` → `(33.1,30)` | Draws, but a near-vertical spike. |

Two of three classes render nothing. `createEdgeRectGeometry` (`lineFactory.js:8`) assumes force-directed layout, where endpoints are always separated and edges never lie along node paths.

New `LineFactory.createEdgeArcGeometry(startXYZ, endXYZ, { height, halfWidth })` — quad strip along a curve, same attribute layout (`position`, `uv`, indexed triangles) so the existing arrow material works unchanged. Requirements:

- Zero-length input must produce a real arc, not a degenerate quad — minimum height floor.
- Arc height signed by lane direction so spine-skips bow clear of the axis.
- Preserve the UV convention (`0..1` along length) — the arrow texture stretches along it.

**Lane packing** for arc heights: greedy interval packing on `[spanStart, spanEnd]`, recipe in `notes/pangenome/linear-graph-considerations.md` §8. Spine bp coordinates are already available via `genomicService.assemblyWalkMap`.

**Z-order.** `EDGE_LINE_Z_OFFSET = -12` (`geometryFactory.js:8`) vs `NODE_Z_OFFSET = -8` (`ribbonNode.ts:9`) — edges currently sit behind nodes, which is fine for arcs leaving the axis. `NODE_Z_OFFSET` is deliberately single-source (it was previously duplicated across three files); if arcs need to come forward, add an edge-side constant rather than touching it.

**Verify before assuming it carries over:** `getSplineParameter` (`geometryFactory.js:170`) resolves spline endpoint 0 or 1 from edge sign vs node sign. Every node in the linearized sample is `+`, so this logic is untested against linear data. Separately, `getActualSignedNodeName` (`:127`) linear-scans the entire `geometryCache` per lookup and is called twice per edge endpoint — O(nodes × edges) overall. Tolerable at 59 nodes, not at production sizes. Worth a name→signed-name index while the file is open.

### Phase 5 — Reload continuity

**Selection restore.** `populateList()` sets `selectedAssembly = null` (`assemblyWidget.ts:57`) and rebuilds the list from `genomicService.assemblySet`, which is repopulated per dataset (`genomicService.js:49-56`). Left alone, a rebuild erases the selection that triggered it: click → fetch → repopulate → nothing selected, nothing emphasized, toggle appears to have reset itself.

Give `populateList(preserveSelection?: string)` an optional key, called with `dataset.layout.spineAssembly`, re-applying the selected class and calling `emphasizeAssembly`.

**Camera.** `updateViewToFitScene` (`app.ts:251`) runs on every load. Correct for a linear rebuild — the layout changes completely and preserving pan/zoom would leave the user off-screen. No change needed; noted so it is not "fixed" later by mistake.

---

## 4. Open decisions

**Deselect while linear.** With layout decoupled from selection this is no longer forced, and the default falls out naturally: deselect drops emphasis, layout stays. Consequence — `dataset.layout.spineAssembly`, not `selectedAssembly`, is the record of what you are looking at. Confirm that reads correctly in the UI (the axis probably wants a persistent "Spine: HG00097#1" label independent of the selection list).

**Multi-component assemblies.** `notes/pangenome/linear-graph-considerations.md` §1 — some assemblies split into several connected components, and linearization must pick one path (usually longest) or render per-component lanes. This is a backend concern if the endpoint already chooses; confirm which, because "pick longest silently" and "render all components" look very different and the frontend should not guess.

**Toggle persistence across locus changes.** If the user is in linear mode and types a new locus, does linear carry over? Carrying it over needs a spine assembly valid in the new locus — not guaranteed. Safest default: new locus resets to force, and say so in the UI. Cheap to relax later.

---

## 5. Test plan

Unit (`vitest`, `node` env):

- `datasetParser.test.js` — default layout is `force`; `requestLayout` passthrough; existing fixtures unchanged.
- New `lineFactory.arc.test.js` — zero-length input yields non-degenerate geometry with correct vertex/index counts; UV range preserved; arc height sign follows lane direction.
- `geometryFactory` edge-class dispatch — `force` datasets still produce straight quads (guards the regression).

Manual, against the regenerated linearized fixture:

- All three edge classes visible.
- Rebuild disabled when selection matches spine; enabled when it differs.
- Select a non-spine assembly → its walk emphasizes correctly on the existing axis, no fetch.
- Rebuild while a rebuild is in flight → button disabled, no double fetch.
- Drop a JSON file → linear toggle disabled (`refetchable: false`).
- Load a normal force dataset → byte-identical request URL, unchanged rendering.

---

## 6. Risks

**6.1 Edge geometry is the whole cost.** Phases 1–3 and 5 are plumbing — small, mechanical, individually testable. Phase 4 is where the real work and all the visual-quality iteration lives. Land 1, 2, 3, 5 first with linear mode falling back to straight quads; the view will look wrong but the whole control path can be exercised and committed independently. Do not stack the plumbing behind the geometry.

**6.2 The endpoint's layout contract is unpinned.** The lane structure inferred here comes from one sample file. If the backend changes lane spacing, adds lanes, or alters node point counts (the sample has 2-, 3-, and 4-point nodes), arc-height heuristics tuned against it will drift. Derive heights from the data (lane y-values present in the dataset), not from hardcoded `±30`.

**6.3 Non-API datasets cannot self-describe under option (b).** Drag-and-drop calls `processData(json)` directly (`app.ts:~530`) and then `clearLocusInput()` — no URL, no locus, nothing to refetch. `refetchable: false` disables the toggle for these, which is honest but means a saved linearized file renders with force-mode edge geometry: the degenerate cases from §Phase 4, silently, with no error. If dropping linear files becomes a routine workflow, the fix is the *generator* writing a layout field into the file and the parser reading it — same `DatasetLayout` shape, so nothing here has to be redone.

**6.4 `: any` creep.** `assemblyWidget.ts` already carries 4 `: any` annotations and `app.ts` 21 (`notes/architecture/technical-debt-14-apr-2026.md`). `DatasetLayout` is a new contract crossing parser → geometry → widget — type it properly at every hop rather than letting it arrive as `any` through the existing untyped `dataset` parameters.
