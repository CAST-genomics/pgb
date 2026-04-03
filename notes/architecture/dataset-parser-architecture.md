# Dataset Parser Architecture

## Problem: Shotgun Parsing

Prior to this change, `processData` in `app.js` passed the raw JSON response to six independent consumers:

- `pangenomeService.loadData(json)` — nodes, edges, assemblies
- `assemblyMetadataService.loadMetadata(json)` — population counts and frequencies
- `pclaiCoordinateService.loadCoordinates(json)` — PCA coordinates and colors
- `genomicService.initialize(json)` — locus, assembly walks, node metadata
- `geometryFactory.createGeometryData(json)` — ogdf coordinates, edge geometry
- `populationUtils.getHierarchicalPopulationStructureFromData(json)` — population widget structure

Each service reached into the raw JSON with its own assumptions about field names and nesting. When CiCi's API changed from v1 to v2 format, every consumer would need updating — a fragile, error-prone process.

## Solution: Parse Once, Distribute Domain Objects

A single module (`datasetParser.js`) now sits between the raw JSON and all consumers. It:

1. **Detects** the format version (v1 vs v2) via structural heuristics
2. **Validates** required fields, throwing `DatasetParseError` with the JSON path on failure
3. **Normalizes** the raw JSON into a common `DatasetModel` — the canonical internal representation

`processData` becomes:

```js
const dataset = parseDataset(json)    // single parse point
pangenomeService.loadData(dataset)
assemblyMetadataService.loadMetadata(dataset)
pclaiCoordinateService.loadCoordinates(dataset)
// ... every consumer receives domain objects, not raw JSON
```

## The Domain Model

The `DatasetModel` (defined in `datasetModel.js` as JSDoc typedefs) provides a stable contract:

```
DatasetModel
  formatVersion   — 'v1' | 'v2'
  locus           — { queriedLocus, actualLocus }
  assemblyIndex   — per-assembly region coordinates (v2; null for v1)
  sequences       — Map<nodeId, sequence string>
  nodes           — Map<nodeId, NodeModel>
  edges           — [{ startingNode, endingNode }]

NodeModel
  name, length
  assemblies              — normalized AssemblyEntry[]
  duplicatedAssemblies    — multi-region mappings (v2; empty for v1)
  assemblyMetadata        — { count, frequency }
  pclaiCoordinates        — Map<coordKey, PclaiEntry[]>
  ogdfCoordinates         — [{x, y}]
  defaultRange
```

Key normalizations:
- v1 `pclai_coordinates` (flat dict per node) becomes `Map<coordKey, PclaiEntry[]>` with a single entry per key (percentage=1)
- v2 `assembly[].metadata[].pclai[]` (nested, windowed) becomes the same Map shape, with multiple entries per key
- v1 `locus` string and v2 `queried_locus` (with genome prefix) both become `locus.queriedLocus` as a plain `chr:start-end` string
- v2 `assembly[].metadata[]` is flattened into `AssemblyEntry[]` with all fields (sequenceId, pathStrand, nodeStrand, start, end, take) promoted to the top level

## Why This Matters

**Format changes are isolated.** When CiCi modifies the API response, only the parser needs updating. Consumers are insulated — they read from the domain model, which doesn't change unless a genuinely new concept is introduced.

**Validation happens early.** A malformed payload throws a clear error at parse time, not as a cryptic TypeError deep in a rendering call.

**The contract is explicit.** The JSDoc typedefs in `datasetModel.js` document exactly what every consumer can rely on. This replaces the implicit contracts that were previously scattered across six different service methods.

## When a New Format Concept Requires Consumer Changes

Not all format changes are purely structural. The v2 format introduced per-assembly genomic region coordinates in a top-level `assembly` index — a concept that v1 did not have. The parser normalizes this into `dataset.assemblyIndex`, but `genomicService` needed a small change to *use* that data for accurate annotation track base pair positioning.

The principle: the parser handles all structural differences between formats. Consumers only change when the new format introduces new semantics they need to act on.

## Key Files

| File | Role |
|------|------|
| `src/datasetParser.js` | Format detection, v1/v2 normalizers, `parseDataset()` entry point |
| `src/datasetModel.js` | JSDoc typedefs for DatasetModel, NodeModel, AssemblyEntry, PclaiEntry; `DatasetParseError` class |
| `src/app.js` | `processData` calls `parseDataset(json)` and distributes the result |
