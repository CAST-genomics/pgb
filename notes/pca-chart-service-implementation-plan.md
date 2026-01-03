# PCA Chart Service Implementation Plan

## Overview

Create a PCA Chart feature that displays dots on a div-based chart surface when users hover over nodes in the pangenome graph. The service will retrieve coordinate and color data from `PCLACoordinateService` and render dots dynamically.

## Completed Components

### 1. Navbar Button

- ✅ Added "PCA Chart" button to navbar in `index.html`
- ✅ Positioned between locus input and info button
- ✅ Styled as outlined button with lighter border that darkens on hover
- ✅ Button ID: `pca-chart-button`

## Implementation Tasks

### 2. Create PCA Chart Service (`src/pcaChartService.js`)

**Class**: `PCAChartService`

**Constructor**:

- Takes optional container ID (default: 'pca-chart-container')
- Creates chart DOM structure
- Sets up event subscriptions
- Initializes state variables
- Chart initially hidden

**Properties**:

- `chartContainer` - DOM element for the chart card
- `chartSurface` - Main div for rendering dots
- `isVisible` - Boolean tracking chart visibility
- `currentNodeId` - Currently hovered node ID (string or null)
- `globalBoundingBox` - **Single bounding box for ALL nodes** (calculated once during initialization)
- `eventUnsubscribe` - Function to unsubscribe from eventBus
- `chartWidth` - Chart surface width (calculated from bounding box)
- `chartHeight` - Chart surface height (calculated from bounding box)
- `dotSizePercent` - Dot size as percentage of bounding box width (default: 0.5%)
- `chartPadding` - Padding around chart edges in pixels (default: 20px)
- `isInitialized` - Boolean tracking if global bounding box has been calculated

**Methods**:

**`createChartDOM()`**

- Creates Bootstrap card structure similar to other widgets
- Card ID: `pca-chart-container`
- Card classes: `pca-chart__card card position-absolute`
- Card header: "PCA Chart" title
- Card body: Contains chart surface div
- Chart surface ID: `pca-chart-surface`
- Chart surface classes: `pca-chart__surface`
- Initially hidden with `display: none`
- Positioned absolutely (similar to assembly/population widgets)

**`subscribeToNodeHover()`**

- Subscribes to `eventBus` 'lineIntersection' events
- On node hover: extracts `nodeName` from event data
- Calls `updateChartForNode(nodeName)`
- On clear (null intersection): calls `clearChart()`
- Also subscribes to 'clearIntersection' events
- Stores unsubscribe function in `this.eventUnsubscribe`

**`initializeGlobalBoundingBox()`** ⭐ **NEW - Critical Setup Method**

- **Called once when new dataset is loaded** (in `App.handleSearch()`)
- Traverses ALL nodes in the dataset via `pclaiCoordinateService`
- For each node that has coordinates:
  - Calls `pclaiCoordinateService.getCoordinatesForNode(nodeId)`
  - Iterates through all assemblies in the coordinates Map
  - Collects all x and y values from all coordinates
- Calculates global min/max for x and y across ALL nodes
- Calculates ranges: `xRange = maxX - minX`, `yRange = maxY - minY`
- Determines maximum dimension: `maxDimension = Math.max(xRange, yRange)`
- Calculates chart dimensions based on max dimension + padding:
  ```javascript
  chartWidth = maxDimension + (2 * chartPadding)
  chartHeight = maxDimension + (2 * chartPadding)
  ```

- Stores result in `this.globalBoundingBox`:
  ```javascript
  {
    x: { min: number, max: number, centroid: number, range: number },
    y: { min: number, max: number, centroid: number, range: number },
    maxDimension: number,
    chartWidth: number,
    chartHeight: number
  }
  ```

- Sets `this.isInitialized = true`
- Updates chart surface DOM dimensions to match calculated size
- Logs bounding box statistics for debugging
- **This bounding box is used for ALL subsequent node hovers**

**`updateChartForNode(nodeId)`**

