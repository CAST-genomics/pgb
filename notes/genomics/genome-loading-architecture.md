# Genome Loading Architecture

## Overview

PGB loads genome data through a pipeline of classes ported and refactored from igv.js. There are two distinct paths through this pipeline, determined by the genome config:

1. **igv.org known genomes** — standard reference genomes (hg38, mm39, etc.) fetched from igv.org's curated registry, with RefSeq annotations
2. **Custom genomes** — scientist-designed experimental genomes loaded from a custom JSON registry, typically using indexed FASTA + tabix-indexed GFF3

Both paths share the same class hierarchy but diverge at key branching points based on config properties — primarily the presence or absence of `indexURL` fields.

---

## Class Inventory

The pipeline involves these classes, listed in call order:

| Class / Module | File | Role |
|---|---|---|
| `main.js` | `src/main.js` | App entry point; sets custom registry URL, initializes registry |
| `genomeRegistry` | `src/igvCore/genome/genomeRegistry.js` | Facade: merges igv.org + custom sources into one config Map |
| `igvOrgRegistrySource` | `src/igvCore/genome/igvOrgRegistrySource.js` | Fetches genome configs from igv.org (with backup URL) |
| `customRegistrySource` | `src/igvCore/genome/customRegistrySource.js` | Fetches genome configs from a developer-specified JSON URL |
| `GenomeLibrary` | `src/igvCore/genome/genomeLibrary.js` | Creates Genome + feature source + renderer for a genome ID |
| `Genome` | `src/igvCore/genome/genome.js` | Genome object: holds sequence, chromosomes, tracks |
| `loadSequence()` | `src/igvCore/genome/loadSequence.js` | Factory: dispatches to IndexedFasta or NonIndexedFasta |
| `IndexedFasta` | `src/igvCore/genome/indexedFasta.js` | Loads sequence via `.fai` index + HTTP range requests |
| `NonIndexedFasta` | `src/igvCore/genome/nonIndexedFasta.js` | Loads entire FASTA file into memory |
| `TextFeatureSource` | `src/igvCore/io/textFeatureSource.js` | Wraps FeatureFileReader; provides caching and chr aliasing |
| `FeatureFileReader` | `src/igvCore/io/featureFileReader.js` | Reads features from BED/GFF3/VCF; indexed or full-file |
| `loadIndex()` | `src/igvCore/io/indexFactory.js` | Loads and parses `.tbi` index files |
| `TabixIndex` | `src/igvCore/io/tabixIndex.js` | Parsed tabix index with `chunksForRange()` for region queries |
| `BGZBlockLoader` | `src/igvCore/io/bgzBlockLoader.js` | Fetches + decompresses bgzip blocks via HTTP range requests |
| `BGZLineReader` | `src/igvCore/io/bgzLineReader.js` | Reads header lines from bgzipped files block by block |
| `FeatureParser` | `src/igvCore/feature/featureParser.js` | Parses tab-delimited feature lines; dispatches to GFF3 codec |
| `AnnotationRenderService` | `src/annotationRenderService.js` | App-side: triggers genome loading on assembly emphasis |

---

## Sequence Diagram: Registry Initialization

Both paths begin with the same initialization at app startup.

```mermaid
%%{init: {'themeVariables': {'fontSize': '16px'}}}%%
sequenceDiagram
    autonumber
    participant Main as main.js
    participant GR as genomeRegistry
    participant IGV as igvOrgRegistrySource
    participant Custom as customRegistrySource

    Main->>GR: setCustomRegistryURL(url)
    GR->>GR: stores URL

    Main->>GR: initializeGenomeRegistry()

    Note over GR,Custom: Promise.all — fetch both sources in parallel

    GR->>IGV: initialize()
    IGV->>IGV: fetch igv.org/genomes<br/>/genomes3.json
    IGV-->>GR: Map<id, config>

    GR->>Custom: initialize(url)
    Custom->>Custom: fetch custom<br/>registry JSON
    Custom-->>GR: Map<id, config>

    GR->>GR: merge: custom overrides<br/>igv.org on ID collision

    GR-->>Main: initialized
```

After initialization, `genomeRegistry` holds a single merged `Map<genomeId, config>` accessible via `getGenomeConfig(id)`.

---

## Sequence Diagram: Path 1 — igv.org Known Genome (e.g., hg38)

This path is triggered when a user emphasizes an assembly whose genome ID (e.g., "hg38") matches an igv.org registry entry. The igv.org config typically has `indexURL` for both the FASTA and the annotation track.

