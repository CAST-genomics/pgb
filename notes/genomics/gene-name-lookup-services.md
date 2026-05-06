# Gene Name Lookup Services

This note lists practical alternatives for converting a gene symbol (for example `EGFR`) into a genomic locus.

## 1) IGV Locus Search (current app behavior)

- **Best for:** quick symbol -> locus lookup, especially for IGV-style workflows.
- **Typical call pattern:** query by genome build and feature name.
- **Example call:**
  - `https://igv.org/genomes/locus.php?genome=hg38&name=egfr`
- **Typical response shape (plain text):**
  - `EGFR chr7:55019016-55211628 s3 hg38`

## 2) Ensembl REST (lookup by symbol)

- **Best for:** assembly-aware lookups with rich metadata and broad species support.
- **Typical call pattern:** `lookup/symbol/{species}/{symbol}`.
- **Example call:**
  - `https://rest.ensembl.org/lookup/symbol/homo_sapiens/EGFR?content-type=application/json`
- **Typical response fields (JSON):**
  - `seq_region_name`, `start`, `end`, `strand`, `display_name`, `id`

## 3) MyGene.info

- **Best for:** fast, flexible gene search with alias support and many identifier systems.
- **Typical call pattern:** text query with requested output fields.
- **Example call:**
  - `https://mygene.info/v3/query?q=EGFR&species=human&fields=symbol,name,genomic_pos`
- **Typical response fields (JSON):**
  - `hits[].symbol`, `hits[].name`, `hits[].genomic_pos.chr`, `hits[].genomic_pos.start`, `hits[].genomic_pos.end`

## 4) NCBI E-utilities (Gene)

- **Best for:** authoritative NCBI identifiers and robust alias/name normalization.
- **Typical call pattern:** first resolve symbol -> Gene ID, then fetch detailed record.
- **Example calls:**
  - Search for Gene ID:
    - `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=gene&term=EGFR[Gene%20Name]+AND+Homo%20sapiens[Organism]&retmode=json`
  - Fetch record by Gene ID (replace `1956` as needed):
    - `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=gene&id=1956&retmode=json`
- **Typical response fields (JSON/XML depending on endpoint):**
  - Gene ID, official symbol, aliases, genomic location metadata

## 5) UCSC Genome Browser APIs / Public Tables

- **Best for:** UCSC-centric pipelines and explicit genome-build control (`hg38`, `hg19`, etc.).
- **Typical call pattern:** query known-gene related tables or public API endpoints by gene name.
- **Example call (public API pattern):**
  - `https://api.genome.ucsc.edu/getData/track?genome=hg38;track=knownGene;name=EGFR`
- **Typical response fields (JSON):**
  - chromosome, tx start/end, exon structures, transcript metadata

## 6) HGNC REST (symbol normalization for human genes)

- **Best for:** validating and normalizing human gene symbols before coordinate lookup.
- **Typical call pattern:** search or fetch by symbol; then pass normalized symbol to Ensembl/NCBI/UCSC.
- **Example call:**
  - `https://rest.genenames.org/fetch/symbol/EGFR`
- **Typical response fields (JSON):**
  - approved symbol, aliases, previous symbols, HGNC ID

---

## Practical integration notes

- **Assembly consistency matters:** ensure returned coordinates match your target build (`hg38` vs `hg19` vs `GRCh38` naming conventions).
- **Normalize first, locate second:** for user-entered text, run symbol normalization (for example HGNC or MyGene) before coordinate lookup.
- **Handle multiple hits:** some symbols/aliases may map to multiple records; present choices or apply deterministic ranking.
- **Cache frequent queries:** gene symbols like `EGFR`, `BRCA1`, and `TP53` are often repeated and cache well.
