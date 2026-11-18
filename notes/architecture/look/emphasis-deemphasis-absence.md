# Emphasis, De-emphasis, and Absence

The definitions of the three states — and the rule for how *absent* is told
apart from *de-emphasized* — live in `CONTEXT.md` §emphasized / de-emphasized /
absent. This note covers how they're implemented.

## The Three Visual States

When a widget highlights a subset of nodes, every node falls into one of three
categories:

- **Emphasized** — the node matches the selection: a saturated color, figure
  against ground.
- **De-emphasized** — the node is not part of the selection: a muted color.
- **Absent** — the node *is* part of the selection, but the data the
  visualization draws is missing there. It must read as a difference of *kind*,
  not degree.

The PCLAI widget is currently the only widget with an absent state. A node is
absent when the selected haplotype passes through it but has no PCLAI
**placement** there. Because PCLAI emphasis colors span every hue, no
temperature is free to mark absence, so the PCLAI widget uses value instead:
absent is dark gray (`#aaaaaa`), de-emphasized is light gray (`#E8E6DC`).

## Absence Is an Interaction-Time State

All three states are interaction-time: they are recomputed on every selection.
Absence used to be a dataset-wide property (nodes with no placement for *any*
haplotype), painted whenever the PCLAI widget or chart was open. Issue #179
replaced that: absence is now asked only of nodes in the selected haplotype's
subgraph, and with no selection the graph is drawn normally.

## How It Fits Into the Look System

The look system has two levels of operation:

1. **Scene/Look swap** — changes the *kind of question* being asked (e.g.,
   assembly emphasis vs. population heatmap). Heavyweight: different scenes,
   different materials, different rendering strategies.
2. **State changes within a look** — changes to individual node appearances
   while the question stays the same. Material swaps, color changes.
   Lightweight.

Absence is a case of #2. It lives inside `NodeEmphasisLook` as a state
alongside emphasis and de-emphasis. The `emphasisStates` Map holds per-node
state strings drawn from `'normal' | 'emphasized' | 'deemphasized' | 'absent' |
'off-walk'` (`off-walk` belongs to the Assembly widget's Walk mode).

## The Event-Driven Flow (PCLAI widget)

### User clicks a dot (`pclaiWidget:emphasis`)

`PCLAIWidget.emphasizeAssembly()` builds the partition inputs:

```
subgraph   = genomicService.getAssemblyHaplotypeSubgraphNodes(ASM#HAP)
nodeSet    = nodes with a placement for ASM#HAP in the active system
absentSet  = subgraph − nodeSet
```

A placement can only exist where the haplotype passes through, so
`nodeSet ⊆ subgraph`. The payload carries `nodeSet`, `absentNodeSet`, the
per-node emphasis color map, `deemphasisColor` and `absenceColor`. The look's
`setNodeEmphasis()` performs the three-way partition:

```
emphasized   = nodeSet
absent       = absentNodeSet
deemphasized = allNodes − nodeSet − absentNodeSet
```

### User clicks a different dot

The new `pclaiWidget:emphasis` repaints every node, so no reset is published
in between.

### User unclicks the dot, or the widget is reset (`pclaiWidget:normal`)

The widget publishes `pclaiWidget:normal` with *every* node, then
`pclaiWidget:deselect`. Every node is restored, not just the emphasized set:
the de-emphasized remainder is painted implicitly by `setNodeEmphasis()`, not
from an enumerated node list.

## Per-Widget Colors

Each widget defines its own palette as static properties
(`NODE_DEEMPHASIS_COLOR`, `NODE_ABSENCE_COLOR`, …) and passes the colors
through its event payload. The assembly widget uses a warm dusty rose for
de-emphasis; the PCLAI widget uses the two grays above. The look falls back to
`Look.NODE_DEEMPHASIS_COLOR` when no override is provided.

This keeps the look generic: it doesn't need to know which widget is driving
it. The widget owns its palette and communicates it through the event.

## Adding Absence to a New Widget

If a future widget needs absent nodes:

1. Define, for your selection, which nodes the selection covers and which of
   those lack the data you draw. Absent = covered but lacking.
2. Include `absentNodeSet` and `absenceColor` in your emphasis event payload.
3. Choose an absence color that reads as a difference of *kind* against your
   emphasis and de-emphasis colors, and record the rule in `CONTEXT.md`.
4. Subscribe to the event in `NodeEmphasisLook.activate()` (or in a new look if
   the visualization warrants one).
5. Publish `yourWidget:normal` with every node when the selection is cleared.

The look-side infrastructure (the partition in `setNodeEmphasis`, the
`'absent'` case in `applyEmphasisState`) is already in place.