```mermaid
%%{init: {'themeVariables': {'fontSize': '16px'}}}%%
sequenceDiagram
    autonumber
    participant ARS as AnnotationRenderService
    participant GL as GenomeLibrary
    participant G as Genome
    participant LS as loadSequence()
    participant IF as IndexedFasta

    Note over ARS: assembly:emphasis event

    ARS->>GL: getGenomePayload("hg38")
    GL->>GL: getGenomeConfig("hg38")<br/>→ genomeRegistry
    Note right of GL: config {fastaURL, indexURL,<br/>tracks: [{url, indexURL,<br/>format: "refgene"}]}

    GL->>G: Genome.createGenome(config)
    G->>LS: loadSequence(config)

    Note over LS,IF: config.indexURL exists && !isDataURL

    LS->>IF: new IndexedFasta
    LS->>IF: init()
    IF->>IF: fetch .fai (6 KB)
    IF->>IF: parse index entries
    IF->>IF: build chromosomes Map
    IF-->>LS:
    LS-->>G:
    G-->>GL: genome object<br/>(with chromosomes, sequence access)

    GL->>GL: new TextFeatureSource(trackConfig, genome)<br/>→ creates FeatureFileReader internally
    GL->>GL: new FeatureRenderer(...)

    GL-->>ARS: {genome, geneFeatureSource, geneRenderer}
```

### Feature Loading (on-demand)

After the genome is created, `AnnotationRenderService` requests features for the visible region:

```mermaid
%%{init: {'themeVariables': {'fontSize': '16px'}}}%%
sequenceDiagram
    autonumber
    participant ARS as AnnotationRenderService
    participant TFS as TextFeatureSource
    participant FFR as FeatureFileReader
    participant FP as FeatureParser

    ARS->>TFS: getFeatures({chr, start, end})
    TFS->>FFR: readFeatures(chr, start, end)

    FFR->>FFR: getIndex()<br/>(no indexURL on igv.org refseq track)
    Note right of FFR: index = undefined<br/>→ loadFeaturesNoIndex()

    FFR->>FFR: fetch entire annotation file<br/>(loadByteArray)

    FFR->>FP: _parse(features, dataWrapper)
    FP->>FP: parseFeatures()<br/>(RefSeq codec)
    FP-->>FFR: features[]
    FFR-->>TFS: features[]
    TFS-->>ARS: features[]

    ARS->>ARS: renderGeneAnnotation()
```

Note: Many igv.org tracks (e.g., RefSeq for hg38) are small enough to load fully. If the igv.org config includes an `indexURL` on the track, the indexed path (same as Path 2 below) would be used instead.

---

## Sequence Diagram: Path 2 — Custom Genome with Indexed FASTA + Tabix GFF3

This path is triggered when the genome ID matches a custom registry entry. The config has `indexURL` for the FASTA and `indexURL` + `format: "gff3"` on the annotation track.

### Genome Creation (same structure, different data)

```mermaid
%%{init: {'themeVariables': {'fontSize': '16px'}}}%%
sequenceDiagram
    autonumber
    participant ARS as AnnotationRenderService
    participant GL as GenomeLibrary
    participant G as Genome
    participant LS as loadSequence()
    participant IF as IndexedFasta

    ARS->>GL: getGenomePayload("HG00099")
    GL->>GL: getGenomeConfig("HG00099")<br/>→ genomeRegistry
    Note right of GL: config {<br/>fastaURL: "...fa",<br/>indexURL: "...fa.fai",<br/>tracks: [{<br/>  url: "...sorted.gff3.gz",<br/>  indexURL: "...gff3.gz.tbi",<br/>  format: "gff3"<br/>}]}

    GL->>G: Genome.createGenome(config)
    G->>LS: loadSequence(config)

    Note over LS,IF: config.indexURL exists → new IndexedFasta

    LS->>IF: new IndexedFasta
    LS->>IF: init()
    IF->>IF: fetch .fai
    IF->>IF: parse → index
    IF->>IF: build chromosomes
    IF-->>LS:
    LS-->>G:
    G-->>GL:
```

### Feature Loading — Indexed Path (the key difference)

