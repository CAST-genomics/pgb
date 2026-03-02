# IGVCore Architecture

IGVCore is a subset of the IGV.js codebase extracted into PGB. It provides two capabilities: loading and rendering gene annotations on a 2D canvas, and resolving gene names to genomic coordinates. PGB interacts with IGVCore through exactly two seams.

## Directory Structure

```
src/IGVCore/
├── genome/           Entry point: genomeLibrary.js
│   ├── genomeLibrary.js    Facade — the only file PGB imports directly
│   ├── genome.js           Genome model (chromosomes, aliases, sequences)
│   ├── knownGenomes.js     Registry of genome configs (hg38, hs1, etc.)
│   └── ...                 Chromosome loading, sequence fetching, cytobands
├── codec/            Pure parsing
│   └── refGeneCodec.js     decodeGenePredExt, findUTRs, decodeExons
├── io/               Data loading
│   ├── textFeatureSource.js   Loads + caches features, delegates to reader
│   ├── featureFileReader.js   Fetches raw data via igvxhr, delegates to parser
│   ├── dataWrapper.js         String/ByteArray line iterator
│   ├── baseFeatureSource.js   Abstract base with next/previous feature
│   ├── chromAliasManager.js   Maps chromosome names between sources
│   ├── binary.js              Binary parser for BigWig/TwoBit formats
│   └── bigwig/                BigBed/BigWig binary readers
├── layout/           Feature packing
│   └── featurePacker.js       Row assignment for overlapping features
├── rendering/        Canvas drawing
│   ├── featureRenderer.js     Draws gene models (exons, UTRs, introns, arrows)
│   ├── featureRendererUtils.js  Coordinate conversion, translation dictionary
│   ├── exonUtils.js           Exon phase/start/end helpers
│   └── igvCanvas.js           Canvas drawing primitives (strokeLine, fillText, etc.)
├── search/           Gene name resolution
│   └── geneSearch.js          Calls IGV web service to resolve names to loci
├── feature/          Parsing glue (2 files remain)
│   ├── featureParser.js       Configures decoder, iterates lines → features
│   └── featureUtils.js        packFeatures (multi-chromosome wrapper)
├── util/             Shared utilities
│   ├── sequenceUtils.js       DNA complement/reverse-complement
│   ├── igvUtils.js            HTTP option building, data URL detection
│   ├── ucscUtils.js           AutoSQL parser (for BigBed schemas)
│   └── colorPalletes.js       Color generation for canvas rendering
└── qtl/
    └── qtlSelections.js       Null object for QTL phenotype selections
```

## Seam 1: Gene Annotations

When a user emphasizes an assembly in the 3D graph, PGB renders gene annotations on a 2D canvas strip below the viewport.