- **Uses pre-calculated `globalBoundingBox`** (no recalculation)
- Validates `isInitialized` is true, otherwise logs warning and returns
- Calls `pclaiCoordinateService.getCoordinatesForNode(nodeId)` (loose coupling)
- If coordinates exist:
  - Stores `currentNodeId = nodeId`
  - Calls `renderDots(coordinatesMap, this.globalBoundingBox)` ⭐ Uses global bbox
- If no coordinates: calls `clearChart()`
- Handles null/undefined gracefully

**`renderDots(coordinatesMap, globalBoundingBox)`** ⭐ **Uses Global Bounding Box**

- Clears existing dots from chart surface
- Validates `globalBoundingBox` exists (throws error if not initialized)
- Validates ranges (handles division by zero)
- Calculates dot size in pixels: `dotSizePx = (globalBbox.x.range * dotSizePercent / 100)`
- For each entry in coordinatesMap:
  - Extracts `coordinates: [x, y]` and `color: "rgb(r, g, b)"`
  - **Scales coordinates using global bounding box** (same coordinate space for all nodes)
  - **Accounts for padding** when scaling:
    ```javascript
    // Scale to chart dimensions minus padding
    scaledX = (x - globalBbox.x.min) / globalBbox.x.range * (chartWidth - 2*chartPadding) + chartPadding
    scaledY = (y - globalBbox.y.min) / globalBbox.y.range * (chartHeight - 2*chartPadding) + chartPadding
    ```
  - Clamps values to chart bounds
  - Creates dot div element (rectangular div)
  - Sets position (absolute): `left: clampedX - dotSizePx/2`, `top: clampedY - dotSizePx/2`
  - Sets size: `width: dotSizePx`, `height: dotSizePx`
  - Sets background color from RGB
  - Sets border-radius: `50%` (makes rectangular div appear round)
  - Sets border: `1px solid transparent` (becomes visible on hover)
  - Adds hover event listeners for highlight effect (border becomes visible, thicker, z-index increases)
  - Appends to chart surface
- Uses DocumentFragment for batch DOM updates
- **All dots from all nodes use the same coordinate space**
- **Dots are sized as percentage of bounding box width**
- **Padding prevents dots from touching edges**

**`clearChart()`**

- Removes all dot elements from chart surface
- Resets `currentNodeId = null`
- Keeps chart container visible if `isVisible` is true

**`reset()`** ⭐ **NEW - For New Dataset Loading**

- Clears chart dots
- Resets `isInitialized = false`
- Resets `globalBoundingBox = null`
- Resets `currentNodeId = null`
- Called before loading new dataset to prepare for re-initialization

**`showChart()`**

- Sets chart container `display: block` or adds 'show' class
- Sets `isVisible = true`
- Ensures chart is visible

**`hideChart()`**

- Sets chart container `display: none` or removes 'show' class
- Sets `isVisible = false`
- Optionally calls `clearChart()`

**`toggleChart()`**

- Toggles visibility state
- Calls `showChart()` or `hideChart()` accordingly
- Returns new visibility state

**`dispose()`**

- Unsubscribes from events (calls `eventUnsubscribe()`)
- Removes DOM elements
- Cleans up all references

### 3. Chart DOM Structure

**HTML Structure** (created dynamically in `createChartDOM()`):

```html
<div id="pca-chart-container" class="pca-chart__card card position-absolute" style="display: none;">
  <div class="card-header">
    <h5 class="card-title mb-0">PCA Chart</h5>
  </div>
  <div class="card-body">
    <div id="pca-chart-surface" class="pca-chart__surface">
      <!-- Dots rendered here as divs -->
    </div>
  </div>
</div>
```

**Dot Structure** (created dynamically):

```html
<div class="pca-chart__dot" 
     style="position: absolute; 
            left: Xpx; 
            top: Ypx; 
            width: [calculated]px; 
            height: [calculated]px; 
            background-color: rgb(r, g, b); 
            border-radius: 50%;
            border: 1px solid transparent;">
</div>
```

