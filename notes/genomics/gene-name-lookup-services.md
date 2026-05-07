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

## JavaScript `fetch` examples

These examples normalize results to:

- `{ chr, start, end, name }`

### Shared helpers

```js
function parseIgvLocusLine(line) {
  // Example line: "EGFR chr7:55019016-55211628 s3 hg38"
  const parts = line.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const name = parts[0];
  const [chrPart, rangePart] = parts[1].split(":");
  if (!chrPart || !rangePart) return null;
  const [startStr, endStr] = rangePart.split("-");
  const start = Number(startStr.replaceAll(",", ""));
  const end = Number(endStr.replaceAll(",", ""));
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return { chr: chrPart, start, end, name };
}
```

### 1) IGV Locus Search

```js
async function lookupWithIgv({ genome = "hg38", gene }) {
  const url = `https://igv.org/genomes/locus.php?genome=${encodeURIComponent(genome)}&name=${encodeURIComponent(gene)}`;
  const text = await fetch(url).then((r) => r.text());
  const firstLine = text.split(/\r?\n/).find((line) => line.trim().length > 0);
  return firstLine ? parseIgvLocusLine(firstLine) : null;
}
```

### 2) Ensembl REST

```js
async function lookupWithEnsembl({ species = "homo_sapiens", gene }) {
  const url = `https://rest.ensembl.org/lookup/symbol/${encodeURIComponent(species)}/${encodeURIComponent(gene)}?content-type=application/json`;
  const data = await fetch(url, { headers: { Accept: "application/json" } }).then((r) => r.json());
  if (!data?.seq_region_name || data.start == null || data.end == null) return null;
  return {
    chr: String(data.seq_region_name).startsWith("chr") ? data.seq_region_name : `chr${data.seq_region_name}`,
    start: Number(data.start),
    end: Number(data.end),
    name: data.display_name || gene.toUpperCase(),
  };
}
```

### 3) MyGene.info

```js
async function lookupWithMyGene({ species = "human", gene }) {
  const url = `https://mygene.info/v3/query?q=${encodeURIComponent(gene)}&species=${encodeURIComponent(species)}&fields=symbol,genomic_pos&size=1`;
  const data = await fetch(url).then((r) => r.json());
  const hit = data?.hits?.[0];
  if (!hit) return null;
  const gp = Array.isArray(hit.genomic_pos) ? hit.genomic_pos[0] : hit.genomic_pos;
  if (!gp?.chr || gp.start == null || gp.end == null) return null;
  const chr = String(gp.chr).startsWith("chr") ? String(gp.chr) : `chr${gp.chr}`;
  return { chr, start: Number(gp.start), end: Number(gp.end), name: hit.symbol || gene.toUpperCase() };
}
```

### 4) NCBI E-utilities (2-step)

```js
async function lookupWithNcbi({ gene, organism = "Homo sapiens" }) {
  const searchTerm = `${gene}[Gene Name] AND ${organism}[Organism]`;
  const esearchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=gene&term=${encodeURIComponent(searchTerm)}&retmode=json`;
  const esearch = await fetch(esearchUrl).then((r) => r.json());
  const geneId = esearch?.esearchresult?.idlist?.[0];
  if (!geneId) return null;

  const esummaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=gene&id=${encodeURIComponent(geneId)}&retmode=json`;
  const esummary = await fetch(esummaryUrl).then((r) => r.json());
  const rec = esummary?.result?.[geneId];
  const chr = rec?.chromosome ? (String(rec.chromosome).startsWith("chr") ? rec.chromosome : `chr${rec.chromosome}`) : null;
  const start = Number(rec?.genomicinfo?.[0]?.chrstart);
  const end = Number(rec?.genomicinfo?.[0]?.chrstop);
  if (!chr || !Number.isFinite(start) || !Number.isFinite(end)) return null;
  return { chr, start: Math.min(start, end), end: Math.max(start, end), name: rec?.name || gene.toUpperCase() };
}
```

### 5) UCSC Genome API

```js
async function lookupWithUcsc({ genome = "hg38", gene }) {
  const url = `https://api.genome.ucsc.edu/getData/track?genome=${encodeURIComponent(genome)};track=knownGene;name=${encodeURIComponent(gene)}`;
  const data = await fetch(url).then((r) => r.json());
  const rows = data?.knownGene;
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row?.chrom || row.txStart == null || row.txEnd == null) return null;
  return { chr: row.chrom, start: Number(row.txStart), end: Number(row.txEnd), name: gene.toUpperCase() };
}
```

### 6) HGNC REST (normalization step)

```js
async function normalizeWithHgnc(gene) {
  const url = `https://rest.genenames.org/fetch/symbol/${encodeURIComponent(gene)}`;
  const data = await fetch(url, { headers: { Accept: "application/json" } }).then((r) => r.json());
  const doc = data?.response?.docs?.[0];
  return doc?.symbol || null; // Use this symbol in Ensembl/NCBI/UCSC calls
}
```

### Example fallback chain

```js
async function lookupGeneLocus(gene) {
  const normalized = (await normalizeWithHgnc(gene)) || gene;
  return (
    (await lookupWithIgv({ genome: "hg38", gene: normalized })) ||
    (await lookupWithEnsembl({ species: "homo_sapiens", gene: normalized })) ||
    (await lookupWithMyGene({ species: "human", gene: normalized }))
  );
}
```