```mermaid
%%{init: {'themeVariables': {'fontSize': '16px'}}}%%
sequenceDiagram
    autonumber
    participant ARS as AnnotationRenderService
    participant TFS as TextFeatureSource
    participant FFR as FeatureFileReader
    participant LI as loadIndex()
    participant BL as BGZBlockLoader
    participant BLR as BGZLineReader

    ARS->>TFS: getFeatures({chr, start, end})

    Note over TFS,BLR: Phase 1 — Read header (first call only)

    TFS->>FFR: readHeader()
    FFR->>LI: getIndex()
    LI->>LI: fetch .tbi (~200 KB)
    LI->>LI: detect gzip magic bytes
    LI->>LI: inflate → parseTabixIndex()
    LI-->>FFR: TabixIndex {sequenceIndexMap,<br/>chunksForRange(), tabix: true}

    Note right of FFR: index.tabix === true

    FFR->>BL: new BGZBlockLoader(config)
    FFR->>BLR: new BGZLineReader(config)
    FFR->>BLR: parseHeader(bgzLineReader) → nextLine()
    BLR->>BLR: range request [0, 26)
    BLR->>BLR: get block size
    BLR->>BLR: range request [0, blockSize)
    BLR->>BLR: inflate → text
    BLR-->>FFR: "##gff-version 3"
    FFR-->>TFS: header parsed

    Note over TFS,BL: Phase 2 — Read features for region

    TFS->>FFR: readFeatures(chr, start, end)

    Note right of FFR: index.tabix = true<br/>→ loadFeaturesWithIndex()

    FFR->>FFR: refId = index.sequenceIndexMap[chr]
    FFR->>FFR: chunks = index.chunksForRange(<br/>refId, start, end)

    loop for each chunk
        FFR->>BL: _blockLoader.getData(<br/>chunk.minv, chunk.maxv)
        BL->>BL: range request [minv.block,<br/>maxv.block + blockSize)
        BL->>BL: find block boundaries
        BL->>BL: inflate each block
        BL-->>FFR: decompressed bytes
    end

    FFR->>FFR: _parse(features, dataWrapper, chr, end, start)<br/>→ FeatureParser.parseFeatures()<br/>(GFF3 codec: decode lines,<br/>combine parent/child features)

    FFR-->>TFS: features[]
    TFS-->>ARS: features[]

    ARS->>ARS: renderGeneAnnotation()
```

---

## Interaction Diagram: Component Relationships

This shows the static relationships between all components involved in genome loading.

```mermaid
%%{init: {'themeVariables': {'fontSize': '18px', 'fontFamily': 'arial'}, 'flowchart': {'nodeSpacing': 60, 'rankSpacing': 50}}}%%
flowchart TB
    subgraph EntryPoint["Entry Point"]
        MAIN[main.js<br/>setCustomRegistryURL · initializeGenomeRegistry]
    end

    subgraph Registry["Registry Layer"]
        GR[genomeRegistry<br/>facade<br/>getGenomeConfig · initializeGenomeRegistry]
        IGV[igvOrgRegistrySource<br/>fetch igv.org genomes3.json]
        CUSTOM[customRegistrySource<br/>fetch custom JSON]
    end

    subgraph AppLayer["App Layer"]
        ARS[AnnotationRenderService<br/>on assembly:emphasis<br/>→ getGenomePayload · getFeatures · renderGeneAnnotation]
        GL[GenomeLibrary<br/>getGenomePayload<br/>→ getGenomeConfig · Genome.createGenome<br/>→ new TextFeatureSource · new FeatureRenderer]
    end

    subgraph GenomeLayer["Genome Construction"]
        GENOME[Genome<br/>init · chromosomes · sequence]
        LS[loadSequence<br/>dispatches to:]
        IF[IndexedFasta<br/>.fai index · range reqs]
        NIF[NonIndexedFasta<br/>full load]
    end

    subgraph FeatureLayer["Feature Loading"]
        TFS[TextFeatureSource<br/>getFeatures · loadFeatures]
        FFR[FeatureFileReader<br/>readHeader · readFeatures · getIndex]
        LI[loadIndex<br/>fetch + parse .tbi]
        TI[TabixIndex<br/>sequenceIndexMap · chunksForRange]
        FP[FeatureParser<br/>parseHeader · parseFeatures<br/>→ RefSeq / GFF3 / BED codec]
    end

    subgraph BGZLayer["BGZ Infrastructure"]
        BL[BGZBlockLoader<br/>getData · HTTP range reqs<br/>inflate blocks · block caching]
        BLR[BGZLineReader<br/>nextLine<br/>header reading from bgzip files]
    end

    MAIN --> GR
    GR --> IGV
    GR --> CUSTOM

    ARS -->|"getGenomePayload()"| GL
    GL --> GENOME
    GL --> TFS
    GENOME --> LS
    LS --> IF
    LS --> NIF

    TFS --> FFR
    FFR --> LI
    FFR --> FP
    LI --> TI
    TI --> BL
    FFR --> BLR
```

