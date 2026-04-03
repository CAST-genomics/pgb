# Dataset Parser/Transformer — Implementation Plan

## Context

The PGB app ingests data two ways: (1) drag-drop / local static files (v1 format), and (2) locus/gene-name queries that hit CiCi's API. CiCi's API now returns a **v2 format** — a breaking change. The locus input path is currently broken against the new API.

The current ingestion in `processData` (`src/app.js:166`) passes raw JSON to 6+ services that each dig into it independently — a shotgun parse. This makes format changes expensive: every consumer embeds its own assumptions about field names and nesting.

**Goal**: Build a single parse point that validates and normalizes raw JSON (either v1 or v2) into a common domain model. Consumers receive domain objects, not raw JSON. When the API evolves, only the parser changes.

**Two-phase payoff**:
- **Phase 1** (refactor): Build the parser with a v1 normalizer, rewire all consumers to read from the domain model. Existing v1 file loading works identically — same behavior, new plumbing. No new capabilities yet.
- **Phase 2** (new capability): Add the v2 normalizer and update the API URL. Locus queries now work against the new API. Consumers don't change — they already speak the domain model.

---

## New Modules

### `src/datasetParser.js` (~200 lines)
The single parse point. Exported function:
```js
export function parseDataset(json) → DatasetModel
```
- Detects format version (v1 vs v2) via structural heuristics (`json.queried_locus` → v2, `json.locus` string → v1)
- Validates required fields, throws `DatasetParseError` with JSON path on failure
- Calls internal `normalizeV1(json)` or `normalizeV2(json)` to produce a common `DatasetModel`

### `src/datasetModel.js` (~60 lines)
JSDoc typedefs for the normalized model + `DatasetParseError` class. Serves as the canonical contract documentation.

---

## Domain Model (`DatasetModel`)

```
DatasetModel
├── formatVersion: 'v1' | 'v2'
├── locus: { queriedLocus, actualLocus }
├── assemblyIndex: Map<key, { sequenceId, region }> | null  (v2 top-level assembly)
├── sequences: Map<nodeId, string>
├── nodes: Map<nodeId, NodeModel>
│   ├── name, length
│   ├── assemblies: AssemblyEntry[]
│   ├── duplicatedAssemblies: AssemblyEntry[]  (empty for v1)
│   ├── assemblyMetadata: { count, frequency } | null
│   ├── pclaiCoordinates: Map<coordKey, PclaiEntry[]>
│   ├── pclaiAveRgb: [r,g,b] | null
│   ├── ogdfCoordinates: [{x, y}, ...]
│   └── defaultRange: string | null
└── edges: [{ startingNode, endingNode }, ...]

AssemblyEntry: { assemblyName, haplotype, sequenceId, pathStrand, nodeStrand, start, end, take }
PclaiEntry:    { coordinates: [x,y], rgb: [r,g,b], start, end, percentage }
```

**Key normalization**: v1 `pclai_coordinates` (flat dict per node) → `Map<coordKey, [PclaiEntry]>` with percentage=1. v2 `assembly[].metadata[].pclai[]` → same Map shape, multiple entries per key.

---

## Changes to `processData` (`src/app.js:166`)

```js
async processData(json) {
    const dataset = parseDataset(json)    // ← single new line

    this.pangenomeService.loadData(dataset)          // was: (json)
    assemblyMetadataService.loadMetadata(dataset)    // was: (json)
    pclaiCoordinateService.loadCoordinates(dataset)  // was: (json)
    // ... rest unchanged except json → dataset
    eventBus.publish('datasetLoaded', { dataset })   // was: { json }
}
```

---

## Changes Per Consumer

