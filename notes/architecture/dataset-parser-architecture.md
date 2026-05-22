# Dataset Parser Architecture

## Problem: Shotgun Parsing

Prior to this change, `processData` in `app.js` passed the raw JSON response to six independent consumers:

- `pangenomeService.loadData(json)` — nodes, edges, assemblies
- `assemblyMetadataService.loadMetadata(json)` — population counts and frequencies
- `pclaiCoordinateService.loadCoordinates(json)` — PCLAI coordinates and colors
- `genomicService.initialize(json)` — locus, assembly walks, node metadata
- `geometryFactory.createGeometryData(json)` — ogdf coordinates, edge geometry
- `populationUtils.getHierarchicalPopulationStructureFromData(json)` — population widget structure

Each service reached into the raw JSON with its own assumptions about field names and nesting. When CiCi's API changed format, every consumer would need updating — a fragile, error-prone process.

## Solution: Parse Once, Distribute Domain Objects

A single module (`datasetParser.ts`) now sits between the raw JSON and all consumers. It:

1. **Confirms** the input is a v3 dataset, rejecting older formats with a clear error
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

## Supported Format: v3 Only

v3 is the **sole supported dataset format**. Support for the earlier v1 and v2 formats has been removed.

`parseDataset` confirms the v3 shape before normalizing, using positive evidence so that a legitimate v3 file with no PCLAI data is still accepted:

- A **v1** file carries a top-level `locus` string and lacks the v3 top-level shape (`queried_locus` / `actual_locus` / an `assembly` index object) — rejected.
- A **v2** file shares the v3 top-level shape but carries windowed `pclai` arrays in node metadata instead of `pclai_hg38` / `pclai_asm` — rejected.

A non-v3 dataset throws `DatasetParseError('Unsupported dataset format — only v3 datasets are supported')`. `app.processData` catches this (and any other parse failure), surfaces a dismissable alert via `showError(..., { autoHide: false })`, leaves the previous scene intact, and resumes rendering — a bad dataset never crashes the app.

## The Domain Model

The `DatasetModel` (defined in `datasetModel.ts` as TypeScript interfaces) provides a stable, compiler-enforced contract:

```
DatasetModel
  formatVersion   — 'v3'
  locus           — { queriedLocus, actualLocus }
  assemblyIndex   — per-assembly region coordinates
  sequences       — Map<nodeId, sequence string>
  nodes           — Map<nodeId, NodeModel>
  edges           — [{ startingNode, endingNode }]

NodeModel
  name, length
  assemblies                 — normalized AssemblyEntry[]
  duplicatedAssemblies       — multi-region mappings
  assemblyMetadata           — { count, frequency }
  pclaiCoordinatesBySystem   — Map<system, Map<coordKey, PclaiEntry[]>>
  ogdfCoordinates            — [{x, y}]
  defaultRange
```

Key normalizations:
- `assembly[].metadata[].pclai_hg38` / `pclai_asm` become `pclaiCoordinatesBySystem` — a `Map` keyed by coordinate system (`hg38`, `asm`), each holding a `Map<coordKey, PclaiEntry[]>`
- `queried_locus` / `actual_locus` (with genome prefix) become `locus.queriedLocus` / `locus.actualLocus` as plain `chr:start-end` strings
- `assembly[].metadata[]` is flattened into `AssemblyEntry[]` with all fields (sequenceId, pathStrand, nodeStrand, start, end, take) promoted to the top level

## Why This Matters

**Format changes are isolated.** When CiCi modifies the API response, only the parser needs updating. Consumers are insulated — they read from the domain model, which doesn't change unless a genuinely new concept is introduced.

**Validation happens early.** A malformed payload throws a clear error at parse time, not as a cryptic TypeError deep in a rendering call.

**The contract is compiler-enforced.** The TypeScript interfaces in `datasetModel.ts` define exactly what every consumer can rely on. The TypeScript compiler guarantees that the normalizer produces a complete, correctly-shaped `DatasetModel`.

## Key Files

| File | Role |
|------|------|
| `src/datasetParser.ts` | v3 format check, v3 normalizer, `parseDataset(json: unknown): DatasetModel` entry point |
| `src/datasetModel.ts` | TypeScript interfaces (`DatasetModel`, `NodeModel`, `AssemblyEntry`, `PclaiEntry`, `AssemblyMetadata`), `FormatVersion` type, `DatasetParseError` class |
| `src/datasetValidator.ts` | Validates raw JSON before normalization; throws `DatasetParseError` with JSON path on failure |
| `src/app.ts` | `processData` calls `parseDataset(json)`, catches parse failures into a dismissable alert, and distributes the result |
