# PGB ↔ PangenomeService Interaction Diagrams

Interaction flows for how **PangenomeService** is used in the PGB (Pan Genome Browser) application. PangenomeService loads pangenome graph data, computes assembly walks, spine features, and subgraphs — all consumed by GenomicService and downstream components for visualization and annotation.

---

## 1. Architecture Overview

PangenomeService is the **graph computation engine**. The host application loads JSON, passes it to PangenomeService, and uses the resulting spine features and subgraphs for 3D rendering, assembly emphasis, and annotation tracks.

| Component | Role | Owns |
|-----------|------|------|
| **App** | Orchestrator | Loads JSON, calls `loadData`, triggers `genomicService.initialize` |
| **PangenomeService** | Graph engine | Nodes, edges, walks, spine features, assembly subgraphs |
| **GenomicService** | Consumer | `assemblyWalkMap` (spine + subgraph per assembly), locus, node metadata |
| **AssemblyWidget** | UI | Assembly selector; uses `assemblyWalkMap` for emphasis |
| **AnnotationRenderService** | Rendering | Uses `assemblyWalkMap.spineFeatures` for bp index and track mapping |
| **GeometryManager** | 3D geometry | Uses `genomicService.nodeMetadata` (derived from JSON, not PangenomeService) |

```mermaid
%%{init: {'themeVariables': {'fontSize': '18px', 'fontFamily': 'arial'}, 'flowchart': {'nodeSpacing': 60, 'rankSpacing': 50}}}%%
flowchart TB
    subgraph Host["Host Application (PGB)"]
        APP[App<br/>handleSearch<br/>processData]
        GS[GenomicService<br/>assemblyWalkMap<br/>locus]
        AW[AssemblyWidget<br/>emphasizeAssembly]
        ARS[AnnotationRenderService<br/>bp index, track mapping]
        GM[GeometryManager<br/>createGeometry]
    end

    subgraph PangenomeService["PangenomeService"]
        LD[loadData]
        SD[setDefaultLocusStartBp]
        SF[getSpineFeatures]
        AS[getAssemblySubgraph]
    end

    User[User: locus/URL/file] --> APP
    APP -->|"loadData(json)"| LD
    APP -->|"initialize(json, pangenomeService)"| GS
    GS -->|"setDefaultLocusStartBp(bp)"| SD
    GS -->|"getSpineFeatures(assemblyKey, ...)"| SF
    GS -->|"getAssemblySubgraph(assemblyKey)"| AS
    GS -->|"assemblyWalkMap"| AW
    GS -->|"assemblyWalkMap.spineFeatures"| ARS
    GS -->|"nodeMetadata"| GM
```

---

## 2. Data Load — Full Sequence

When the user enters a locus, URL, or drops a JSON file, the full pipeline runs. PangenomeService is invoked during `processData`.

**Entry points:** (1) LocusInput (locus string, URL, or local file path) → `app.handleSearch(url)`; (2) Drag-and-drop of JSON file → container drop handler → `app.processData(json)` directly.

```mermaid
%%{init: {'themeVariables': {'fontSize': '16px'}}}%%
sequenceDiagram
    autonumber
    participant User
    participant LI as LocusInput
    participant APP as App
    participant PS as PangenomeService
    participant GS as GenomicService
    participant GM as GeometryManager
    participant AW as AssemblyWidget

    User->>LI: enter locus / URL / drop file
    LI->>APP: handleSearch(url)

    Note over APP,PS: Phase 1 — Load and parse
    APP->>APP: loadPath(url)
    APP->>APP: processData(json)

    Note over APP,PS: Phase 2 — PangenomeService load
    APP->>PS: loadData(json)
    PS->>PS: build nodes, edges, out, adj, assembliesIndex
    PS-->>APP: true

    Note over APP,GS: Phase 3 — GenomicService initialize
    APP->>GS: initialize(json, pangenomeService)
    GS->>GS: parse locus, build nodeMetadata, assemblySet

    GS->>PS: setDefaultLocusStartBp(locus.startBP)

    loop For each assemblyKey in assemblySet
        GS->>PS: getSpineFeatures(assemblyKey, assessmentConfig, walkConfig)
        PS->>PS: getAssemblyWalk → spine nodes with bp coords
        PS->>PS: event discovery (bubbles, braids, dangling)
        PS-->>GS: { spine, events, offSpine, aborted }

        GS->>PS: getAssemblySubgraph(assemblyKey)
        PS->>PS: #induced → nodes, edges
        PS-->>GS: { nodes, edges }

        GS->>GS: assemblyWalkMap.set(assemblyKey, { spineFeatures, assemblySubgraph })
    end

    Note over APP,GM: Phase 4 — Geometry and UI
    APP->>GM: createGeometry(json)
    APP->>AW: updatePopulationWidget / reset
    APP->>APP: createAllSceneNodeMeshes / createAllSceneEdgeMeshes
    APP->>APP: eventBus.publish('datasetLoaded')
```

