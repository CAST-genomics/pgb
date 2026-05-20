# Emphasis, De-emphasis, and Absence

## The Three Visual States

When a user interacts with a widget that highlights a subset of nodes, every node in the graph falls into one of three categories:

- **Emphasized** -- the node matches the user's selection. It receives a saturated, attention-grabbing color. This is the figure against ground.

- **De-emphasized** -- the node participates in the same data space as the selection but doesn't match. It receives a muted color from the same chromatic family as emphasis, signaling that it *could* match under a different selection. It's a blood relative of emphasis, drained of intensity.

- **Absent** -- the node lacks the relevant data category entirely. It is outside the data space of the current visualization. It receives a categorically different color (cool gray/blue-gray) to signal a difference of *kind*, not degree.

The key design insight is the warm/cool split. Emphasis and de-emphasis live on a warm axis (red to dusty rose). Absence lives on a cool axis (blue-gray). A viewer reads the temperature shift as a categorical boundary, not a gradation.

## Where Absence Differs from Emphasis/De-emphasis

Emphasis and de-emphasis are *interaction-time* states. They change every time the user clicks a different item in a widget. They are the look's core job.

Absence is a *data-space* property. It's determined by what the dataset contains, not by which item the user clicked. Once you know which nodes lack pclai_coordinates, that set is fixed for the life of the dataset. It's computed once at data load time by `pclaiCoordinateService` and cached as an immutable set.

However, absence is only *visualized* when the relevant widget is active. When the PCLAI widget opens, absent nodes are painted. When the PCLAI widget is dismissed, all nodes return to default. Absence is a property of the data but a visual state tied to widget lifecycle.

## How It Fits Into the Look System

The look system has two levels of operation:

1. **Scene/Look swap** -- changes the *kind of question* being asked (e.g., assembly emphasis vs. population heatmap). This is the heavyweight mechanism: different scenes, different materials, different rendering strategies.

2. **State changes within a look** -- changes to individual node appearances while the question stays the same. Material swaps, Z-offset adjustments, color changes. This is the lightweight mechanism.

Absence is a case of #2. It does not require a new look or a new scene. It lives inside the existing `NodeEmphasisLook` as a third visual state alongside emphasis and de-emphasis (with `'normal'` as the default off-state). The `emphasisStates` Map holds per-node state strings drawn from `'normal' | 'emphasized' | 'deemphasized' | 'absent'`.

## The Event-Driven Flow

### Data load
`pclaiCoordinateService.loadCoordinates()` parses the JSON, builds coordinate maps, and computes the absent node set as a byproduct. If the dataset has no pclai data at all, the absent set stays empty -- absence as a concept only exists relative to a dataset that has the relevant data.

### PCLAI widget opens (`pclaiWidget:absence`)
The absent set is published via a dedicated event. The look's `setNodeEmphasis()` method is called with an empty emphasis set and the absent set, painting absent nodes and restoring all other nodes to their default appearance. No emphasis or de-emphasis occurs yet.

### User clicks a dot (`pclaiWidget:emphasis`)
The event payload carries four things: the emphasis node set, the absent node set, the emphasis color (per-node color map from pclai data), and an optional de-emphasis color. The look's `setNodeEmphasis()` performs a three-way partition:

```
emphasisSet    = nodes matching the selected coordinate key
absentSet      = nodes with no pclai_coordinates (from payload)
deemphasisSet  = everything else (allNodes - emphasisSet - absentSet)
```

Each partition gets its own material and Z-offset treatment.

### User unclicks a dot (`pclaiWidget:absence`)
Returns to the "widget open, no selection" state. Absent nodes stay painted; everything else returns to default. This reuses the same `pclaiWidget:absence` event as widget-open.

### PCLAI widget dismissed (`pclaiWidget:normal`)
All nodes return to default color, including absent nodes. The visualization returns to its baseline.

## Per-Widget De-emphasis Color

Different widgets can specify different de-emphasis colors. The assembly widget uses a warm dusty rose; the PCLAI widget uses a neutral gray. Each widget defines its own `NODE_DEEMPHASIS_COLOR` as a static property and passes it through the event payload. The look falls back to `Look.NODE_DEEMPHASIS_COLOR` when no override is provided.

This keeps the look generic -- it doesn't need to know which widget is driving it. The widget owns its palette and communicates it through the event.

## Adding Absence to a New Widget

If a future widget needs to introduce absent nodes:

1. Identify the data-space condition that defines absence for your context
2. Compute the absent set at data load time (or when the relevant data becomes available) and cache it
3. Publish a dedicated `yourWidget:absence` event when the widget opens, carrying the absent set
4. Include `absentNodeSet` and optionally `deemphasisColor` in your emphasis event payload
5. Subscribe to the new events in `NodeEmphasisLook.activate()` (or in a new look if the visualization warrants one)
6. Publish `yourWidget:normal` when the widget is dismissed to restore all nodes to default

The look-side infrastructure (the three-way partition in `setNodeEmphasis`, the `'absent'` case in `applyEmphasisState`) is already in place and will work for any widget that follows this pattern.