**Note**: 

- Dots are rectangular divs styled to appear round via `border-radius: 50%`
- Size calculated as percentage of bounding box width
- Border initially transparent, becomes visible on hover

### 4. CSS Styling (`src/styles/_pcaChart.scss` or added to existing styles)

**Chart Container** (`.pca-chart__card`):

- Position: absolute
- Z-index: 1000 (above 3D scene)
- Top: 0, Left: 0 (or configurable position)
- Margin: similar to other widgets (e.g., margin-left: 10rem, margin-top: 10rem)
- Width: **Dynamic** (chart width + card padding + header/footer)
- Height: **Dynamic** (chart height + card padding + header/footer)
- Background: white
- Box-shadow: subtle shadow
- Border-radius: Bootstrap card default
- Transition: opacity for show/hide
- Min-width/min-height: ensure minimum usable size

**Chart Surface** (`.pca-chart__surface`):

- Position: relative (for absolute positioning of dots)
- Width: **Calculated dynamically** based on max dimension + padding
- Height: **Calculated dynamically** based on max dimension + padding
- Background: white or light gray
- Border: optional subtle border
- Overflow: hidden (dots clipped to surface)
- Dimensions set via JavaScript after bounding box calculation

**Dots** (`.pca-chart__dot`):

- Position: absolute
- Width: **Calculated as percentage of bounding box width** (e.g., 0.5% of x range)
- Height: **Same as width** (square)
- Border-radius: 50% (makes rectangular div appear round)
- Background-color: from RGB data
- Border: `1px solid transparent` (becomes visible on hover)
- Pointer-events: auto (enables hover interaction)
- Transition: smooth transitions for border color
- Cursor: pointer (indicates interactivity)

**Dot Hover State** (`.pca-chart__dot:hover`):

- Border-color: dark color (e.g., `#333` or `#000`) for highlight
- Border-width: `2px` or `3px` (thicker on hover)
- Z-index: higher value to bring hovered dot to front
- Box-shadow: optional subtle shadow for depth
- Transition: smooth border color/width change

### 5. Integration Points

**`src/app.js`** ⭐ **Updated Integration Point**:

- Import: `import PCAChartService from './pcaChartService.js'`
- Import: `import { pclaiCoordinateService } from './pclaiCoordinateService.js'`
- Create instance in `App` constructor or as module-level variable
- In `handleSearch()` method, after data loading:
  ```javascript
  async handleSearch(url) {
    // ... existing code ...
    
    pclaiCoordinateService.loadCoordinates(json)
    
    // Initialize PCA Chart with global bounding box
    pcaChartService.reset()  // Clear previous state
    pcaChartService.initializeGlobalBoundingBox()  // Calculate global bbox
    
    // ... rest of existing code ...
  }
  ```

- Wire up button click handler in `main.js`:
  ```javascript
  const pcaChartButton = document.getElementById('pca-chart-button');
  if (pcaChartButton) {
    pcaChartButton.addEventListener('click', () => {
      pcaChartService.toggleChart();
    });
  }
  ```


**`index.html`**:

- Chart container will be created dynamically by service
- Button already exists: `#pca-chart-button`

**Event Flow**:

**Initialization Phase** (when new data loaded):

1. `App.handleSearch()` loads JSON data
2. `pclaiCoordinateService.loadCoordinates(json)` processes coordinates
3. `pcaChartService.reset()` clears previous state
4. `pcaChartService.initializeGlobalBoundingBox()` traverses ALL nodes
5. Calculates single global bounding box for entire dataset
6. Stores in `globalBoundingBox` property

**Hover Phase** (during user interaction):

