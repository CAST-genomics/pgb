# PGB — Context

The vocabulary of this project. When naming a concept in an issue title, a
commit message, a refactor proposal, a hypothesis, or a test name, use the
term as defined here rather than a synonym. Where a term has a deliberate
alias, both are recorded.

Two halves. **Domain vocabulary** is genomics — written for someone fluent
in software but new to the biology, and for me on a future conversation
when I have forgotten. **System vocabulary** is PGB's own architecture: the
words that only mean something inside this codebase.

Rules and conventions live in [`CLAUDE.md`](CLAUDE.md); decisions live in
`docs/adr/`. This file defines terms only — it does not tell you what to do.

---

## Domain vocabulary

Terms appearing across the [Assembly](notes/data-format/stories/assembly.md),
[Population](notes/data-format/stories/population.md), and
[PCLAI](notes/data-format/stories/pclai.md) stories.

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
`HG00408#1`. The [Assembly widget](notes/data-format/stories/assembly.md) and
[PCLAI widget](notes/data-format/stories/pclai.md) both list assembly-haplotypes as their rows.

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
the [Population widget](notes/data-format/stories/population.md) heatmap, core-graph nodes paint
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

### lobe

One of the five clusters the PCLAI coordinates fall into. k-means finds
k=5 in all six surveyed datasets at silhouette 0.89–0.93, and **99.5–99.8%**
of the coordinate's variance lies *between* lobes against 0.2–0.5% within
them. So the lobe is the thing a PCLAI coordinate individuates: it answers
*which ancestry group*, and cannot answer *which haplotype* — the
information is not in the coordinate. See
[ADR 0003](docs/adr/0003-passive-pclai-inset.md).

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

Also called a **minigraph node** — the deliberate alias, used where the
**sequence tube map** is involved and the word has to be told apart from a
**segment**, the vertices *inside* one node, which that map's SVG calls
"node" too. A node is the container; segments are its contents.

Two ids name it, and they are not interchangeable: PGB keys nodes by the
**oriented** id (`"5519+"`, orientation included), while the tube map
API's `minigraphnode` parameter takes the **bare** id (`5519`). The seam
is where orientation is stripped between the two.

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
where the coordinate changes abruptly. See [`pclai.md`](notes/data-format/stories/pclai.md) for
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
every selection in the [Population widget](notes/data-format/stories/population.md).

### recombination

The biological process by which a child's chromosome is constructed by
splicing together segments from each parent's two homologous
chromosomes. Each splice is a **breakpoint**. Recombination is the
reason ancestry varies along a single chromosome.

### reference panel

A labeled dataset of known-ancestry haplotypes used to *define* a
coordinate space (for PCA fitting) and to *visually anchor* the
[PCLAI chart](notes/data-format/stories/pclai.md) (drawn as colored regions for AFR / EUR / EAS /
AMR / WAS). In PGB the reference panel comes from
`hprc-reference-pca.tsv`.

### spine

The single canonical walk of one assembly through the pangenome graph —
the actual sequence of nodes that assembly traverses end-to-end. A
subset of the assembly's full **subgraph**. In Walk mode the
[Assembly widget](notes/data-format/stories/assembly.md) emphasizes the spine and greys out the
rest of the subgraph.

### subgraph (per-assembly)

The set of all graph nodes one assembly touches *anywhere* — broader
than its spine, since an assembly can visit a node without that node
being on its main walk. Default emphasis target for the
[Assembly widget](notes/data-format/stories/assembly.md).

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

## System vocabulary

Terms that mean something specific inside PGB. Architecture rationale lives
in [`notes/architecture/`](notes/architecture/); the binding rules are in
[`CLAUDE.md`](CLAUDE.md).

### Look

The complete visual appearance of the graph in one scene — materials, color
schemes, emphasis states, tooltips, and per-frame animation. The central
abstraction of the app, modeled on RenderMan-era shade trees: a Look is a
"shader" in the conceptual sense, allowed to grow rich so the rest of the
pipeline stays simple. Base class in `src/looks/look.ts`.

### NodeEmphasisLook / HeatmapLook

