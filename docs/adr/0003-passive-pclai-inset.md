---
status: accepted
date: 2026-08-20
measured: 2026-08-20
---

# The PCLAI inset is a passive position report, and nothing in it is clickable

The **PCLAI inset** is a small chart over the **sequence tube map**, plotting every
**strand** in the open document as a dot at its PCLAI coordinate. Holding the feeler over a
strand in the map recedes the inset's crowd and rings that haplotype's dot.

**Decision.** The inset takes **no pointer input**. It is not a selector: there is no
click-a-dot, no lobe filter, no lasso, no pinned set, and no zoom. All interaction stays on
the map, and the inset is driven by one push callback carrying the focused strand id. It
drags, resizes and hides, and is otherwise transparent to the pointer.

This is written down because the obvious reading of the picture is wrong in a way that costs
real work. A scatter plot of 460 addressable haplotypes *looks* like an index, and the
proposal that produced this inset
([`table-lens-concepts-for-strand-disambiguation.html`](../../notes/sequence-tube-map/table-lens-concepts-for-strand-disambiguation.html),
§03) argued exactly that: the tube map cannot magnify in the axis that matters
but a chart can, so selection should move into the chart. Without this document the first
reviewer would be right to ask why hovering a dot does nothing, and a later change would be
right to "fix" it by adding a click handler.

The answer is that the coordinate cannot carry the selection, and this was measured rather
than argued.

## Why selection cannot live here

### The coordinate does not individuate a haplotype

[`disambiguating-strands.md`](../../notes/sequence-tube-map/disambiguating-strands.md) established, from a survey of six PGB datasets, that
**99.5–99.8%** of the PCLAI coordinate's variance separates five clusters and **0.2–0.5%**
lies within them. k-means finds k=5 in all six at silhouette 0.89–0.93. A haplotype's median
nearest neighbour sits **0.064–0.088% of the cloud's diameter** away.

So the coordinate answers *which ancestry group is this haplotype from, here* with essentially
all of its signal, and *which haplotype is this* not at all. Two haplotypes 0.003 units apart
are not two things the inference distinguished; they are the same finding, twice.

### And no panel-sized plot can recover what is left

The spike's proposal accepted the first half and argued the second was a *resolution budget*
a scatter plot could buy by zooming. Measured on a 512 px chart framed tight to the data:

| document | placed strands | distinct pixels occupied | median nearest neighbour | strands ≥ 6 px from any neighbour |
|---|---|---|---|---|
| `stm-chr1-25331046-25331646` | 363 | 206 | **0.39 px** | 10 |
| `stm-chr8-78771162-78771252` | 452 | 261 | **0.39 px** | 14 |
| `5520+` | 347 | 206 | **0.39 px** | 10 |

A 512 px plot offers roughly ten pointable haplotypes and one smear holding the rest. The
figure is **identical across three documents**, so it is a property of the cohort rather than
of a locus. With a 5 px pick radius the median cursor position covers 51 haplotypes at 576 px
and 80 at 400 px.

Putting a median pair 4 px apart needs a surface near **4,000 px**. A resizable card tops out
around 900–1400 px, which moves the median to about 1.4 px — better, and still not a selector.

Underneath the pixel limit sits a second one that no amount of zoom reaches: coordinates are
published to **three decimals**, so the data's own quantum is 0.001 against a median neighbour
distance of 0.0028. The median pair is **2.8 quanta** apart.

### Therefore

Identity comes from a channel that has the bits. Strand names are discrete, exact, unique and
already in the document, and the map names the strand under the feeler. The division of
labour: **the inset says which group, the name says which strand, and neither is asked to do
the other's job.**

This is a rejection on measurement, not a deferral. Direct selection does not become available
later by making the inset bigger, and if it is ever wanted it needs a different channel, not a
larger plot.

## The other measurement this decision rests on

The ancestry colour ramp behind the dots (`public/images/pca-chart-background.png`) is a
**legend, not decoration**, and its geometry was unrecorded. Decoding it and sampling it at
all 3,122 points of `hprc-reference-pca.tsv`:

| mapping | mean RGB distance, ramp vs. the point's own colour |
|---|---|
| y increasing **downward** | **13.4** (median 9.0) |
| y increasing upward | 174.3 (median 178.9) |