1. User hovers over node → `raycastService` publishes 'lineIntersection' event with `{nodeName, ...}`
2. `PCAChartService` receives event → extracts `nodeName`
3. `PCAChartService.updateChartForNode(nodeName)` called
4. Service calls `pclaiCoordinateService.getCoordinatesForNode(nodeName)` (loose coupling)
5. Service receives `Map<assemblyKey, {coordinates, color, assemblyKey}>` or null
6. If coordinates exist, service calls `renderDots(coordinatesMap, this.globalBoundingBox)` ⭐ Uses global bbox
7. Dots rendered on chart surface using **same coordinate space** as all other nodes
8. When user moves away from node, 'clearIntersection' event clears chart

### 6. Global Bounding Box Calculation ⭐ **NEW**

**Purpose**: Calculate a single coordinate space for ALL nodes in the dataset

**Method**: `initializeGlobalBoundingBox()`

**Process**:

1. Get all node IDs from `pclaiCoordinateService` (need to add method or iterate through service)

   - **Option A**: Add `getAllNodeIds()` method to `PCLACoordinateService`
   - **Option B**: Iterate through internal coordinates Map (if exposed)
   - **Option C**: Pass node list from JSON during initialization

2. For each node ID:

   - Call `pclaiCoordinateService.getCoordinatesForNode(nodeId)`
   - If coordinates exist, iterate through all assemblies
   - Collect all x and y values

3. After processing all nodes:

   - Calculate `minX`, `maxX`, `minY`, `maxY` across ALL collected coordinates
   - Store as `globalBoundingBox`

4. This bounding box is used for ALL subsequent node hovers

**Performance**: 

- One-time traversal during data loading
- O(n) where n = total number of coordinate points across all nodes
- Acceptable since it's done once per dataset load

### 7. Coordinate Scaling Algorithm ⭐ **UPDATED**

**Input**:

- Raw coordinates: `[x, y]` from JSON (for current node)
- **Global bounding box**: `{x: {min, max, centroid}, y: {min, max, centroid}}` (same for all nodes)
- Chart dimensions: `chartWidth` x `chartHeight`

**Process**:

```javascript
// Uses GLOBAL bounding box (same for all nodes)
// Accounts for padding to prevent edge dots
const scaleX = (x - globalBbox.x.min) / globalBbox.x.range * (chartWidth - 2*chartPadding) + chartPadding;
const scaleY = (y - globalBbox.y.min) / globalBbox.y.range * (chartHeight - 2*chartPadding) + chartPadding;

// Dot size as percentage of bounding box width
const dotSizePx = (globalBbox.x.range * dotSizePercent / 100);
```

**Key Points**: 

- **Same coordinate space** for dots from node "5504+" and node "5505+"
- Dots maintain their relative positions across different nodes
- No rescaling when switching between nodes
- **Chart dimensions based on max(xRange, yRange) + padding** (square chart)
- **Dots sized as percentage of bounding box width** (scales with data)
- **Padding prevents dots from touching edges**

**Edge Cases**:

- Handle division by zero (if min === max)
- Clamp values to chart bounds
- Handle null/undefined global bounding box (check `isInitialized` flag)
- If not initialized, log warning and skip rendering

### 8. Error Handling ⭐ **UPDATED**