The two concrete Looks. `NodeEmphasisLook` owns the emphasized /
de-emphasized / absent partitioning driven by the Assembly and PCLAI
widgets. `HeatmapLook` owns continuous frequency coloring for the
Population widget.

### one Look per Scene

The design rule that each Three.js `Scene` is paired with exactly one Look.
Switching visualization mode means switching the active scene, which
activates the paired Look and deactivates every other. Meshes are
pre-created for all scenes at data-load time, so the swap is instant.

### LookManager / SceneManager

`LookManager` is the registry mapping scene names to Look instances; it
hands the scene in via `Look.activate(scene)`. `SceneManager` owns scene
lifecycle and delegates to it.

### scene swap

The heavyweight operation — changing the *kind of question* being asked
(assembly emphasis vs. population heatmap). Distinct from **state changes
within a Look**, the lightweight operation that alters individual node
appearance while the question stays the same.

### emphasized / de-emphasized / absent

The three visual states a node can occupy under a selection. *Emphasized*
matches the selection (saturated, figure against ground). *De-emphasized*
lives in the same data space but doesn't match (muted, same chromatic
family — it could match under a different selection). *Absent* lacks the
relevant data category entirely and gets a categorically different cool
color. The warm/cool split is load-bearing: a viewer reads the temperature
shift as a difference of *kind*, not degree.

Emphasis and de-emphasis are interaction-time states. Absence is a
data-space property — fixed for the life of the dataset — that is only
*visualized* while the relevant widget is active.

### widget

An event producer. Widgets translate user interaction into events that
drive a Look; they own no visual semantics of their own. Widgets are free
to invent their own events and payload shapes, and Look reuse across
widgets is opportunistic rather than symmetric. The three are Assembly,
Population, and PCLAI.

### Walk mode / Subgraph mode

The Assembly widget's two emphasis targets. *Subgraph* (the default)
emphasizes every node the assembly touches anywhere; *Walk* emphasizes only
its **spine** and greys out the remainder of the subgraph.

### RibbonNode

The mesh type used to draw nodes — a `THREE.Mesh` subclass carrying a
custom triangle-strip geometry and GLSL shaders, which replaced the
Three.js `Line2` / `LineMaterial` pipeline. Owns its own geometry build,
coarse-to-fine spline-proximity raycast, and per-frame `halfWidth` uniform
service. Single source of truth for `NODE_Z_OFFSET`. In `src/ribbonNode.ts`.

In the ribbon shaders, **u** runs along the node's arc length (the long
axis) and **v** runs across the ribbon's width (the short axis).

### annotation track

The 2D canvas strip below the 3D graph, showing gene annotations for the
selected assembly — or node-boundary tick marks when no annotations are
available. Split into a pure coordinate kernel
(`AnnotationCoordinateIndex`), a view (`AnnotationCanvas`), and event
wiring (`AnnotationTrackController`) behind the `mountAnnotationTrack`
facade.

### bidirectional mapping

The 1:1 correspondence between a position on the **annotation track** (1D
genomic space) and a node in the 3D graph — hovering either one produces
feedback in the other. A design constraint rather than a feature; see
[`CLAUDE.md`](CLAUDE.md).

### dataset

One JSON file describing the pangenome graph for a single **locus**: the
alternative paths through a stretch of genome, which assemblies take which
path, and where each piece sits in 3D layout space. Population counts,
PCLAI coordinates, and sequence hang off that backbone. Illustrated in
[`notes/data-format/dataset-anatomy.md`](notes/data-format/dataset-anatomy.md).

### event bus

The typed pub/sub in `src/utils/eventBus.ts` connecting widgets to Looks.
A Look's subscribed events are its parameter-binding interface — the
analogue of the uniforms a shader declares.

### band

The atomic drawable of a **sequence tube map**: one **strand** crossing one
x-interval — a single `<path>` or `<rect>` in the server's `g.track`. A strand
is made of many bands, so a band count is a count of shapes, not of haplotypes.
*Avoid "ribbon" for a band* — a ribbon reads as the whole strand.

### segment