```
┌─────────────────────────────────────────────────────────────────────┐
│                     GENE ANNOTATION SEQUENCE                        │
│                                                                     │
│  User clicks assembly    annotationRenderService      genomeLibrary │
│  in 3D graph             (PGB)                        (IGVCore)     │
│       │                        │                           │        │
│       │  assembly:emphasis     │                           │        │
│       │───────────────────────>│                           │        │
│       │                        │                           │        │
│       │                        │  getGenomePayload(id)     │        │
│       │                        │──────────────────────────>│        │
│       │                        │                           │        │
│       │                        │                     ┌─────┴──────┐ │
│       │                        │                     │ Look up id │ │
│       │                        │                     │ in known   │ │
│       │                        │                     │ Genomes    │ │
│       │                        │                     └─────┬──────┘ │
│       │                        │                           │        │
│       │                        │                     ┌─────┴──────┐ │
│       │                        │                     │ Create     │ │
│       │                        │                     │ Genome     │ │
│       │                        │                     │ (async     │ │
│       │                        │                     │  init)     │ │
│       │                        │                     └─────┬──────┘ │
│       │                        │                           │        │
│       │                        │                     ┌─────┴──────┐ │
│       │                        │                     │ Create     │ │
│       │                        │                     │ TextFeat-  │ │
│       │                        │                     │ ureSource  │ │
│       │                        │                     │ + Feature  │ │
│       │                        │                     │ Renderer   │ │
│       │                        │                     └─────┬──────┘ │
│       │                        │                           │        │
│       │                        │  { genome, featureSource, │        │
│       │                        │    geneRenderer }         │        │
│       │                        │<──────────────────────────│        │
│       │                        │                           │        │
│       │                        │  featureSource            │        │
│       │                        │  .getFeatures(chr,s,e)    │        │
│       │                        │──────────────────────────>│        │
│       │                        │                           │        │
│       │                        │                     ┌─────┴──────┐ │
│       │                        │                     │ igvxhr     │ │
│       │                        │                     │ loads      │ │
│       │                        │                     │ refGene    │ │
│       │                        │                     │ data from  │ │
│       │                        │                     │ UCSC       │ │
│       │                        │                     └─────┬──────┘ │
│       │                        │                           │        │
│       │                        │                     ┌─────┴──────┐ │
│       │                        │                     │ DataWrapper│ │
│       │                        │                     │ → Parser   │ │
│       │                        │                     │ → Codec    │ │
│       │                        │                     │ → Pack     │ │
│       │                        │                     └─────┬──────┘ │
│       │                        │                           │        │
│       │                        │  features[]               │        │
│       │                        │<──────────────────────────│        │
│       │                        │                           │        │
│       │                        │  geneRenderer             │        │
│       │                        │  .draw({features,         │        │
│       │                        │    context, bpPerPixel,   │        │
│       │                        │    bpStart, bpEnd, ...})  │        │
│       │                        │──────────────────────────>│        │
│       │                        │                           │        │
│       │                        │                     ┌─────┴──────┐ │
│       │                        │                     │ Render to  │ │
│       │                        │                     │ 2D canvas: │ │
│       │                        │                     │ exons,     │ │
│       │                        │                     │ UTRs,      │ │
│       │                        │                     │ intron     │ │
│       │                        │                     │ lines,     │ │
│       │                        │                     │ arrows,    │ │
│       │                        │                     │ labels     │ │
│       │                        │                     └────────────┘ │
│       │                        │                                    │
│       │  canvas updated        │                                    │
│       │<───────────────────────│                                    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Data flow detail: loading features

When `textFeatureSource.getFeatures()` is called for the first time, the internal chain is:

```
TextFeatureSource.getFeatures(chr, start, end)
    │
    ├── TextFeatureSource.loadFeatures()
    │       │
    │       ├── FeatureFileReader.readHeader()
    │       │       │
    │       │       ├── igvxhr.loadByteArray(url)      ← HTTP fetch from UCSC
    │       │       │
    │       │       ├── getDataWrapper(data)            ← io/dataWrapper.js
    │       │       │       returns StringDataWrapper or ByteArrayDataWrapper
    │       │       │
    │       │       ├── FeatureParser.parseHeader()     ← feature/featureParser.js
    │       │       │       sets decoder = decodeGenePredExt, shift = 1
    │       │       │
    │       │       └── FeatureParser.parseFeatures()
    │       │               │
    │       │               ├── for each line: split by delimiter
    │       │               │
    │       │               └── decodeGenePredExt(tokens, header)  ← codec/refGeneCodec.js
    │       │                       │
    │       │                       ├── parse name, chr, strand, start, end, cdStart, cdEnd
    │       │                       ├── decodeExons(count, starts, ends, frames)
    │       │                       └── findUTRs(exons, cdStart, cdEnd)
    │       │
    │       ├── packFeatures(features)                 ← feature/featureUtils.js
    │       │       │
    │       │       └── pack(featureList)               ← layout/featurePacker.js
    │       │               assigns row numbers for non-overlapping display
    │       │
    │       └── new FeatureCache(features)              ← igv-utils
    │
    └── featureCache.queryFeatures(chr, start, end)
            returns features in the requested range
