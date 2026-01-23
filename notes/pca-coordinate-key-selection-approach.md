# PCA Coordinate Key Selection - Implementation Approach

> **Status**: ✅ Implementation completed (January 2026)
> 
> This document outlines the approach for enhancing PCAChartService to show all dots for a selected coordinate key across all nodes. The implementation has been completed and is ready for testing.

## Current Behavior

1. **Coordinate Key Selection (PCAWidget)**:
   - User clicks a coordinate key selector in PCAWidget
   - `pcaWidget:emphasis` event is published with `{assembly: {name: coordinateKey}, nodeSet, edgeSet}`
   - Nodes in the graph are colored according to the selected coordinate key
   - PCAChartService stores `selectedCoordinateKey` but only uses it to filter dots when a node is hovered

2. **Node Hover**:
   - User hovers over a node in the graph
   - `lineIntersection` event is published with `{nodeName}`
   - PCAChartService calls `updateChartForNode(nodeName)`
   - If `selectedCoordinateKey` is set, only dots matching that key are shown for the hovered node
   - Otherwise, all dots for that node are shown

## New Requirement

When a coordinate key is selected from PCAWidget:
- **PCAChartService should show ALL dots corresponding to nodes that have the selected coordinate key** (across all nodes, not just the hovered one)
- **Deemphasize all other dots** (reference dots and any other dataset dots) via reduced opacity
- **Node hover behavior remains the same** (when hovering, still show that node's dots, but still filter by selected coordinate key if set)

## Implementation Strategy

### Two Rendering Modes

1. **Coordinate Key Selection Mode**: When `selectedCoordinateKey` is set and chart is visible, show all dots for that coordinate key across all nodes
2. **Node Hover Mode**: When a node is hovered, show that node's dots (filtered by selected coordinate key if set)

### Key Changes

#### 1. Add New Method: `renderDotsForCoordinateKey(coordinateKey)`

**Purpose**: Render all dots for a specific coordinate key across all nodes

**Implementation**:
- Use `pclaiCoordinateService.getCoordinatesForCoordinateKey(coordinateKey)` to get all coordinates
- Returns `Map<nodeId, {coordinates, rgbThreeJS, rgbString}>`
- Convert this to a format compatible with `renderDots()`:
  - Create a `Map<coordinateKey, coordinateData>` where each entry uses the coordinateKey as the key
  - Since all entries are for the same coordinate key, we can use a simple mapping
- Call `renderDots()` with this map
- Deemphasize reference dots (already handled in `renderDots()`)

**Note**: The `renderDots()` method expects `Map<assemblyKey, assemblyData>`, but we're providing coordinates for a single coordinate key across multiple nodes. We need to ensure the rendering logic works correctly.

**Alternative Approach**: Create a new rendering method that accepts the nodeId->coordinateData map directly, or modify `renderDots()` to handle both cases.

**Recommended**: Create `renderAllDotsForCoordinateKey(coordinateKey)` that:
- Gets coordinates using `getCoordinatesForCoordinateKey(coordinateKey)`
- Renders dots directly (similar to `renderDots()` but iterates over nodeId->coordinateData map)
- Each dot represents one node's coordinate for the selected key
- All dots rendered with full opacity
- Reference dots are deemphasized

#### 2. Modify `subscribeToPCAWidgetEvents()`

**Current behavior**:
- On `pcaWidget:emphasis`: Store `selectedCoordinateKey`, update chart if node is hovered
- On `pcaWidget:normal`: Clear `selectedCoordinateKey`, update chart if node is hovered

**New behavior**:
- On `pcaWidget:emphasis`: 
  - Store `selectedCoordinateKey`
  - If chart is visible:
    - If a node is currently hovered (`this.currentNodeId`), show that node's dots filtered by coordinate key (current behavior)
    - Otherwise, show all dots for the selected coordinate key using `renderAllDotsForCoordinateKey()`
- On `pcaWidget:normal`:
  - Clear `selectedCoordinateKey`
  - If chart is visible:
    - If a node is currently hovered, show all dots for that node (unfiltered)
    - Otherwise, clear dataset dots (show only reference dots)

#### 3. Modify `updateChartForNode(nodeId)`

**Current behavior**:
- Gets coordinates for the node
- Filters by `selectedCoordinateKey` if set
- Renders dots

**New behavior**:
- Keep current filtering logic
- But ensure that when a node is hovered while a coordinate key is selected, we show:
  - Dots for the hovered node that match the selected coordinate key
  - This is already the current behavior, so minimal changes needed

#### 4. Modify `clearChart()`

**Current behavior**:
- Clears dataset dots
- Restores reference dots opacity

**New behavior**:
- If `selectedCoordinateKey` is set and chart is visible:
  - Don't clear completely - instead show all dots for the selected coordinate key
- Otherwise, clear as normal

**Alternative**: Handle this in the event handlers instead of `clearChart()`

#### 5. Add Opacity Control for Reference Dots

**Current**: Reference dots are deemphasized when dataset dots are shown (via CSS class `pca-chart__reference-dots--deemphasized`)

**New**: When coordinate key is selected:
- Reference dots should be deemphasized (already happens when dataset dots are rendered)
- When coordinate key is cleared, restore reference dots opacity

### Event Flow

#### Scenario 1: User selects coordinate key (no node hovered)
1. User clicks coordinate key in PCAWidget
2. `pcaWidget:emphasis` event published
3. PCAChartService receives event
4. Stores `selectedCoordinateKey`
5. If chart is visible and no node is hovered:
   - Call `renderAllDotsForCoordinateKey(selectedCoordinateKey)`
   - Shows all dots for that coordinate key across all nodes
   - Reference dots are deemphasized

#### Scenario 2: User selects coordinate key (node already hovered)
1. User clicks coordinate key in PCAWidget
2. `pcaWidget:emphasis` event published
3. PCAChartService receives event
4. Stores `selectedCoordinateKey`
5. If chart is visible and node is hovered:
   - Call `updateChartForNode(this.currentNodeId)` (existing method)
   - Shows dots for hovered node filtered by selected coordinate key
   - Reference dots are deemphasized

#### Scenario 3: User hovers node (coordinate key already selected)
1. User hovers over node
2. `lineIntersection` event published
3. PCAChartService receives event
4. Calls `updateChartForNode(nodeName)`
5. Gets coordinates for node, filters by `selectedCoordinateKey`
6. Shows filtered dots for that node
7. Reference dots are deemphasized

#### Scenario 4: User deselects coordinate key (no node hovered)
1. User clicks selected coordinate key again
2. `pcaWidget:normal` event published
3. PCAChartService receives event
4. Clears `selectedCoordinateKey`
5. If chart is visible and no node is hovered:
   - Clear dataset dots (call `clearChart()`)
   - Reference dots return to full opacity

#### Scenario 5: User deselects coordinate key (node hovered)
1. User clicks selected coordinate key again
2. `pcaWidget:normal` event published
3. PCAChartService receives event
4. Clears `selectedCoordinateKey`
5. If chart is visible and node is hovered:
   - Call `updateChartForNode(this.currentNodeId)` (unfiltered)
   - Shows all dots for hovered node
   - Reference dots are deemphasized

### Implementation Details

#### New Method: `renderAllDotsForCoordinateKey(coordinateKey)`

```javascript
/**
 * Render all dots for a specific coordinate key across all nodes
 * @param {string} coordinateKey - The coordinate key to render dots for
 */
renderAllDotsForCoordinateKey(coordinateKey) {
    if (!this.isInitialized || !this.globalBoundingBox) {
        console.warn('PCAChartService: Not initialized');
        return;
    }

    // Get all coordinates for this coordinate key across all nodes
    const nodeCoordinatesMap = pclaiCoordinateService.getCoordinatesForCoordinateKey(coordinateKey);
    
    if (!nodeCoordinatesMap || nodeCoordinatesMap.size === 0) {
        // No nodes have this coordinate key, clear dataset dots
        this.clearDatasetDots();
        return;
    }

    // Deemphasize reference dots
    if (this.referenceDotsContainer) {
        this.referenceDotsContainer.classList.add('pca-chart__reference-dots--deemphasized');
    }

    // Clear existing dataset dots
    this.clearDatasetDots();

    // Render dots for each node's coordinate
    // Convert nodeId->coordinateData map to assemblyKey->coordinateData map format
    // Since all entries are for the same coordinate key, we can use coordinateKey as the key
    const coordinatesMap = new Map();
    for (const [nodeId, coordinateData] of nodeCoordinatesMap) {
        // Use coordinateKey as the key, coordinateData as the value
        // This allows reuse of existing renderDots() logic
        coordinatesMap.set(coordinateKey, coordinateData);
    }

    // Actually, we need to render one dot per node, not one dot per coordinate key
    // So we need a modified rendering approach
    
    // Better approach: Create a modified version that iterates over nodeId->coordinateData
    this.renderDotsFromNodeMap(nodeCoordinatesMap, this.globalBoundingBox);
}
```

#### New Method: `renderDotsFromNodeMap(nodeCoordinatesMap, globalBoundingBox)`

```javascript
/**
 * Render dots from a map of nodeId -> coordinateData
 * Similar to renderDots() but accepts nodeId->coordinateData map instead of assemblyKey->coordinateData map
 * @param {Map} nodeCoordinatesMap - Map of nodeId -> {coordinates, rgbThreeJS, rgbString}
 * @param {Object} globalBoundingBox - Global bounding box
 */
renderDotsFromNodeMap(nodeCoordinatesMap, globalBoundingBox) {
    // Similar implementation to renderDots() but iterates over nodeId->coordinateData
    // Each entry represents one dot to render
    // ... (implementation similar to renderDots)
}
```

**Alternative Simpler Approach**: Modify `renderDots()` to accept either format, or create a unified internal method that both `renderDots()` and `renderAllDotsForCoordinateKey()` use.

**Recommended**: Create `renderDotsFromCoordinateDataMap(coordinateDataMap, globalBoundingBox)` that accepts a map where:
- Keys can be either assemblyKey or nodeId (doesn't matter for rendering)
- Values are `{coordinates, rgbThreeJS, rgbString}` objects
- Both `renderDots()` and `renderAllDotsForCoordinateKey()` call this unified method

#### Modified `subscribeToPCAWidgetEvents()`

```javascript
subscribeToPCAWidgetEvents() {
    const pcaWidgetEmphasisUnsub = eventBus.subscribe('pcaWidget:emphasis', (data) => {
        const { assembly } = data;
        this.selectedCoordinateKey = assembly.name;
        
        if (this.isVisible) {
            if (this.currentNodeId) {
                // Node is hovered - show that node's dots filtered by coordinate key
                this.updateChartForNode(this.currentNodeId);
            } else {
                // No node hovered - show all dots for selected coordinate key
                this.renderAllDotsForCoordinateKey(this.selectedCoordinateKey);
            }
        }
    });

    const pcaWidgetNormalUnsub = eventBus.subscribe('pcaWidget:normal', (data) => {
        this.selectedCoordinateKey = null;
        
        if (this.isVisible) {
            if (this.currentNodeId) {
                // Node is hovered - show all dots for that node (unfiltered)
                this.updateChartForNode(this.currentNodeId);
            } else {
                // No node hovered - clear dataset dots, restore reference dots
                this.clearChart();
            }
        }
    });

    this.eventUnsubscribes.push(pcaWidgetEmphasisUnsub);
    this.eventUnsubscribes.push(pcaWidgetNormalUnsub);
}
```

#### Modified `clearChart()`

```javascript
clearChart() {
    if (this.chartSurface) {
        // Clear only dataset dots, preserve reference dots container
        const datasetDots = this.chartSurface.querySelectorAll('.pca-chart__dot');
        datasetDots.forEach(dot => dot.remove());
    }

    // Restore full opacity of reference dots when dataset dots are cleared
    if (this.referenceDotsContainer) {
        this.referenceDotsContainer.classList.remove('pca-chart__reference-dots--deemphasized');
    }

    this.currentNodeId = null;
    
    // If coordinate key is selected and chart is visible, show all dots for that key
    if (this.selectedCoordinateKey && this.isVisible) {
        this.renderAllDotsForCoordinateKey(this.selectedCoordinateKey);
    }
}
```

**Wait**: Actually, we don't want to re-render in `clearChart()` because that's called when mouse leaves a node. Instead, handle it in the event handlers.

**Better**: Keep `clearChart()` simple, handle coordinate key rendering in event handlers only.

### Summary of Changes

1. **Add `renderAllDotsForCoordinateKey(coordinateKey)`**: Renders all dots for a coordinate key across all nodes
2. **Add `renderDotsFromCoordinateDataMap(coordinateDataMap, globalBoundingBox)`**: Unified rendering method (or modify `renderDots()` to be more flexible)
3. **Modify `subscribeToPCAWidgetEvents()`**: Handle coordinate key selection/deselection with proper rendering logic
4. **Keep `updateChartForNode()` mostly unchanged**: Already filters by coordinate key correctly
5. **Keep `clearChart()` simple**: Just clears dots, doesn't re-render based on coordinate key

### Testing Scenarios

1. Select coordinate key → verify all dots for that key appear, reference dots deemphasized
2. Select coordinate key, then hover node → verify only dots for hovered node matching key appear
3. Hover node, then select coordinate key → verify dots filtered by key
4. Deselect coordinate key → verify behavior returns to normal
5. Toggle chart visibility → verify coordinate key selection persists correctly
