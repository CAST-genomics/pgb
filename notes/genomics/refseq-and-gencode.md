# RefSeq and GENCODE

Two independent gene annotation databases for reference genomes (human, mouse, etc.). PGB encounters RefSeq because that's what IGV.org's genome registry ships as the default annotation track for GRCh38/hg38.

## RefSeq

**RefSeq** (NCBI Reference Sequence Database) is a curated, non-redundant set of reference sequences — genomic DNA, transcripts (mRNA), and proteins — maintained by **NCBI** (National Center for Biotechnology Information, part of the US NIH). Established ~2000.

For a reference genome like GRCh38, the RefSeq annotation track tells you **where the genes are**:
- exon/intron structure of every transcript
- UTRs and CDS boundaries
- gene symbols (BRCA1, TP53, …)
- stable accession IDs:
  - `NM_007294.4` — an mRNA
  - `NP_009225.1` — its protein
  - `NC_000017.11` — chromosome 17 itself

NCBI runs an annotation pipeline combining aligned transcript evidence (GenBank submissions, RNA-seq) with manual curation by NCBI staff. The "curated" part is the distinguishing feature — entries are reviewed and consolidated, not just deposited.

## GENCODE

**GENCODE** is the parallel project from **EBI/Sanger + UCSC**, produced by the **HAVANA** manual annotation team at the Sanger Institute merged with **Ensembl**'s automated annotation pipeline. It is the official gene annotation for the ENCODE project and for human/mouse in Ensembl.

## How they relate

They are **two independent annotations of the same genome**, by two different institutions, with different editorial philosophies — not derived from each other. For GRCh38 they cover roughly the same protein-coding genes (~20k) and largely agree on canonical exon structure, but they diverge on:

| Aspect | RefSeq | GENCODE |
|---|---|---|
| Transcript isoforms | Fewer per gene | More inclusive — more alternative transcripts |
| Non-coding RNAs / pseudogenes | Less rich | HAVANA manual curation is considered the richer source |
| ID namespace | `NM_` / `NR_` / `NP_` / `NC_` accessions | `ENSG…` / `ENST…` / `ENSP…` |

Mapping between RefSeq and GENCODE/Ensembl IDs is a constant minor headache.

### MANE

**MANE** (Matched Annotation from NCBI and EBI) is a joint NCBI+EBI effort that picks one "MANE Select" transcript per gene that both databases agree on — explicitly an attempt to reduce the RefSeq-vs-GENCODE friction for clinical use.

## Why PGB shows RefSeq for GRCh38

Not a deep choice — it's whatever `https://igv.org/genomes/genomes3.json` ships as the default annotation for hg38. IGV historically defaults to RefSeq because NCBI hosts stable, well-indexed track files.

To use GENCODE instead, point the genome config at a GENCODE GFF3/BigBed URL (Ensembl and UCSC both publish them) and swap the track entry. The rest of the pipeline (`TextFeatureSource` / `BWSource` → `FeatureRenderer`) is format-driven and wouldn't care.

See also: [genome-loading-architecture.md](./genome-loading-architecture.md), [bigbed-annotation-format.md](./bigbed-annotation-format.md).