```

### What the renderer draws

`FeatureRenderer.draw()` iterates features and for each one calls `render()`:

- **Single-exon features**: a filled rectangle with directional arrows (strand)
- **Multi-exon features**: a thin center line (intron) with thick rectangles (exons)
  - UTR exons are drawn at half-height
  - Coding exons at full height
  - Partial UTR/coding exons split at cdStart/cdEnd boundaries
  - Directional arrows along intron lines and within wide exons
- **Labels**: gene names centered below features (when zoom permits)
- **Amino acid rendering**: at very high zoom (< 0.25 bp/pixel), codons are translated and drawn over coding exons

## Seam 2: Gene Search

When a user types a gene name in the locus input, PGB resolves it to genomic coordinates via the IGV web service.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        GENE SEARCH SEQUENCE                         │
│                                                                     │
│  User types gene name    locusInput          geneSearch             │
│  in locus input          (PGB)               (IGVCore)              │
│       │                      │                    │                 │
│       │  "BRCA2" + Enter     │                    │                 │
│       │─────────────────────>│                    │                 │
│       │                      │                    │                 │
│       │                      │  searchFeatures(   │                 │
│       │                      │    {genome},       │                 │
│       │                      │    'BRCA2')        │                 │
│       │                      │───────────────────>│                 │
│       │                      │                    │                 │
│       │                      │              ┌─────┴──────┐         │
│       │                      │              │ Build URL: │         │
│       │                      │              │ igv.org/   │         │
│       │                      │              │ genomes/   │         │
│       │                      │              │ locus.php  │         │
│       │                      │              │ ?genome=   │         │
│       │                      │              │ hg38&name= │         │
│       │                      │              │ BRCA2      │         │
│       │                      │              └─────┬──────┘         │
│       │                      │                    │                 │
│       │                      │              ┌─────┴──────┐         │
│       │                      │              │ igvxhr     │         │
│       │                      │              │ .loadString│         │
│       │                      │              │ (url)      │         │
│       │                      │              └─────┬──────┘         │
│       │                      │                    │                 │
│       │                      │              ┌─────┴──────────────┐ │
│       │                      │              │ Parse response:    │ │
│       │                      │              │ "BRCA2\tchr13:     │ │
│       │                      │              │  32,315,474-       │ │
│       │                      │              │  32,400,266\t      │ │
│       │                      │              │  refseq"           │ │
│       │                      │              │                    │ │
│       │                      │              │ → { chr: 'chr13',  │ │
│       │                      │              │     start, end }   │ │
│       │                      │              └─────┬──────────────┘ │
│       │                      │                    │                 │
│       │                      │  {chr, start, end} │                 │
│       │                      │<───────────────────│                 │
│       │                      │                    │                 │
│       │                      │  ingestLocus(      │                 │
│       │                      │    chr, start, end)│                 │
│       │                      │───> load pangenome │                 │
│       │                      │     graph for this │                 │
│       │                      │     region         │                 │
│       │                      │                    │                 │
│       │  3D graph loads      │                    │                 │
│       │<─────────────────────│                    │                 │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Unknown genome fallback

When an assembly's genome ID is not in `knownGenomes` (e.g., a non-human reference), `getGenomePayload()` returns `undefined`. In this case, `annotationRenderService` falls back to rendering simple genomic extent markers (vertical tick marks at node boundaries) instead of gene annotations. This is the `isSequenceRenderer = true` path.

```
annotationRenderService.handleAssemblyEmphasis()
    │
    ├── genomeLibrary.getGenomePayload(genomeId)
    │       returns undefined (unknown genome)
    │
    └── renderGenomicExtents()
            draws vertical tick marks at node boundaries
            (no gene model rendering)
```

## What changed in the refactoring

The original IGVCore directory was a flat copy of IGV.js internals. The refactoring reorganized ~50 files into modules that reflect PGB's actual usage:

| Before | After | What changed |
|--------|-------|-------------|
| `feature/decode/ucsc.js` (661 lines, 13 decoders) | `codec/refGeneCodec.js` (~100 lines, 1 decoder) | 12 unused decoders deleted |
| `feature/` (14 files mixing I/O, parsing, rendering) | Split across `io/`, `rendering/`, `codec/`, `layout/` | Each module has a single concern |
| `feature/gff/` (4 files) | Deleted | Dead code — GFF parsing unreachable from PGB |
| `bigwig/` at top level | `io/bigwig/` | Binary I/O grouped with other I/O |
| `binary.js` at top level | `io/binary.js` | Same |
| `igv-canvas.js` at top level | `rendering/igvCanvas.js` | Grouped with rendering |
| `search.js` at top level | `search/geneSearch.js` | Own module |
| No tests | 83 characterization tests | Feathers-style safety net for future changes |

The two external entry points remain unchanged:
- `src/main.js` → `import GenomeLibrary from "./igvCore/genome/genomeLibrary.js"`
- `src/locusInput.js` → `import {searchFeatures} from "./igvCore/search/geneSearch.js"`