---

## Branching Points

The two paths diverge at three key decision points, all driven by the presence of `indexURL` in the config:

### 1. `loadSequence()` — FASTA loading strategy

```javascript
// src/igvCore/genome/loadSequence.js

if (reference.indexURL && !isDataURL(reference.fastaURL)) {
    fasta = new IndexedFasta(reference)     // ← has .fai → range requests
} else if (isDataURL(reference.fastaURL) || !reference.indexURL) {
    fasta = new NonIndexedFasta(reference)  // ← no .fai → load entire file
}
```

**Config property**: top-level `indexURL` (points to `.fa.fai`)

### 2. `FeatureFileReader.readFeatures()` — annotation loading strategy

```javascript
// src/igvCore/io/featureFileReader.js

const index = await this.getIndex()
if (index) {
    this.indexed = true
    allFeatures = await this.loadFeaturesWithIndex(chr, start, end)  // ← has .tbi → range requests
} else {
    this.indexed = false
    allFeatures = await this.loadFeaturesNoIndex()                   // ← no .tbi → load entire file
}
```

**Config property**: track-level `indexURL` (points to `.gff3.gz.tbi`)

### 3. `FeatureFileReader.readHeader()` — header reading strategy

```javascript
// src/igvCore/io/featureFileReader.js

if (this.config.indexURL) {
    const index = await this.getIndex()
    if (index.tabix) {
        this._blockLoader = new BGZBlockLoader(this.config)
        const dataWrapper = new BGZLineReader(this.config)        // ← bgzip → read block by block
        this.header = await this.parser.parseHeader(dataWrapper)
    } else {
        // non-tabix index: load first bytes of file                // ← standard HTTP range
    }
} else {
    // no index: load entire file and parse header + features       // ← full download
}
```

---

## Config Comparison

These are the config objects that drive the two paths:

### igv.org genome (hg38)

```json
{
    "id": "hg38",
    "name": "Human (GRCh38/hg38)",
    "fastaURL": "https://s3.amazonaws.com/igv.broadinstitute.org/genomes/seq/hg38/hg38.fa",
    "indexURL": "https://s3.amazonaws.com/igv.broadinstitute.org/genomes/seq/hg38/hg38.fa.fai",
    "tracks": [
        {
            "name": "Refseq Genes",
            "url": "https://s3.amazonaws.com/igv.org.genomes/hg38/refGene.sorted.txt.gz",
            "indexURL": "https://s3.amazonaws.com/igv.org.genomes/hg38/refGene.sorted.txt.gz.tbi",
            "format": "refgene"
        }
    ]
}
```

### Custom genome (HG00099)

```json
{
    "id": "HG00099",
    "name": "HG00099 test file (Cici) - local",
    "fastaURL": "http://localhost:8000/data/genomes/HG00099_hap1_hprc_r2_v1.0.1.fa",
    "indexURL": "http://localhost:8000/data/genomes/HG00099_hap1_hprc_r2_v1.0.1.fa.fai",
    "tracks": [
        {
            "name": "Gene annotations",
            "url": "http://localhost:8000/data/genomes/HG00099...sorted.gff3.gz",
            "indexURL": "http://localhost:8000/data/genomes/HG00099...sorted.gff3.gz.tbi",
            "format": "gff3"
        }
    ]
}
```

The structural difference is minimal — both have the same shape. The key differences are:
- **Source**: igv.org registry vs custom registry JSON
- **Format**: `"refgene"` vs `"gff3"` → determines which codec FeatureParser uses
- **URLs**: S3-hosted vs localhost (in dev) or project-hosted

---

## Data Flow Summary

| Step | igv.org path | Custom genome path |
|------|-------------|-------------------|
| **Registry** | igvOrgRegistrySource → igv.org API | customRegistrySource → local/remote JSON |
| **FASTA** | IndexedFasta + `.fai` | IndexedFasta + `.fai` |
| **FASTA access** | HTTP range requests | HTTP range requests |
| **Annotation format** | RefSeq (refgene) | GFF3 |
| **Annotation index** | `.tbi` (tabix) | `.tbi` (tabix) |
| **Annotation access** | `loadFeaturesWithIndex()` via BGZBlockLoader | `loadFeaturesWithIndex()` via BGZBlockLoader |
| **Feature parsing** | RefSeq codec | GFF3 codec (with parent/child combining) |

Both paths converge on the same indexed infrastructure. The primary differences are the registry source and the annotation format/codec.
