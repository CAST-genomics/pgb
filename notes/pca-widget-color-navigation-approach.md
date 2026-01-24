# PCA Widget Color Navigation Approach

## Context

The PCA widget displays a table with dots vertically arrayed on the left and labels associated with them. Each dot has an associated color from the coordinate data, but currently all dots appear gray. The challenge is:

- Many dots share the same color (dozens may have the same color)
- Only a few distinct colors exist across 40-60 or even 100 dots
- Color can create visual linkage between:
  - Selected nodes in the pangenome graph (which turn pink when selected)
  - Corresponding dots in the PCA chart
  - Dots in the PCA widget table

## Goal

Use color as an affordance to navigate the table and help users find dots they want to select, while creating visual connections across the three views (widget table, pangenome graph, PCA chart).

## Suggested Approaches

### 1. Color-Coded Dots in the Table

**Concept**: Replace the gray dots with their actual colors from the coordinate data.

**Benefits**:
- Immediate visual grouping - users can see which dots share colors at a glance
- Creates visual linkage - same color dots correspond to same color nodes in the graph
- Natural affordance - color helps users locate dots of interest

**Implementation Notes**:
- Use the RGB values from `pclaiCoordinateService.getNodeColorMapForCoordinateKey(coordinateKey)` or similar
- May need to handle cases where a coordinate key has multiple colors across different nodes

### 2. Color-Based Grouping/Clustering

**Concept**: Visually group dots by color in the table with subtle dividers or spacing between color groups.

**Benefits**:
- Makes it easier to scan and find dots of a particular color
- Shows the distribution of colors at a glance
- Can add color legend/headers for each group (e.g., "Blue Group (23 dots)")

**Implementation Notes**:
- Could add subtle background colors or borders to separate groups
- Might want to sort dots by color to create natural groupings

### 3. Interactive Color Filtering

**Concept**: Add a color legend/selector above or beside the table that allows users to filter by color.

**Benefits**:
- Efficient navigation when there are many dots but few colors
- Clicking a color filters the table, highlights nodes in the graph, and shows dots in the PCA chart
- Provides a clear way to explore different color groups

**Implementation Notes**:
- Could be a horizontal bar of color swatches above the table
- Each swatch shows the color and count (e.g., "Blue (23)")
- Clicking filters the table and updates other views

### 4. Visual Highlighting on Selection

**Concept**: When a dot is selected, highlight all dots of the same color in the table.

**Benefits**:
- Creates clear visual connection across all three views
- Shows users which other dots share the same color
- Helps understand the relationship between selection and color groups

**Implementation Notes**:
- Could use subtle background color, border, or opacity changes
- Should work in conjunction with highlighting nodes in the graph and showing dots in the PCA chart

### 5. Color-Based Search/Filter

**Concept**: Add a search/filter dropdown that groups by color, allowing users to type or select a color to filter the table.

**Benefits**:
- Efficient way to navigate when there are many dots
- Shows count for each color (e.g., "Blue (23)", "Red (15)")
- Can combine with text search for coordinate key names

**Implementation Notes**:
- Could be a dropdown or multi-select component
- Should show color swatches alongside text labels
- Could integrate with existing search functionality

### 6. Progressive Disclosure

**Concept**: Default view shows all dots with their colors, with option to collapse/expand color groups.

**Benefits**:
- Reduces visual clutter when there are many dots
- Allows users to focus on specific color groups
- Maintains full visibility when needed

**Implementation Notes**:
- Each color group could have a collapsible header
- Clicking header expands/collapses that color group
- Could show count of dots in each group

## Recommended Combined Approach

A combination of multiple approaches would provide the best user experience:

1. **Color-code the dots** - Replace gray dots with actual colors from coordinate data
2. **Add color legend/selector** - Show unique colors with counts, allow filtering
3. **Highlight on selection** - When a dot is selected, highlight all same-color dots in the table
4. **Visual grouping** - Optionally group dots by color with subtle visual separation

This approach provides:
- **Visual wayfinding** - Color helps users locate dots they're looking for
- **Clear linkage** - Same color = same nodes across all three views
- **Efficient navigation** - Filter by color when there are many dots
- **Context** - See which colors are common vs rare

## Implementation Considerations

- **Color consistency**: Ensure colors match across widget table, pangenome graph nodes, and PCA chart dots
- **Accessibility**: Consider colorblind users - may need additional visual indicators beyond color
- **Performance**: If there are many dots, filtering/grouping may need optimization
- **Color selection**: For coordinate keys with multiple colors across nodes, decide on a strategy (average, most common, first encountered, etc.)

## Related Files

- `src/widgets/pcaWidget.js` - PCA widget implementation
- `src/widgets/pclaiCoordinateService.js` - Service providing coordinate and color data
- `src/widgets/pcaChartService.js` - PCA chart visualization
- `src/styles/_pcaWidget.scss` - Widget styling
