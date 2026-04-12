# The Assembly Widget

## What it is

The Assembly Widget is PGB's tool for exploring the pangenome graph **one haploid genome at a time**. Every pangenome dataset is built from a panel of assemblies — for HPRC-style data these are individual human samples, each represented by one or two haplotypes (hap1, hap2). The widget presents a scrollable, searchable list of every `assembly#haplotype` that walks through the currently loaded locus, and lets you pick one to see exactly where it goes in the graph.

Unlike the Population Widget, which summarizes the panel statistically, the Assembly Widget is purely individual: one click, one haplotype, one path.

## What question it answers

A pangenome graph collapses many linear genomes into a single braided structure. A natural first question any collaborator asks is: *"If I just wanted to follow HG00597's maternal haplotype through this locus, which nodes would I visit, and in what order?"* The Assembly Widget answers exactly that. You pick a haplotype from the list and the graph redraws to emphasize the nodes that belong to its traversal, with every other node pushed to a muted grey. The shape of the highlighted subgraph tells you:

- **Where this haplotype agrees with the backbone** (it rides the conserved spine)
- **Where it diverges onto a variant branch** (a private structural variant, an inversion, an insertion)
- **How much of the locus it actually covers** (some haplotypes traverse only part of the window)

Clicking a second haplotype lets you replace the first one; the widget is deliberately single-selection so the eye isn't asked to disentangle two overlapping paths at once.

## Two emphasis modes

The widget exposes a toggle with two biologically distinct definitions of *"the nodes belonging to this haplotype"*:

1. **Assembly Subgraph** (default) — every node the haplotype's walk passes through, including branches, bubbles, and detours. This is the complete topological footprint of the haplotype within the locus. Useful when you want to see the full scope of what the haplotype touches.

2. **Assembly Walk** (spine features) — a curated subset: the linearized *spine* of the haplotype, i.e. the backbone path with its ordered features. Useful when you want to read the haplotype as a linear sequence of functional blocks rather than a graph traversal — closer to the mental model of a conventional genome browser.

The toggle re-emphasizes the currently selected haplotype in place, so you can flip between "give me the whole footprint" and "give me the spine" without losing your selection.

## The underlying data

The widget's list is drawn from every node's `assembly[]` array in the dataset — the set of all assembly-haplotype keys that appear anywhere in the loaded locus. For a single node, the relevant fragment looks like:

```
node 5504+:
  assembly:
    - assembly_name: HG00597
      haplotype: "1"
      metadata:
        - sequence_id: CM085766.1
          path_strand: "+"
          node_strand: ">"
          start: 25491473
          end:   25527367
```

The `start`/`end` pair records where this node maps onto the haplotype's own linear coordinate system, and `path_strand` / `node_strand` record its orientation through the node. PGB uses these to reconstruct, per haplotype, the ordered walk through the locus — the **assembly walk map** — from which both emphasis modes are derived:

- The *subgraph* mode reads the pre-computed set of nodes from `assemblyWalkMap.get(key).assemblySubgraph.nodes`.
- The *spine features* mode reads the curated spine from `assemblyWalkMap.get(key).spineFeatures.spine.nodes`.

Both are built once at dataset load time, so selection is instantaneous.

## What the widget is *not*

- **Not statistical.** It shows a single haplotype at a time. Frequencies and population breakdowns live in the Population Widget.
- **Not an alignment viewer.** It tells you which graph nodes a haplotype traverses, not the base-level alignment within those nodes.
- **Not orientation-aware in its highlighting.** A node carried in forward orientation by one haplotype and reverse by another is still just "the same node" to the widget.
- **Not filtered by data quality.** Every haplotype present in the panel appears in the list regardless of assembly quality or coverage at this locus.

## Typical workflow

1. Load a locus.
2. Open the Assembly Widget from the navigation bar.
3. Use the search box to narrow the list (for example, filter to all `HG01*` samples or a particular reference).
4. Click a haplotype and read its path through the graph — does it ride the spine, or does it branch off into a variant bubble?
5. Toggle between Assembly Subgraph and Assembly Walk to compare the full footprint against the linearized spine.
6. Click the same haplotype a second time to deselect and return the graph to its default emphasis.

## Relationship to the other widgets

The Assembly Widget is the baseline *"who goes where?"* view. The Population Widget aggregates across that same set of haplotypes to answer *"how common is each node?"*, and the PCA Widget (on HPRC datasets) narrows the same list down to the haplotypes that carry PCLAI ancestry coordinates and couples the graph view to a 2D ancestry scatter plot. All three widgets share the same row format — `assembly#haplotype` — but each asks a different question about the panel.
