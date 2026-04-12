# The Population Widget

## What it is

The Population Widget is the entry point in PGB for exploring a pangenome graph through the lens of **human population genetics**. It presents a hierarchical list of the five 1000 Genomes superpopulations — African (AFR), East Asian (EAS), American (AMR), South Asian (SAS), and European (EUR) — each expandable into its constituent populations (ACB, YRI, CHS, PEL, GBR, and so on). Selecting any superpopulation or population redraws every node in the graph as a heatmap, coloring each node by how common that node is in the chosen group.

In short: the widget lets a collaborator ask *"where in this locus does population X differ from the reference, and by how much?"* and read the answer off the graph at a glance.

## What question it answers

A pangenome graph for a given locus contains every sequence variant observed across a panel of assemblies. Some nodes are traversed by nearly every assembly (the conserved backbone); others are traversed by only a handful (rare structural variants, population-specific haplotypes, private alleles). Raw topology alone doesn't tell you *who* carries what.

The Population Widget answers that by letting you select a demographic group and immediately seeing:

- **Which nodes are ubiquitous** in that group (warm / red in the heatmap)
- **Which nodes are absent or rare** in that group (cool / blue)
- **Which nodes are intermediate** — candidates for segregating variation within the group (neutral grey near 50%)

Comparing two selections in sequence — for example, YRI versus CEU — makes population-differentiated regions visually obvious without any statistical test. It is meant as a *hypothesis-generating* tool: spot something interesting, then go confirm it with a proper frequency analysis.

## The underlying data

Every node in a PGB dataset carries a precomputed `assembly_metadata` block. For any given node this block records, for each demographic category, how many of the assemblies traversing that node fall into each bucket, along with the corresponding frequencies.

For a representative node in the chr1:25.2M–25.5M locus (232 assemblies total), the structure looks like:

```
assembly_metadata:
  count:
    sex:            { female: 116, male: 116 }
    superpopulation:{ AFR: 70, EAS: 50, AMR: 44, SAS: 36, EUR: 30, N/A: 2 }
    population:     { ACB: 12, YRI: 8, CHS: 11, PEL: 15, ... }
  frequency:
    superpopulation:{ AFR: 0.50, EAS: 0.50, AMR: 0.44, ... }
    population:     { ACB: 0.12, YRI: 0.08, ... }
```

A few things worth noting for genomics collaborators:

- **The counts at each level sum to the same node total.** Summing `count.population` across all populations yields the same number as `female + male` — in this example, 232. Each assembly is counted once per category axis.
- **Frequencies are precomputed upstream** in the data-generation pipeline, not derived in the browser. The browser treats them as ground truth.
- **The denominator is the number of assemblies traversing that specific node**, not the full panel. A node carried by only 30 assemblies will still report `AFR: 1.0` if all 30 are African — interpret accordingly.
- **`N/A` buckets** exist for assemblies whose population label is missing or ambiguous and are deliberately excluded from the tooltip and legend.

## How the widget uses the data

When you click a superpopulation or population button, the widget does two things in sequence:

1. **Switches the 3D view into the heatmap scene.** PGB keeps several pre-rendered "looks" of the same graph; the population view is one of them.
2. **Broadcasts the selection** (e.g. "YRI selected"). The heatmap look listens for this, walks every node, reads `frequency.population.YRI` from that node's `assembly_metadata`, and converts the value into a color.

The color ramp is a perceptually uniform blue → grey → red diverging scale, anchored at 0% / 50% / 100%. Interpolation happens in OKLab space so that equal numerical steps in frequency look like equal visual steps — important when you're eyeballing whether one node is meaningfully more frequent than its neighbor.

Hovering any node surfaces a tooltip showing the full population breakdown for that node — counts and percentages, sorted by frequency, with the currently selected population highlighted. This lets you drill from the global heatmap impression down to the exact numbers on a node of interest.

Clicking the same button a second time deselects it and returns the graph to its default node-emphasis coloring.

## What it is *not*

- **Not a statistical test.** Visual differences between selections are suggestive, not significant. The widget gives you somewhere to point a proper test, not a replacement for one.
- **Not corrected for sample size.** A superpopulation with 30 assemblies and one with 70 are painted on the same color scale. Keep the denominators in mind when comparing.
- **Not tied to genomic coordinates on the x-axis.** The heatmap colors nodes in the graph topology; reading it requires understanding the pangenome graph layout, not a linear genome browser track.

## Typical workflow

1. Load a locus of interest.
2. Open the Population Widget from the navigation bar.
3. Click through the five superpopulations in turn — get a first-pass sense of which regions of the graph are uniform across groups and which are not.
4. For any superpopulation that looks differentiated, expand it and click individual populations to see whether the signal is driven by one population or shared across the group.
5. Hover suspicious nodes to read the exact counts from the tooltip.
6. Note the node IDs and take them to a downstream analysis.
