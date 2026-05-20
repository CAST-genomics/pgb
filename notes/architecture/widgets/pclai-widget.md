# The PCLAI Widget

## What it is

The PCLAI Widget is PGB's entry point for exploring a pangenome locus through the lens of **ancestry coordinates**. It is specific to HPRC-format datasets, which carry a per-node, per-haplotype annotation called **PCLAI** (Principal Component Local Ancestry Inference). Each PCLAI record places one assembly-haplotype's contribution to one node in a 2D ancestry-component space, along with a representative RGB color.

The widget presents a scrollable, searchable list of every assembly-haplotype that has at least one PCLAI coordinate in the current locus. Clicking an entry simultaneously:

1. **Lights up the nodes** in the 3D graph for which that haplotype has a PCLAI call, and
2. **Lights up the corresponding dots** in the companion 2D PCLAI chart.

Both the graph view and the chart view are driven off the same selection, so the collaborator can read the haplotype's footprint in graph space and in ancestry space at the same glance.

## What question it answers

The Population Widget tells you how common a node is across demographic buckets. The Assembly Widget tells you which nodes a haplotype physically walks through. The PCLAI Widget sits between the two and answers a subtler question:

> *For a given haplotype, which pieces of this locus have ancestry calls, and where do those calls sit in PCLAI space?*

This is useful because a single haplotype can carry ancestry signal that varies along the locus — one stretch may cluster with African references, another with European. PCLAI captures that as a coordinate per node, and the PCLAI Widget makes the local-ancestry story directly visible: you pick a haplotype and immediately see which of its traversed nodes have ancestry information at all, and where each of those nodes lands in the 2D ancestry plane.

## The underlying data

Only HPRC datasets carry the `pclai_coordinates` block. For a single node, the relevant fragment looks like:

```
node 5504+:
  assembly:
    - assembly_name: HG00597
      haplotype: "1"
      metadata:
        - pclai:
            - coordinates: [0.695, 0.907]
              RGB:         [255, 114, 53]
              start:       25491473
              end:          25527367
              percentage:  1.0
```

A few things worth noting for genomics collaborators:

- **Not every haplotype-on-a-node has a PCLAI call.** A haplotype can walk through a node and still have an empty `pclai: []` array. The PCLAI Widget shows only haplotypes with *at least one* call; the Assembly Widget shows everyone.
- **A node can carry multiple PCLAI calls for the same haplotype** — different stretches of the haplotype's mapping to that node can land at different PCLAI coordinates with different percentages.
- **The `[x, y]` coordinates are ancestry components**, not genome coordinates. They live in the same 2D space as the HPRC reference PCLAI panel that backs the chart.
- **The `RGB` color is assigned by the upstream PCLAI pipeline**, reflecting the ancestry region the coordinate falls into. PGB reuses that color directly rather than deriving one.

The `pclaiCoordinateService` walks every node at dataset load time and builds:

- A list of every `assembly#haplotype` coordinate key → populates the widget's scrollable list.
- A map from coordinate key → the set of node IDs for which that haplotype has a PCLAI record → drives graph emphasis.
- A color map per coordinate key → drives the highlight color.
- The set of "absent" nodes — nodes with *no* PCLAI data at all, from any haplotype — used to paint a distinct visual state.

## What clicking a haplotype does

When you click a row in the PCLAI Widget, three coordinated things happen:

**1. The 3D graph redraws.** The widget fires a `pclaiWidget:emphasis` event carrying the coordinate key, the set of nodes that carry a PCLAI call for that haplotype, and the "absent" node set. The node-emphasis look walks the graph and paints:

- **Emphasized** — nodes on the selected haplotype's PCLAI footprint, colored from the PCLAI color map.
- **Absent** — nodes with no PCLAI data anywhere, painted in a distinct state so you can tell *"no call for this haplotype"* apart from *"no call exists at all."*
- **Deemphasized** — everything else, pushed to a muted grey (`#aaaaaa`).

**2. The PCLAI Chart redraws.** The `PCLAIChartService` also subscribes to `pclaiWidget:emphasis`. When it receives the event, it:

- Records the selected coordinate key.
- **Dims the reference PCLAI dots** — the background population drawn from `hprc-reference-pca.tsv`, which plots the HPRC reference panel in ancestry space — by converting them to grayscale and dropping their opacity. This pushes the reference panel into the background while keeping it as a spatial guide.
- **Renders the dataset dots** for the selected haplotype. If the user is currently hovering a node in the graph, the chart shows *that node's* PCLAI coordinates filtered to the selected haplotype. If no node is hovered, the chart shows all of the selected haplotype's PCLAI coordinates across every node in the locus — one dot per `(node, pclai record)` pair, using the RGB color stored in the data.

Clicking the same row a second time deselects: the graph returns to its absence-only state, the chart clears its dataset dots, and the reference panel is restored to full color and opacity.

**3. The chart stays coupled to node hover.** Independently of the widget selection, hovering a node in the 3D graph publishes a `lineIntersection` event; the PCLAI Chart listens for this and plots *that node's* PCLAI coordinates. When a coordinate key is selected in the widget, the chart filters the hovered node's dots down to that haplotype. This is the mechanism that gives the widget its dual-view feel: the graph view and the chart view update together whenever either your selection or your hover changes.

## Relationship to the other widgets

- **vs. Assembly Widget.** Both list `assembly#haplotype` entries and both emphasize nodes on click, but they are reading different things. The Assembly Widget's list is every haplotype that traverses the locus (from `node.assembly[]`), and its emphasis is the full topological walk. The PCLAI Widget's list is only haplotypes with PCLAI calls (from `pclai_coordinates`), and its emphasis is the subset of nodes with a call — always a subset of the assembly walk, often a much smaller one. A haplotype can appear in the Assembly Widget but be absent from the PCLAI Widget.

- **vs. Population Widget.** The Population Widget summarizes the panel across demographic buckets; the PCLAI Widget drills into one individual haplotype's ancestry signal along the locus. They answer complementary questions: *"how does frequency vary across populations?"* versus *"how does ancestry vary along one haplotype?"*

- **Dataset applicability.** The PCLAI Widget is only useful on HPRC-format datasets. On a standard PGB dataset, `pclai_coordinates` is absent, the widget's launch button is disabled, and neither the widget nor the PCLAI Chart can be opened.

## What it is *not*

- **Not a whole-genome PCLAI.** The coordinates are *local* ancestry calls confined to the loaded locus. Cluster positions reflect the ancestry of a specific stretch of sequence, not the individual as a whole.
- **Not a substitute for running PCLAI.** The widget consumes precomputed calls; it does not compute them. The quality of the visualization is bounded by the quality of the upstream PCLAI pipeline.
- **Not a differential view.** It shows one haplotype at a time. Comparing two haplotypes requires clicking between them.

## Typical workflow

1. Load an HPRC locus.
2. Open the PCLAI Widget and the PCLAI Chart from the navigation bar. The reference panel appears as a muted backdrop on the chart.
3. Pick a haplotype of interest from the list. The graph lights up its PCLAI footprint; the chart plots that haplotype's coordinates over the dimmed reference panel.
4. Hover individual nodes in the graph to drill from the haplotype-wide scatter down to the specific node's PCLAI call.
5. Look for spread in the chart. A haplotype whose dots cluster tightly in one region of ancestry space is locally homogeneous; a haplotype whose dots span multiple reference clusters is carrying locally mixed ancestry along this stretch.
6. Click the same row again to clear the selection and return the chart's reference panel to full color.
