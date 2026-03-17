# PCA Chart Improvements

## Problem Statement

When multiple nodes in the pan genome graph are selected (potentially a dozen or more), each node corresponds to a dot in the PCA chart. However, there are significant usability issues:

- **Visual Clutter**: Multiple dots cluster together, making it difficult to distinguish individual dots
- **Scale Issues**: Dots are too small to be easily identified or selected
- **Information Loss**: Users cannot see individual dots or understand their relationships when they overlap
- **User Frustration**: It becomes nearly impossible to disambiguate between dots due to their close proximity

This creates a barrier to understanding the relationship between selected nodes in the pan genome graph and their corresponding positions in PCA space.

## Proposed Solutions

### 1. Make the Chart Zoomable

**Concept**: Allow users to zoom into specific areas of the chart to see clustered dots in greater detail.

**Benefits**:
- Users can zoom into clusters to see individual dots
- Pan functionality allows exploration of different chart regions
- Maintains context while providing detail
- Standard interaction pattern that users expect

**Considerations**:
- Need intuitive zoom controls (mouse wheel, zoom buttons, pinch gestures)
- Should provide a way to reset zoom level
- May benefit from a minimap or overview to show zoomed area context
- Need to ensure axes labels remain readable at different zoom levels

### 2. Make the Chart Bigger

**Concept**: Simply increase the default size of the chart to provide more space for dots.

**Benefits**:
- Simple, immediate solution
- Provides more space between dots naturally
- No additional interaction complexity

**Considerations**:
- May reduce available space for the pan genome graph
- Fixed size may not suit all users or screen sizes
- Doesn't solve the problem if dots are inherently clustered in PCA space
- Should consider responsive sizing for different screen sizes

### 3. Make the Chart Draggable/Resizable

**Concept**: Allow users to drag the chart to resize it, giving them control over the chart dimensions.

**Benefits**:
- Users can customize chart size to their preference
- Flexible layout that adapts to user needs
- Can make chart larger when needed, smaller when not

**Considerations**:
- Need clear resize handles or drag points
- Should have reasonable min/max size constraints
- May want to persist size preference across sessions
- Resizing should maintain aspect ratio or allow free-form resizing (design decision)

## Critique and Analysis

### Strengths of Proposed Solutions

All three solutions address the core problem of insufficient visual space and dot visibility. They each offer different approaches:

- **Zoom**: Best for detailed exploration and maintaining full chart context
- **Larger Size**: Simplest implementation, immediate benefit
- **Resizable**: Most flexible, gives users control

### Potential Limitations

- **Zoom alone**: May not solve the problem if dots are inherently clustered in PCA space - zooming in might just show overlapping dots more clearly
- **Larger size alone**: Fixed size may not be optimal for all use cases or screen sizes
- **Resizable alone**: Requires user action to improve the situation, doesn't help by default

### Complementary Approaches

The solutions work best when combined:
- **Resize + Zoom**: Resize for overall scale preference, zoom for detailed cluster exploration
- **Larger Default + Zoom**: Start with a larger default size, add zoom for fine detail
- **All Three**: Maximum flexibility - larger default, user-controlled resizing, and zoom for exploration

## Recommendations

### Primary Recommendation: Combined Approach

Implement **both zoom and resize functionality**:

1. **Resizable Chart**: 
   - Allow users to drag corners/edges to resize the chart
   - Provides control over overall scale preference
   - Set reasonable default size (larger than current)
   - Maintain aspect ratio or allow free-form (design decision)

2. **Zoom Functionality**:
   - Mouse wheel zoom centered on cursor position
   - Zoom buttons/controls in chart header
   - Pan when zoomed in (click and drag)
   - Reset zoom button
   - Optional: minimap showing zoomed area context

3. **Enhanced Dot Interaction**:
   - Increase dot size at higher zoom levels
   - Hover highlighting to emphasize individual dots
   - Selection highlighting to show which dot corresponds to hovered node

### Additional Enhancements to Consider

1. **Dot Size Scaling**: Make dots scale with zoom level - larger when zoomed in, smaller when zoomed out
2. **Hover/Selection Highlighting**: When hovering over a node in the pan genome graph, highlight the corresponding dot in the PCA chart (and vice versa)
3. **Clustering/Aggregation**: At low zoom levels, show cluster indicators; expand to individual dots when zoomed in
4. **Tooltip on Hover**: Show coordinate values and node information when hovering over dots

### Implementation Priority

1. **High Priority**: Resizable chart + larger default size
2. **Medium Priority**: Zoom functionality
3. **Low Priority**: Enhanced dot interactions and clustering

## Related Files

- `src/widgets/pcaChartService.js` - PCA chart service implementation
- `src/styles/_pcaChart.scss` - PCA chart styling
- `index.html` - Chart container structure

## Notes

- The chart is currently implemented as a fixed-size div-based visualization
- Dots are rendered as absolutely positioned div elements
- Chart uses a global bounding box calculated from all coordinate data
- Current chart size is defined by CSS custom property `--pca-chart-surface-size: 448px`