- **No coordinates for node**: Silently skip (don't render dots)
- **Global bounding box not initialized**: Log warning, skip rendering, return early
- **Null global bounding box**: Check `isInitialized` flag, show error message
- **Empty coordinates Map**: Show empty chart surface
- **Invalid coordinate values**: Skip invalid entries, log warning
- **Event bus errors**: Wrap in try-catch, log errors
- **DOM errors**: Check element existence before manipulation
- **Initialization errors**: Handle gracefully, allow retry on next dataset load

### 9. Button State Management

**Active State**:

- When chart is visible, optionally add active class to button
- Visual feedback: darker border or background
- CSS class: `pca-chart-button--active` (optional)

**Toggle Behavior**:

- Click button → toggle chart visibility
- Chart shows/hides smoothly
- Dots update on node hover regardless of visibility state

### 10. Performance Considerations ⭐ **UPDATED**

- **Global Bounding Box Calculation**: One-time O(n) traversal during data load (acceptable)
- **Dot Creation**: Use DocumentFragment for batch DOM updates
- **Event Throttling**: Consider throttling hover events if needed
- **Memory**: Clean up dots when clearing chart
- **Re-rendering**: Only re-render when node changes or chart becomes visible
- **No Per-Node Rescaling**: Global bounding box eliminates repeated calculations
- **Hover Interactions**: Each dot has hover event listener (manage carefully for performance)
- **Dynamic Sizing**: Chart and dots resize based on data (no fixed dimensions)

### 11. Future Extensibility

- **Configurable Dimensions**: Make chartPadding configurable
- **Dot Size**: Make dotSizePercent configurable
- **Aspect Ratio**: Option to maintain aspect ratio vs square chart
- **Grid/Axes**: Optional grid lines and axis labels
- **Dot Labels**: Optional assembly key labels on hover
- **Highlighting**: Highlight specific assemblies
- **Animation**: Smooth transitions when dots appear/disappear
- **Multiple Nodes**: Show dots from multiple nodes simultaneously
- **Chart Positioning**: Configurable position (top-right, bottom-left, etc.)

## File Structure

```
src/
  ├── pcaChartService.js          (new file)
  └── styles/
      └── _pcaChart.scss          (new file, or add to app.css)
```

## Dependencies

- `pclaiCoordinateService` - For coordinate/color data (loose coupling)
  - **May need to add method**: `getAllNodeIds()` or expose internal coordinates Map
  - **Alternative**: Pass node list during initialization
- `eventBus` - For node hover events
- Bootstrap - For card styling
- Existing widget patterns - For positioning and structure

## Implementation Notes ⭐ **NEW**

**Critical Requirement**: Single Coordinate Space

- Global bounding box must be calculated ONCE per dataset load
- All nodes use the SAME bounding box for scaling
- No per-node rescaling - maintains consistent coordinate space
- Dots from different nodes appear in their correct relative positions

**Initialization Sequence**:

1. Data loaded → `pclaiCoordinateService.loadCoordinates(json)`
2. `pcaChartService.reset()` → Clear previous state
3. `pcaChartService.initializeGlobalBoundingBox()` → Calculate global bbox
4. Chart ready for hover interactions

**PCLACoordinateService Enhancement** (if needed):

- May need to add method to get all node IDs that have coordinates
- Or expose internal `coordinates` Map for iteration
- Or pass node list as parameter to `initializeGlobalBoundingBox()`

## Testing Considerations ⭐ **UPDATED**

- **Global Bounding Box**:
  - Test initialization with dataset containing multiple nodes
  - Test that bounding box includes coordinates from all nodes
  - Test with dataset where some nodes have coordinates, some don't
  - Test with empty dataset (no nodes with coordinates)
  - Verify bounding box is calculated correctly (min/max values)
  
- **Coordinate Scaling**:
  - Test that dots from different nodes use same coordinate space
  - Test coordinate scaling accuracy with global bounding box
  - Test edge cases (division by zero, clamping)
  - Test that padding prevents dots from touching edges
  - Test chart sizing based on max dimension
  
- **Dot Rendering**:
  - Test dot size calculation as percentage of bounding box
  - Test that dots appear round (border-radius styling)
  - Test hover highlighting (border becomes visible)
  - Test hover z-index (hovered dot appears on top)
  - Test with overlapping dots (hover helps disambiguation)
  
- **Node Hover**:
  - Test with nodes that have coordinates
  - Test with nodes that don't have coordinates
  - Test switching between nodes (verify no rescaling)
  - Test that dots maintain relative positions across nodes
  
- **Initialization**:
  - Test `initializeGlobalBoundingBox()` is called on data load
  - Test `reset()` clears state properly
  - Test that chart works after re-initialization with new dataset
  
- **UI**:
  - Test button toggle functionality
  - Test event subscription/unsubscription
  - Test chart visibility states