One of the sequence boxes *inside* a **sequence tube map** — a vertex of the
minigraph-cactus subgraph it collapses, carrying an id, a length and a sequence
(typically tiny: median 1 bp, most being single-base variants). Called *node* by
the SVG and by upstream sequence-tube-map. The alias is renamed on our side to
keep the two scales distinct: **node** is the graph vertex PGB draws in 3D,
**segment** is what is found inside one.

### sequence tube map

A base-level picture of what is *inside* one **node** — the minigraph-cactus
subgraph it collapses: **segments** of sequence, with every haplotype's
**strand** threaded through them left→right. Where the 3D graph draws a node as
one collapsed summary, this is the magnifying glass on it, and the SNVs, indels,
duplications and inversions are what it shows. Laid out server-side by the UCSD
API, which returns an SVG whose drawing primitives PGB parses and rasterizes
itself.

### strand

One haplotype's path through a **sequence tube map**, drawn as a coloured ribbon
running left→right, and coloured by the same shipped PCLAI RGB the 3D graph and
the PCLAI chart use.

A strand's **name** is `#`-separated and starts `sample#haplotype`, but the
number of components is **not fixed** and the name is parsed as an opaque
string. `stm-chr1-25331046-25331646.svg` spells all 369 of its names with three
(`NA21309#2#CM092097.1`); `stm-chr8-78771162-78771252.svg` spells 463 of its 464
with four (`NA21309#2#CM092102.1#0`) and one with three. Anything wanting to
address a strand from PGB's side — which speaks
**assembly-haplotype** — has to bridge that, and the bridge is harder than
[ADR 0001](docs/adr/0001-sequence-tube-map-panel.md) records; see
[ADR 0003](docs/adr/0003-passive-pclai-inset.md) §4.

The deliberate alias, recorded because the collision is the reason for the
rename: upstream sequence-tube-map and the SVG itself call this a *track*
(`g.track`, `trackID`, `class="track<N>"`), which is unrelated to PGB's
**annotation track**. *Strand* is the term to use; *track* survives only in code
quoting the server's document.

### feeler

The held-`Shift` mode over a **sequence tube map**: while the key is down, one
**strand** under the cursor is drawn in the document's own colour and at no
less than the **thickness floor**, every other strand recedes to a ghost of
itself, and a label following the cursor names the whole **pick set**. A mode
that is *held* rather than toggled, and one that does not accumulate — moving
on hands the emphasis to the next strand, and the floor goes with it. Entered
only while the pointer is over the surface, since `Shift` is a key the rest of
PGB and the OS also use. Plain hover does none of it.

**The label names the set; the emphasis and the floor stay on exactly one.**
Flooring six strands at 2 css px each is a blob that follows nothing, which is
the opposite of what the floor is for — so one strand carries them and the label
shows the others, so nothing found is hidden. Which one: see **thickness
floor**. The label marks that strand's row at full strength and recedes the
rest, matching the map, so a name at full strength always refers to the strand
currently emphasized.

### pick set

Every **strand** inside the cursor's one css pixel, in the vertical order they
appear on screen. About six at fit on `5520+`, where a **band** is 0.19 css px
tall; **exactly one** at any zoom where every band exceeds a pixel, which is
what makes reporting the set need no mode and no threshold.

The pick pass frames that same one css pixel and photographs it into a `1 × 32`
column rather than a single texel, so it answers with the set instead of with
whichever band was drawn last. The window is a css pixel at every sample count;
only the resolution inside it moves, and `uPad` is quoted against the sample
cell so that a strand outside the cursor's pixel is never reported. 32 is a
measurement, not a guess:
[`measurements/2026-08-21-how-finely-to-sample-a-pick.md`](notes/sequence-tube-map/measurements/2026-08-21-how-finely-to-sample-a-pick.md).

**All three panels report the same set**, in the idiom each of them already
has. The map lights one **strand**; the label lists the set, one name per row,
each with a filled swatch in that strand's own colour and a ring on the lit
one; the **PCLAI inset** marks every **placed** member of the set at one size
and rings the same lit one. Nowhere may two of them state different counts of
what is under the cursor — that is the whole of #120, and the reason the inset
was changed with the label rather than after it.