| File | Method | What changes | Est. diff |
|------|--------|-------------|-----------|
| `src/pangenomeService.js` | `loadData` | Iterate `dataset.nodes` Map instead of `Object.entries(json.node)`. Read `node.assemblies[]` instead of `raw.assembly[]`. Drop `raw` field from stored nodes. | ~30 lines |
| `src/assemblyMetadataService.js` | `loadMetadata` | Iterate `dataset.nodes`, read `node.assemblyMetadata` instead of `nodeData.assembly_metadata` | ~5 lines |
| `src/widgets/pclaiCoordinateService.js` | `loadCoordinates` | Read `node.pclaiCoordinates` Map and `node.pclaiAveRgb` instead of `pclai_coordinates` dict. For v2 windowed data, pick first/primary entry per coord key for the existing single-coordinate model. | ~25 lines |
| `src/genomicService.js` | `initialize` | `dataset.locus.queriedLocus` instead of `json.locus`. Iterate `dataset.nodes`, read `node.assemblies[]` for key construction. `dataset.sequences` instead of `json.sequence`. | ~15 lines |
| `src/geometryFactory.js` | `createGeometryData` | Iterate `dataset.nodes` Map for `ogdfCoordinates`. Use `dataset.edges` array with `startingNode`/`endingNode`. | ~20 lines |
| `src/widgets/widgetService.js` + `populationUtils.js` | `updatePopulationWidget` | `getHierarchicalPopulationStructureFromData` iterates `dataset.nodes` Map, reads `node.assemblyMetadata.count` | ~10 lines |

---

## Phased Approach

### Phase 1 — Refactor: parser + v1 normalizer + rewire all consumers
**What this is**: A refactoring step. Same behavior, new internal plumbing. No new capabilities.
**What this is NOT**: It does not add v2 support or change the API URL.

1. Create `src/datasetModel.js` (typedefs + DatasetParseError)
2. Create `src/datasetParser.js` with `parseDataset()`, format detection, and `normalizeV1()`
3. Update `src/app.js:processData` to call `parseDataset(json)` and pass `dataset` downstream
4. Update each consumer service (pangenomeService → assemblyMetadataService → pclaiCoordinateService → genomicService → geometryFactory → populationUtils/widgetService)
5. **Verify**: Load existing v1 datasets via file drop (e.g. `public/hprc-project/chr6-160531482-160664275.json`). Confirm identical rendering, widgets, PCA chart, assembly walks. This is the critical gate before moving on.

### Phase 2 — New capability: v2 normalizer + new API URL
**What this is**: The payoff. Locus queries work against CiCi's new API.

1. Add `normalizeV2()` to `src/datasetParser.js`
2. Handle: merged assembly/metadata/pclai nesting, windowed PCLAI, duplicated_assembly, take flag, split locus, top-level assembly index
3. Update the API URL to the new v2 endpoint (currently in `notes/api-and-dataset-update-02-apr-2026/api-02-apr-2026-url.txt`)
4. **Verify**: Load `notes/api-and-dataset-update-02-apr-2026/cici-dataset-02-apr-2026.json` via file drop. Enter a locus in the input widget and hit Go against the new API. Confirm rendering + PCLAI chart + population widget.

### Phase 3 — Validation hardening
1. Extract validation into `src/datasetValidator.js`
2. Required-field checks, type checks on coordinates/RGB, clear error paths
3. **Verify**: Feed malformed JSON via file drop. Confirm meaningful error messages instead of deep TypeErrors.

### Phase 4 — Tests
1. Create `src/__tests__/datasetParser.test.js`
2. Test: format detection, v1 normalization, v2 normalization, missing fields, edge cases (empty nodes, missing optional fields, multi-window PCLAI)

---

## Verification (Phase 1 — the critical gate)

After Phase 1, before proceeding:
- Load `public/hprc-project/chr6-160531482-160664275.json` via file drop — rendering, PCA widget, assembly emphasis must work identically
- Console-log node count, edge count, assembly count, PCLAI node count, bounding box — compare before/after
- v1 file drop is the only path that needs to work at this point; locus queries remain on the old API until Phase 2