Two consequences. The ramp's domain is the reference cloud's extent —
x ∈ [−1.813, 0.786], y ∈ [−1.424, 1.509] — so the inset frames to *that* rather than tight to
the document, and the ramp is exact by construction with no cropping. And **y points down**,
which means `PclaiCoordinateSpace.project`'s un-flipped projection is correct rather than the
latent bug it looks like. Both facts are stated in the projection module; this is where they
were derived.

## Rejected alternatives

- **Click or hover a dot to select a haplotype.** The whole of the section above.
- **Zoom and pan the inset**, per the spike proposal's ~10×. It is the only thing that would
  make direct selection work, it needs ~4,000 px of effective surface, and the recursion it
  brings — an overview inset inside the inset, because a magnified space is one you can be
  lost in — is a second widget to justify a first one that the precision ceiling still limits.
- **Lasso a region to build a comparison set.** Same resolution problem, plus a cardinality
  one: a floored set of 40 strands costs 360 device rows of 177 and the map ceases to exist.
- **Frame tight to the document's own points.** Maximises use of the panel, but stretches the
  ramp off its domain so a dot sits on a colour that is not its own, and makes two documents'
  charts incomparable — which defeats a *position report*, whose whole value is that "the left
  lobe" means the same thing twice.
- **Source the coordinates from `pclaiCoordinateService`.** Shared vocabulary with the 3D
  graph, but the dataset's haplotype set and the document's strand set are not guaranteed to
  match, and the keys are shaped differently (see *Accepted costs*). The inset reads the
  document, so the plotted population is exactly the population drawn in the map.
- **A list of 460 haplotype pills instead of a chart** (spike #50). Not rejected — it answers
  a different question. A list wins when you know the name you want; nothing here does what a
  list does, and nothing here forecloses one.

## Accepted costs

### 1. Unplaced strands are absent from the plot, silently

Strands carrying `pclaiX="None"` are not drawn. The count is a property of the document —
**6** in `stm-chr1-25331046-25331646`, **12** in `stm-chr8-78771162-78771252`, **99** in
`5520+` — so at some loci a fifth of the population is missing from a picture that otherwise
reads as complete. The map compensates: feeling an unplaced strand recedes the inset's crowd
and rings nothing, and the name label says which strand it was. But a researcher scanning the
cloud for `GRCh38#0#chr1` will not find it and will not be told why.

Accepted because the alternative — a gutter bin outside the axes holding the unplaced — is
chrome inside a viewing surface, and because the inset's claim is now "every *placed*
haplotype", which the ADR states rather than the picture implying.

### 2. Still no bidirectional mapping

**Flagged explicitly, as [`CLAUDE.md`](../../CLAUDE.md) requires.** ADR 0001 records that the
tube map adds a third representation of the locus with no correspondence to the annotation
track or the 3D graph, and calls it a deferred obligation. This work does not discharge it.
Feeling a strand lights nothing in PGB's other two spaces; hovering a node lights nothing here.

What it does do is build the seam: the focused-strand callback is the point a cross-panel link
would attach to, and the parse now carries strand names, which is the identifier such a link
would have to speak. The panel stays bus-silent per ADR 0001.

### 3. PGB now ships two PCLAI scatter plots, on purpose

`mountPclaiChart`'s card indexes **nodes** in the 3D graph and is driven by the event bus;
the inset indexes **strands** in one document and is driven by a callback. They share a
coordinate space and a colour ramp, and nothing else — different data, lifecycle, and panel.
They must agree on the projection, which is why the ramp's domain and the y-down convention
are written down above; they must not share a class, because the coupling would run through
`pclaiCoordinateService`, which the inset deliberately does not read.

### 4. A correction owed to ADR 0001

ADR 0001 describes tube map strands as "named `sample#haplotype#contig`, a 3-part
assembly-walk-shaped key PGB can address". That is not reliably true:
`stm-chr8-78771162-78771252.svg` spells 463 of its 464 names with **four** components
(`NA21309#2#CM092102.1#0`) and one with three. Names are therefore parsed as opaque strings
here, and the deferred bridge in cost 2 is harder than ADR 0001 records. `CONTEXT.md`'s
**strand** entry carries the corrected description.
