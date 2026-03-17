# Genomics and IGV.js Reference for Software Developers

A reference document for developers building tools that support genomic research. Covers core concepts, terminology, file formats, and IGV.js configuration.

---

## Table of Contents

1. [Glossary](#glossary)
2. [Core Concepts](#core-concepts)
3. [File Formats](#file-formats)
4. [IGV.js Overview](#igvjs-overview)
5. [Adding Genome Support to IGV.js](#adding-genome-support-to-igvjs)
6. [Annotation Tracks from GFF3](#annotation-tracks-from-gff3)
7. [IGV.js Configuration Reference](#igvjs-configuration-reference)
8. [UCSC Assembly Hub List](#ucsc-assembly-hub-list)
9. [Practical Checklist](#practical-checklist)

---

## Glossary

| Term | Definition |
|------|------------|
| **Accession** | A unique, stable identifier assigned to a genome assembly when it is submitted to NCBI databases (GenBank, RefSeq). Example: `GCA_000001405.29`. Used to reference the same assembly across databases (NCBI, UCSC, Ensembl). |
| **Assembly** | (1) The computational process of reconstructing a genome sequence from short sequencing reads. (2) The resulting reference genome—a specific reconstruction of an organism's genome. Different assemblies of the same species exist (e.g., human hg19, hg38, T2T-CHM13). |
| **Base pair (bp)** | The fundamental unit of DNA length. One base pair = one letter (A, T, G, or C) in the sequence. Genome sizes are often given in megabases (Mb) or gigabases (Gb). |
| **CDS** | Coding sequence. The portion of a gene that is translated into protein. Defined by start and stop codons. |
| **Chromosome** | A single, continuous DNA molecule. In a finished assembly, each chromosome is one sequence. |
| **Clade** | A biological grouping. In the UCSC assembly list: mammals, primates, birds, fish, plants, fungi, bacteria, etc. |
| **Contig** | A contiguous stretch of sequence with no gaps. Contigs are the building blocks of an assembly; they may be joined into scaffolds. |
| **Coordinate** | A position (in base pairs) along a reference sequence. Genomic coordinates are 1-based in GFF3 and many formats. |
| **CORS** | Cross-Origin Resource Sharing. Web servers must send appropriate headers to allow browsers to fetch genomic data from a different domain. Required for IGV.js to load remote files. |
| **Cytoband** | Chromosome bands visible under a microscope. Used in ideograms to show chromosome structure. Optional enhancement for IGV.js. |
| **Exon** | A segment of a gene that is retained in the mature RNA after splicing. Exons are typically the coding parts; introns are removed. |
| **FASTA** | A plain-text format for storing biological sequences (DNA, RNA, or protein). Each sequence has a header line (starting with `>`) followed by the sequence letters. |
| **GCA_** | GenBank assembly accession prefix. Indicates the assembly was submitted to GenBank. |
| **GCF_** | RefSeq assembly accession prefix. Indicates an NCBI-curated reference assembly. |
| **GFF3** | General Feature Format version 3. A standard format for genomic annotations—genes, transcripts, exons, CDS—with coordinates and attributes. |
| **GenArk** | UCSC's assembly hub system. Hosts thousands of genome assemblies. IGV.js can use GenArk assemblies by accession ID. |
| **Gene** | A region of DNA that encodes a functional product (protein or RNA). |
| **Genome** | The complete set of genetic material (DNA) of an organism. |
| **IGV** | Integrative Genomics Viewer. A desktop application for visualizing genomic data. |
| **IGV.js** | The JavaScript, embeddable version of IGV. Runs in web browsers. |
| **Intron** | A segment of a gene that is removed during RNA splicing. Lies between exons. |
| **Legacy assembly** | An outdated assembly that has been superseded by a newer, improved version. Marked with `(L)` in the UCSC list. |
| **Reference genome** | A specific assembly used as the coordinate system for annotations, variants, and alignments. All positions are defined relative to this sequence. |
| **Scaffold** | Contigs ordered and oriented with gaps (represented as Ns) where the order or sequence is uncertain. |
| **seqid** | In GFF3, the identifier of the reference sequence (chromosome or contig) on which a feature is located. Must match the sequence IDs in the reference FASTA. |
| **Sequencing** | The process of reading DNA to produce short fragments (reads). |
| **Strand** | The direction of a sequence. `+` (forward) or `-` (reverse). Genes can be on either strand. |
| **Transcript** | An RNA molecule produced from a gene. One gene can have multiple transcripts (splice isoforms). |
| **Track** | A layer of data displayed in IGV (e.g., gene annotations, alignments, variants). Tracks are overlaid on the reference genome. |
| **TwoBit** | A compact binary format for DNA sequence, developed by UCSC. More efficient than FASTA for large genomes. |

---

## Core Concepts

### What is sequencing?

Sequencing reads short fragments of DNA. Modern technologies produce millions or billions of reads, each typically 100–300 base pairs (Illumina) or longer (PacBio, Oxford Nanopore). The output is raw reads—not a complete genome.

### What is assembly?

Assembly is the computational process of reconstructing the full genome from those reads. It finds overlapping reads, orders and orients them, and produces contiguous sequences (contigs and scaffolds). The result is a **reference genome**—a specific reconstruction of the organism's DNA.

### Why do assemblies differ?

- **Technology**: Different sequencers produce different read lengths and error profiles.
- **Methods**: Different assemblers use different algorithms.
- **Time**: Newer assemblies often improve on older ones.
- **Sample**: Different individuals or cell lines have different DNA.

So there are multiple assemblies for the same species (e.g., human: hg19, hg38, T2T-CHM13).

### What is a reference genome?

A reference genome is the coordinate system for genomic data. When a scientist says "position 100,000 on chromosome 1," that position is defined relative to a specific assembly. All annotations, variants, and alignments use coordinates from that reference. Changing the reference changes the coordinates.

### What is an accession?

An accession is a stable ID for a genome assembly in public databases. When an assembly is submitted to NCBI, it receives an accession (e.g., `GCA_000001405.29`). This ID is used consistently across NCBI, UCSC, Ensembl, and other resources. The number after the dot can change when the assembly is updated.

---

## File Formats

### FASTA

A plain-text format for biological sequences.

**Structure:**
- Header line: starts with `>`, followed by sequence ID and optional description
- Sequence lines: the actual letters (A, T, G, C for DNA)

**Example:**
```
>CM088564.1 Chromosome 1
ATGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAG
CTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTA
...
>CM088565.1 Chromosome 2
ATGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAG
...
```

**What it provides:**
- Sequence IDs (contig/chromosome names)
- Sequence lengths (from the file structure or `.fai` index)
- The actual DNA sequence (for base-level visualization)

**Index file (`.fai`):** For genomes larger than a few MB, create an index with `samtools faidx reference.fa`. This produces `reference.fa.fai` and enables efficient random access.

### GFF3

General Feature Format version 3. A standard for genomic annotations.

**Structure:** Nine tab-separated columns per line:
1. **seqid** — Reference sequence (chromosome/contig) the feature is on
2. **source** — Program or method that generated the feature
3. **type** — Feature type (gene, transcript, exon, CDS, etc.)
4. **start** — Start position (1-based)
5. **end** — End position (1-based)
6. **score** — Confidence score (or `.`)
7. **strand** — `+`, `-`, or `.`
8. **phase** — Reading frame for CDS (0, 1, 2, or `.`)
9. **attributes** — Key=value pairs (ID, Parent, gene_name, etc.)

**What it provides:**
- Base-pair coordinates for each feature
- Which sequence each feature is on (seqid)
- Strand, feature type, and metadata
- Hierarchical relationships (gene → transcript → exon → CDS) via ID and Parent attributes

**What it does NOT provide:**
- The total length of each sequence (only coordinates of annotated regions)
- The actual DNA sequence

**Critical requirement:** The `seqid` values in the GFF3 must match the sequence IDs in the reference FASTA.

---

## IGV.js Overview

IGV.js is an embeddable JavaScript component for visualizing genomic data in web browsers. It is developed by the IGV team and is MIT licensed.

**What IGV.js displays:**
- A **reference genome** (the coordinate system and, when zoomed in, the actual sequence)
- **Tracks** overlaid on the reference (annotations, alignments, variants, etc.)

**Key point:** IGV.js always requires a reference genome. Tracks cannot be displayed without it. The reference defines the coordinate space; tracks use that coordinate system.

**Documentation:** https://igv.org/doc/igvjs/

---

## Adding Genome Support to IGV.js

There are three main approaches:

### 1. Use an existing UCSC GenArk assembly (simplest)

If the genome is already in UCSC GenArk, use its accession:

```javascript
igv.createBrowser(element, {
  genome: "GCA_000001405.29"
});
```

No hosting required. UCSC provides the sequence and metadata. The UCSC assembly list (49,000+ assemblies) is at: https://hgdownload.soe.ucsc.edu/hubs/UCSC_GI.assemblyHubList.txt

### 2. Custom reference genome (your own FASTA)

When the genome is not in UCSC or IGV's hosted list:

1. **Prepare the FASTA**: Create the reference and, for large genomes, run `samtools faidx reference.fa` to create an index.
2. **Host the files**: Serve via HTTP/HTTPS. The server must allow CORS.
3. **Configure IGV.js**: Pass a `reference` object with `fastaURL` and `indexURL`.

### 3. Add to IGV's hosted registry

For widely used public genomes, contribute to the igv.js project so the genome can be referenced by a short ID (e.g., `hg38`). This requires coordination with the IGV team.

---

## Annotation Tracks from GFF3

### Can GFF3 alone create a track?

The GFF3 file contains everything needed to *define* an annotation track: coordinates, seqids, feature types, and attributes. However, IGV.js cannot display a track without a reference genome. The reference provides the coordinate system and sequence lengths; the GFF3 track is drawn on top of it.

### What GFF3 provides vs. what's missing

| Data | GFF3 | Purpose |
|------|------|---------|
| Base-pair coordinates | ✓ | Where to draw each feature |
| Sequence ID (seqid) | ✓ | Which contig/chromosome |
| Strand, type, attributes | ✓ | How to draw and label |
| Length of each sequence | ✗ | Needed for scaling and navigation |
| Actual DNA sequence | ✗ | Needed for base-level zoom |

The reference genome (FASTA) provides the sequence IDs, lengths, and (when zoomed in) the actual sequence. The GFF3 provides the annotations. Both are required.

### Dependency on FASTA

- **Structural**: The reference defines the coordinate space. Tracks must use seqids that exist in the reference.
- **Sequence lengths**: The FASTA (or `.fai`) defines how long each contig is.
- **Sequence content**: For base-level view, the actual bases come from the FASTA.

---

## IGV.js Configuration Reference

### Single assembly with GFF3 annotation track

```javascript
{
  reference: {
    id: "HG01081_pat",
    name: "HG01081 paternal (HPRC)",
    fastaURL: "https://yourserver.com/genomes/HG01081_pat.fa",
    indexURL: "https://yourserver.com/genomes/HG01081_pat.fa.fai"
  },
  tracks: [
    {
      name: "Gene annotations",
      url: "https://yourserver.com/genomes/HG01081_pat_hprc_r2_v1.0.1_cat_v1.1.gff3.gz",
      format: "gff3",
      indexed: false
    }
  ]
}
```

### With indexed GFF3 (faster for large files)

```javascript
{
  name: "Gene annotations",
  url: "https://yourserver.com/genomes/HG01081_pat_hprc_r2_v1.0.1_cat_v1.1.gff3.gz",
  format: "gff3",
  indexed: true,
  indexURL: "https://yourserver.com/genomes/HG01081_pat_hprc_r2_v1.0.1_cat_v1.1.gff3.gz.tbi"
}
```

### Using the configuration

```javascript
igv.createBrowser(document.getElementById("igv-container"), config);
```

### Creating index files

**FASTA index (required for large genomes):**
```bash
samtools faidx HG01081_pat.fa
# Creates HG01081_pat.fa.fai
```

**GFF3 index (optional, for faster loading):**
```bash
tabix -p gff HG01081_pat_hprc_r2_v1.0.1_cat_v1.1.gff3.gz
# Creates HG01081_pat_hprc_r2_v1.0.1_cat_v1.1.gff3.gz.tbi
```

### Reference object properties

| Property | Required | Description |
|----------|----------|-------------|
| fastaURL | One of fastaURL or twoBitURL | URL to FASTA file |
| twoBitURL | One of fastaURL or twoBitURL | URL to UCSC twoBit file |
| indexURL | Recommended for FASTA | URL to `.fai` index |
| id | Optional | Identifier for the genome |
| name | Optional | Display name |
| cytobandURL | Optional | URL to cytoband ideogram file |
| chromSizesURL | Optional | For twoBit, enables whole-genome view |
| tracks | Optional | Tracks to load with the genome |

---

## UCSC Assembly Hub List

The UCSC Genome Browser maintains a list of assembly hubs at:

https://hgdownload.soe.ucsc.edu/hubs/UCSC_GI.assemblyHubList.txt

**Format:** Tab-separated with columns: accession, assembly, scientific name, common name, taxonId, GenArk, clade.

**Usage:** Any accession in this list can be used as `genome: "GCA_..."` in IGV.js. UCSC hosts the data.

**Clades:** birds, fish, fungi, invertebrate, mammals, plants, primates, vertebrate, viral, archaea, bacteria.

**Legacy:** Assemblies marked with `(L)` are outdated and superseded by newer versions.

**UCSC Browser URL:** https://genome.ucsc.edu/h/{accession}

This project includes a web tool (`tools/ucsc-assembly-browser.html`) to search and browse this list.

---

## Practical Checklist

### For custom reference + GFF3 track

- [ ] FASTA file for the reference genome
- [ ] FASTA index (`.fai`) if genome > ~10 MB: `samtools faidx reference.fa`
- [ ] GFF3 file with annotations
- [ ] GFF3 seqids match FASTA sequence IDs exactly
- [ ] Files hosted via HTTP/HTTPS
- [ ] Server allows CORS (cross-origin requests)
- [ ] Optional: GFF3 index (`.tbi`) for large annotation files: `tabix -p gff file.gff3.gz`

### For UCSC GenArk assembly

- [ ] Find accession in UCSC assembly list
- [ ] Use `genome: "GCA_..."` in IGV.js config
- [ ] No hosting required

---

## References

- IGV.js documentation: https://igv.org/doc/igvjs/
- IGV.js Reference Genome: https://igv.org/doc/igvjs/Reference-Genome/
- UCSC Assembly Hub List: https://hgdownload.soe.ucsc.edu/hubs/UCSC_GI.assemblyHubList.txt
- GFF3 specification: https://github.com/The-Sequence-Ontology/Specifications/blob/master/gff3.md
- FASTA format: https://en.wikipedia.org/wiki/FASTA_format