The cloud's third tier is **greyed as well as faded**, and this is the one
place desaturation is allowed: a dot sits on the ramp's own rendering of its
coordinate, so fading a colour over the colour it matches subtracts almost
nothing, and an unplaced haplotype is never drawn in that plot at all — so
grey collides with nothing there, where in the map it means `pclaiX="None"`.

The **label's colour is on the swatch and never on the text.** Every one of the
464 strand colours on `5520+` is a pastel: against the label's white card the
best reaches 2.74:1 and the median is 1.88:1, so none clears even the 3:1 that
large text asks for. Legibility is the hard constraint; the swatch is where the
colour goes. Both judgements, and the spread measurement that says marking the
set is worth anything at all:
[`measurements/2026-08-21-the-pick-set-in-the-cloud.md`](notes/sequence-tube-map/measurements/2026-08-21-the-pick-set-in-the-cloud.md).

### thickness floor

The minimum screen-space thickness the **feeler** draws its **strand** at — 2
css px, grown symmetrically about the band's own centreline, so the strand's
*position* stays exactly truthful while its extent does not. Carried as a
per-strand byte in the appearance table beside the emphasis byte, so a set of
strands could be floored later without another upload path.

It exists because at fit a band is 0.19 css px tall and 2.6 strands share every
device pixel row: receding the crowd does not change how much of a row the
focused band owns. **Self-annulling** — above the floor the clamp does nothing
and the map is byte-identical to what it was, and below it is exactly the
regime where the overdrawn neighbours were never resolvable anyway. Not applied
to picking, which answers off the document's own geometry.

Carried by exactly one strand at a time, out of the **pick set**: the one
holding the sample nearest the cursor's own y. Not quite *nearest centreline* —
a centreline is not something the pick pass has, and recovering one would mean
per-band geometry on the CPU, which is what the pass exists to avoid. The two
differ only inside a thirty-second of a css pixel, and both strands are named
either way.

### placement

A **strand**'s PCLAI coordinate within one **sequence tube map** document,
carried on every **band** as `pclaiX` / `pclaiY`, or **absent** — spelled
`pclaiX="None"`, which the renderer already draws grey.

How many strands are unplaced is a property of the document and never a
constant: 6 in `stm-chr1-25331046-25331646`, 12 in
`stm-chr8-78771162-78771252`, 99 in `5520+`. A strand has one placement per
document because each document covers one **node** — that is a property of
the window, not of the haplotype, since PCLAI is per (haplotype, node).

### PCLAI inset

The passive chart over a **sequence tube map**, plotting one dot per placed
**strand** in the open document over the ancestry colour ramp. Holding the
feeler over a strand recedes the crowd and rings that haplotype's dot.

Distinct from the [PCLAI chart](notes/data-format/stories/pclai.md), the
**widget** card that indexes **node**s in the 3D graph: the two share a
coordinate space and a ramp and nothing else. The inset takes no pointer input
at all — why, and what that costs, is
[ADR 0003](docs/adr/0003-passive-pclai-inset.md).

### tube map panel

The floating, draggable, resizable card that hosts a **sequence tube map**,
opened from a node's context menu. Not a **Look**: it owns its own WebGL scene,
camera and render loop, and its entire input surface is `open(url: string)`.
Why the Look rule does not reach it, and what that costs — including the panel
adding a third representation of the locus with no **bidirectional mapping** to
the other two — is
[`docs/adr/0001-sequence-tube-map-panel.md`](docs/adr/0001-sequence-tube-map-panel.md).

---

## Reading suggestions

- New to pangenomes? Start with **pangenome graph**, **node**, **edge**,
  **walk**.
- New to ancestry? Start with **local ancestry inference**, **admixture**,
  **superpopulation** / **population**.
- New to PCLAI? Read **PCA**, **point cloud**, **breakpoint** in that
  order, then the [PCLAI story](notes/data-format/stories/pclai.md).
- New to the codebase? Read **Look**, **one Look per Scene**, **widget**,
  and **emphasized / de-emphasized / absent**, then
  [`notes/architecture/look/`](notes/architecture/look/).
