# Event Bus Contracts

Reference for all look-related events: who publishes them, what the payload looks like, and which look consumes them.

---

## Assembly Events

Consumed by: **NodeEmphasisLook**

### `assembly:emphasis`
- **Publisher**: `AssemblyWidget` — when an assembly is selected
- **Payload**: `{ assembly: { name: string }, nodeSet: Set<string>, edgeSet: Set<string> }`
- **Effect**: Emphasizes nodes/edges belonging to the assembly, deemphasizes all others. Uses `Look.NODE_EMPHASIS_COLOR`.

### `assembly:normal`
- **Publisher**: `AssemblyWidget` — when an assembly is deselected
- **Payload**: `{ nodeSet: Set<string>, edgeSet: Set<string> }`
- **Effect**: Restores all nodes/edges to normal appearance via `restoreLinesandEdgesViaZOffset()`.

---

## Population Events

Consumed by: **HeatmapLook**

### `superpopulation:selected`
- **Publisher**: `PopulationOnlyWidget` — when a superpopulation button is clicked
- **Payload**: `{ acronym: string }`
- **Effect**: Colors all nodes by superpopulation frequency using `frequencyToColorContinuous()`.

### `superpopulation:deselected`
- **Publisher**: `PopulationOnlyWidget` — when the active superpopulation is clicked again
- **Payload**: `{ superpopulation: object, acronym: string }`
- **Effect**: Currently logged only. Scene switches back to `nodeEmphasisScene` via `app.setActiveScene()` in the widget.

### `population:selected`
- **Publisher**: `PopulationOnlyWidget` — when a population button is clicked
- **Payload**: `{ acronym: string }`
- **Effect**: Colors all nodes by population frequency using `frequencyToColorContinuous()`.

### `population:deselected`
- **Publisher**: `PopulationOnlyWidget` — when the active population is clicked again
- **Payload**: `{ population: object, acronym: string }`
- **Effect**: Currently logged only. Scene switches back to `nodeEmphasisScene` via `app.setActiveScene()` in the widget.

---

## PCLAI Widget Events

Consumed by: **NodeEmphasisLook**

### `pclaiWidget:emphasis`
- **Publisher**: `PCLAIWidget` — when a coordinate key (assembly#haplotype) is selected
- **Payload**: `{ assembly: { name: string }, nodeSet: Set<string>, edgeSet: Set<string> }`
- **Effect**: Emphasizes matching nodes/edges. Node colors come from `pclaiCoordinateService.getNodeColorMapForCoordinateKey()` (returns a `Map<nodeName, THREE.Color>`).

### `pclaiWidget:normal`
- **Publisher**: `PCLAIWidget` — when the active coordinate key is deselected
- **Payload**: `{ nodeSet: Set<string>, edgeSet: Set<string> }`
- **Effect**: Restores all nodes/edges to normal appearance.

---

## Scene Switching (not event bus — direct calls)

These are **not** event bus events but direct `app.setActiveScene()` calls that trigger look activation:

| Trigger | Scene | Called From |
|---------|-------|-------------|
| Assembly button clicked | `nodeEmphasisScene` | `WidgetService.onAssemblyButtonClick()` |
| Population button clicked (no selection) | `nodeEmphasisScene` | `WidgetService.onPopulationButtonClick()` |
| Population button clicked (has selection) | `heatmapScene` | `WidgetService.onPopulationButtonClick()` |
| Superpopulation/population selected | `heatmapScene` | `PopulationOnlyWidget` |
| Superpopulation/population deselected | `nodeEmphasisScene` | `PopulationOnlyWidget` |
| PCLAI button clicked | `nodeEmphasisScene` | `WidgetService.onPCLAIButtonClick()` |
| New data loaded | `nodeEmphasisScene` | `App.processData()` |

---

## Other Events (non-look)

### `lineIntersection`
- **Publisher**: `App` — when raycast hits a node
- **Payload**: `{ t, nodeName, nodeLine }`

### `clearIntersection`
- **Publisher**: `App` — when raycast stops hitting anything
- **Payload**: `{}`

### `datasetLoaded`
- **Publisher**: `App.processData()` — after new JSON data is fully loaded
- **Payload**: `{ json }`
