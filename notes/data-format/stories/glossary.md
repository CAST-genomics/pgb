# Glossary

Domain terms that appear across the [Assembly](./assembly.md),
[Population](./population.md), and [PCLAI](./pclai.md) stories. Definitions
are written for someone fluent in software but new to genomics — and for
me, on a future conversation, when I have forgotten.

---

### admixture

The mixture of ancestries within a single individual's genome, produced by
matings between members of historically separate populations. An admixed
genome is a mosaic of segments that trace back to different ancestral
sources. PCLAI quantifies admixture as the spread of a haplotype's
**point cloud** in PCA space.

### allele

A specific variant at a given location in the genome. In the pangenome
graph, alternative alleles are represented as alternative paths between
the same two anchor nodes.

### assembly

A consensus DNA sequence reconstructed for one individual's genome (or
one of their haplotypes). In PGB datasets, each assembly is identified by
its sample id (e.g. `HG00408`).

### assembly-haplotype (a.k.a. coordinate key)

An assembly paired with one of its two haplotypes — for diploid humans,
each individual contributes two. Written as `ASM#HAP`, e.g.
`HG00408#1`. The [Assembly widget](./assembly.md) and
[PCLAI widget](./pclai.md) both list assembly-haplotypes as their rows.

### breakpoint

A point along the genome where two adjacent segments trace to different
ancestries — i.e. a **recombination** event in the haplotype's history.
In PGB, the boundaries between graph nodes are the candidate breakpoints
PCLAI's continuous model regresses between.

### contig

A contiguous run of assembled sequence within an assembly. Identified in
PGB datasets by `sequence_id` (e.g. `CM085957.1`).

### core graph

The set of pangenome-graph nodes shared by essentially all assemblies —
the boring, invariant backbone. The opposite of a **rare allele**. In
the [Population widget](./population.md) heatmap, core-graph nodes paint
uniformly bright under every selection.

### edge

A directed link between two nodes in the pangenome graph, representing
"this segment can immediately follow that segment in some assembly."
Stored flat in `dataset.edge[]`.

### F₂

A statistic from population genetics measuring accumulated genetic drift
(or branch length) between two populations. Equal to the expected squared
distance between their allele-frequency vectors. PCLAI's PCA space is
constructed so that Euclidean distance approximates F₂, which is what
makes the visual proximity of two dots in the chart biologically
meaningful.

### GRCh38

The current standard linear human reference genome (Genome Reference
Consortium Human Build 38). PGB datasets often anchor coordinates to
GRCh38; PCLAI placements are recorded against it in `pclai_hg38`.

### haplotype

The DNA inherited from one parent. Diploid humans have two haplotypes
per chromosome. PGB datasets carry per-haplotype data because that's the
unit at which ancestry varies — your two copies of a chromosome may have
very different histories.

### local ancestry inference (LAI)

The task of labeling each genomic window of a haplotype with the
ancestry it traces back to. Classical LAI produces discrete labels (a
finite set like AFR/EUR/EAS); PCLAI replaces these with **continuous
coordinates** in a learned embedding space.

### locus

A specific region of the genome. Each PGB dataset is one locus,
identified by a `queried_locus` (what was asked for) and an
`actual_locus` (what the graph spans — usually wider, extending to
clean boundary nodes).

### node

A vertex in the pangenome graph — one haplotypic segment of DNA. Stored
as a map keyed by oriented node id (e.g. `"141452+"`, where `+`/`−` is
the strand orientation). Each node has a length, a sequence, a list of
assemblies that walk through it, and (for HPRC data) PCLAI placements.

### pangenome graph

A graph data structure representing the genetic variation of many
individuals in one region of the genome. Shared sequence appears as
shared nodes; variation appears as alternative paths. Replaces the
single-reference paradigm (e.g. "the human genome") with a many-genome
paradigm.

### PCA (principal component analysis)

A linear projection of high-dimensional data onto its directions of
maximum variance. Applied to genetic data, PCA's top components
typically recapitulate broad geographic ancestry structure. PCLAI's
default coordinate space is the PCA space of a labeled reference panel.

### PCLAI (Point Cloud Local Ancestry Inference)

A continuous, coordinate-based approach to local ancestry inference.
Each haplotype is represented as a **point cloud** of per-window
coordinates in a genetic embedding space (PCA by default; UMAP also
supported). Recombination breakpoints emerge as discrete junctions
where the coordinate changes abruptly. See [`pclai.md`](./pclai.md) for
how PGB visualizes this.

> Geleta, Bu, Turner, et al. *Point cloud local ancestry inference
> (PCLAI): continuous coordinate-based ancestry along the genome.*
> Nature Genetics, 2026.

### point cloud

A set of points in some coordinate space. In PCLAI, an individual
haplotype's point cloud is its set of per-window PCA coordinates — one
point per genomic window. The *shape* of this cloud is the admixture
signal: tight cluster = single ancestry; spread / multi-modal = admixed.

### population

A relatively fine-grained ancestry category (e.g. `ACB`, `CHS`,
`YRI`) — typically a single sampled cohort. HPRC datasets carry 28
populations. Rolls up into a **superpopulation**.

### rare allele

A pangenome-graph node walked by only a handful of assemblies — the
opposite of the **core graph**. Visible as a uniformly dark node under
every selection in the [Population widget](./population.md).

### recombination

The biological process by which a child's chromosome is constructed by
splicing together segments from each parent's two homologous
chromosomes. Each splice is a **breakpoint**. Recombination is the
reason ancestry varies along a single chromosome.

### reference panel

A labeled dataset of known-ancestry haplotypes used to *define* a
coordinate space (for PCA fitting) and to *visually anchor* the
[PCLAI chart](./pclai.md) (drawn as colored regions for AFR / EUR / EAS /
AMR / WAS). In PGB the reference panel comes from
`hprc-reference-pca.tsv`.

### spine

The single canonical walk of one assembly through the pangenome graph —
the actual sequence of nodes that assembly traverses end-to-end. A
subset of the assembly's full **subgraph**. In Walk mode the
[Assembly widget](./assembly.md) emphasizes the spine and greys out the
rest of the subgraph.

### subgraph (per-assembly)

The set of all graph nodes one assembly touches *anywhere* — broader
than its spine, since an assembly can visit a node without that node
being on its main walk. Default emphasis target for the
[Assembly widget](./assembly.md).

### superpopulation

A coarse-grained ancestry category (e.g. `AFR`, `AMR`, `EAS`, `EUR`,
`SAS`) — typically continental-scale. HPRC datasets carry 6
superpopulations, each containing several **populations**.

### UMAP

A non-linear dimensionality reduction technique that preserves local
neighborhood structure better than PCA at the cost of distorting global
distances. PCLAI supports UMAP as an alternative coordinate space; PGB
datasets currently ship PCA placements.

### walk

The path one assembly takes through the pangenome graph — an ordered
sequence of nodes. See **spine**.

---

## Reading suggestions

- New to pangenomes? Start with **pangenome graph**, **node**, **edge**,
  **walk**.
- New to ancestry? Start with **local ancestry inference**, **admixture**,
  **superpopulation** / **population**.
- New to PCLAI? Read **PCA**, **point cloud**, **breakpoint** in that
  order, then the [PCLAI story](./pclai.md).