### Key Points

| Aspect | Detail |
|--------|--------|
| **Single loadData call** | App calls `pangenomeService.loadData(json)` once per dataset |
| **Per-assembly iteration** | GenomicService loops over `assemblySet` and calls `getSpineFeatures` + `getAssemblySubgraph` for each |
| **Cached in assemblyWalkMap** | Results are stored in `genomicService.assemblyWalkMap`; downstream components read from there |
| **No direct PangenomeService after init** | AssemblyWidget and AnnotationRenderService use `genomicService.assemblyWalkMap`, not PangenomeService directly |

---

## 3. Assembly Emphasis — User Clicks Assembly Selector

When the user clicks an assembly in the Assembly Widget, the app emphasizes nodes/edges. Data comes from `assemblyWalkMap`, which was populated by PangenomeService during init.

```mermaid
%%{init: {'themeVariables': {'fontSize': '16px'}}}%%
sequenceDiagram
    autonumber
    participant User
    participant AW as AssemblyWidget
    participant GS as GenomicService
    participant EB as EventBus
    participant ARS as AnnotationRenderService
    participant Look as NodeEmphasisLook

    User->>AW: click assembly selector
    AW->>AW: onAssemblySelectorClick(assemblyKey)

    alt Emphasis mode: Assembly Subgraph
        AW->>GS: assemblyWalkMap.get(assemblyKey).assemblySubgraph
        GS-->>AW: { nodes, edges } (from getAssemblySubgraph)
    else Emphasis mode: Assembly Walk (spine)
        AW->>GS: assemblyWalkMap.get(assemblyKey).spineFeatures
        GS-->>AW: { spine: { nodes, edges }, events, ... }
        AW->>AW: extract spine.nodes, spine.edges
    end

    AW->>EB: publish('assembly:emphasis', { assembly, nodeSet, edgeSet })

    EB->>Look: assembly:emphasis
    Look->>Look: emphasize nodes/edges by nodeSet, edgeSet

    EB->>ARS: assembly:emphasis
    ARS->>GS: assemblyWalkMap.get(assembly).spineFeatures
    GS-->>ARS: spine (nodes with bpStart, bpEnd)
    ARS->>ARS: buildBpIndex(spine)
    ARS->>ARS: buildNodeEndpointMap, splineParameterMap
    ARS->>ARS: render gene annotation / genomic extents
```

### Data Source by Mode

| Mode | Source | PangenomeService method |
|------|--------|-------------------------|
| **Assembly Subgraph** | `assemblyWalkMap.get(key).assemblySubgraph` | `getAssemblySubgraph(assemblyKey)` |
| **Assembly Walk** | `assemblyWalkMap.get(key).spineFeatures.spine` | `getSpineFeatures(...).spine` |

---

## 4. Annotation Track — Line Intersection (Hover)

When the user hovers over a node line, the annotation track shows a vertical indicator at the corresponding base-pair position. The bp mapping relies on spine data from PangenomeService (via GenomicService).

```mermaid
%%{init: {'themeVariables': {'fontSize': '16px'}}}%%
sequenceDiagram
    autonumber
    participant User
    participant Raycast as RaycastService
    participant EB as EventBus
    participant APP as App
    participant ARS as AnnotationRenderService

    User->>Raycast: mouse over node line
    Raycast->>EB: publish('lineIntersection', { t, nodeName, nodeLine })
    EB->>APP: lineIntersection
    APP->>APP: showTooltip(...)
    EB->>ARS: lineIntersection

    Note over ARS: ARS has splineParameterMap from assembly:emphasis
    ARS->>ARS: getTrackParameterWithLineParameter(nodeName, t, bpIndex, endpointMap, bpIndexMap)
    ARS->>ARS: map t → bp position
    ARS->>ARS: update visual feedback element (track indicator)
```

### Spine Data Flow for Annotations

```
PangenomeService.getSpineFeatures()
    → spine.nodes: [{ id, bpStart, bpEnd, lengthBp }, ...]
    → GenomicService.assemblyWalkMap
    → AnnotationRenderService.buildBpIndex(spine)
    → bpIndex, bpIndexMap, endpointMap
    → getTrackParameterWithLineParameter(t, ...) → bp
```

---

## 5. Component Responsibilities

```mermaid
%%{init: {'themeVariables': {'fontSize': '18px', 'fontFamily': 'arial'}, 'flowchart': {'nodeSpacing': 60, 'rankSpacing': 50}}}%%
flowchart LR
    subgraph Host["Host Application"]
        APP["App<br/>• loadData(json)<br/>• processData<br/>• handleSearch"]
        GS["GenomicService<br/>• assemblyWalkMap<br/>• locus, nodeMetadata"]
        AW["AssemblyWidget<br/>• assembly selector<br/>• emphasis modes"]
        ARS["AnnotationRenderService<br/>• bp index from spine<br/>• track mapping"]
    end

    subgraph PS["PangenomeService"]
        LD["loadData<br/>• nodes, edges, assembliesIndex"]
        SF["getSpineFeatures<br/>• walk, spine, events"]
        AS["getAssemblySubgraph<br/>• induced nodes, edges"]
    end

    APP --> LD
    GS --> SF
    GS --> AS
    GS --> AW
    GS --> ARS
```

| Component | Lives in | PangenomeService usage |
|-----------|----------|------------------------|
| **App** | app.js | `loadData(json)`; passes pangenomeService to genomicService.initialize |
| **GenomicService** | genomicService.js | `setDefaultLocusStartBp`, `getSpineFeatures`, `getAssemblySubgraph`; caches in assemblyWalkMap |
| **AssemblyWidget** | widgets/assemblyWidget.js | Reads `assemblyWalkMap` (no direct PangenomeService calls) |
| **AnnotationRenderService** | annotationRenderService.js | Reads `assemblyWalkMap.spineFeatures` for spine (no direct PangenomeService calls) |
| **GeometryManager** | geometryManager.js | Uses genomicService.nodeMetadata (from JSON); no PangenomeService |

---

## 6. PangenomeService API Used by Host

| Method | Caller | When |
|--------|--------|------|
| `loadData(json)` | App | Once per dataset load (processData) |
| `setDefaultLocusStartBp(bp)` | GenomicService | During initialize, after parsing locus |
| `getSpineFeatures(assemblyKey, assessOpts, walkOpts)` | GenomicService | Once per assembly during initialize |
| `getAssemblySubgraph(assemblyKey)` | GenomicService | Once per assembly during initialize |

### Methods Not Used by Host

| Method | Purpose |
|--------|---------|
| `listAssemblyKeys()` | Returns assembly keys; host derives assemblySet from JSON node metadata instead |
| `getAssemblyWalk()` | Used internally by `getSpineFeatures`; host does not call directly |
| `getDefaultLocusStartBp()` | Getter; host does not read back |
| `getAssemblySubgraph(..., { includeAdj, includeDirectedAdj })` | Host uses default options only |

---

## 7. Data Flow Summary

```
JSON (node, edge, sequence, locus)
        │
        ▼
PangenomeService.loadData(json)
        │
        ├── nodes Map, edges Map, out, adj, assembliesIndex
        │
        ▼
GenomicService.initialize(json, pangenomeService)
        │
        ├── setDefaultLocusStartBp(locus.startBP)
        │
        ├── for each assemblyKey:
        │       getSpineFeatures(assemblyKey, ...)
        │           ├── getAssemblyWalk() → path
        │           ├── spine nodes with bpStart, bpEnd
        │           └── events (bubbles, braids, dangling)
        │       getAssemblySubgraph(assemblyKey)
        │           └── induced { nodes, edges }
        │       assemblyWalkMap.set(assemblyKey, { spineFeatures, assemblySubgraph })
        │
        ▼
assemblyWalkMap
        │
        ├── AssemblyWidget.emphasizeAssembly()
        │       ├── spineFeatures.spine (Assembly Walk mode)
        │       └── assemblySubgraph (Assembly Subgraph mode)
        │
        └── AnnotationRenderService.handleAssemblyEmphasis()
                └── spineFeatures.spine → buildBpIndex, splineParameterMap
```

---

## 8. Lifecycle — Clear on New Load

When a new dataset is loaded, `clearCurrentData` runs before `processData`. GenomicService clears its maps (including assemblyWalkMap). PangenomeService is not explicitly cleared; `loadData` overwrites its internal graph.

```mermaid
%%{init: {'themeVariables': {'fontSize': '16px'}}}%%
sequenceDiagram
    autonumber
    participant APP as App
    participant GS as GenomicService
    participant PS as PangenomeService

    APP->>APP: clearCurrentData()
    APP->>GS: clear()
    GS->>GS: assemblyWalkMap.clear()
    GS->>GS: assemblySet.clear()
    GS->>GS: nodeMetadata.clear()

    APP->>APP: loadPath(url) → json
    APP->>APP: processData(json)
    APP->>PS: loadData(json)
    Note right of PS: Overwrites graph; no explicit clear
    APP->>GS: initialize(json, pangenomeService)
```
