# Handling Multiple Line2 Instances with Raycaster

## Overview
When working with multiple Line2 instances, the raycaster can detect intersections with all of them. However, you need to properly set up and handle these intersections to identify which specific line was intersected.

## Key Concepts

### 1. Object Identification
Each Line2 instance should have a unique identifier or property that allows you to distinguish between them. This can be achieved by:
- Adding a custom property to the line object
- Using the object's name property
- Maintaining a reference to the original data associated with each line

### 2. Intersection Handling
When processing raycaster intersections:
- The raycaster will return an array of intersections
- Each intersection object contains:
  - `object`: The intersected Line2 instance
  - `point`: The point of intersection
  - `distance`: Distance from the camera to the intersection point
  - `faceIndex`: The index of the intersected face/segment

## Implementation Example

```javascript
// Setup multiple lines
const lines = data.map(item => {
    const line = LineFactory.createLine(/* ... */);
    line.userData = {
        id: item.id,
        // other relevant data
    };
    return line;
});

// In your animation/update loop
this.raycaster.setFromCamera(this.pointer, this.camera);
const intersections = this.raycaster.intersectObjects(lines);

if (intersections.length > 0) {
    // Sort by distance to get the closest intersection
    intersections.sort((a, b) => a.distance - b.distance);
    
    const closestIntersection = intersections[0];
    const intersectedLine = closestIntersection.object;
    const lineData = intersectedLine.userData;
    
    // Now you can identify which specific line was intersected
    console.log('Intersected line ID:', lineData.id);
}
```

## Best Practices

1. **Performance Optimization**
   - Only include lines in the raycaster that are currently visible
   - Consider using a spatial partitioning system for large numbers of lines
   - Use `intersectObjects` with specific arrays of lines rather than the entire scene

2. **User Experience**
   - Consider adding a small threshold to make line selection easier
   - Implement visual feedback for the currently selected line
   - Handle cases where multiple lines are very close to each other

3. **Data Management**
   - Keep references to your line objects organized
   - Consider using a Map or object to store line references by ID
   - Maintain the relationship between lines and their source data

## Example with Multiple Line Types

```javascript
// Setup different types of lines
const mainLines = [];
const referenceLines = [];

data.forEach(item => {
    const line = LineFactory.createLine(/* ... */);
    line.userData = {
        type: 'main',
        id: item.id
    };
    mainLines.push(line);
});

referenceData.forEach(item => {
    const line = LineFactory.createLine(/* ... */);
    line.userData = {
        type: 'reference',
        id: item.id
    };
    referenceLines.push(line);
});

// Selective intersection testing
this.raycaster.setFromCamera(this.pointer, this.camera);
const mainIntersections = this.raycaster.intersectObjects(mainLines);
const referenceIntersections = this.raycaster.intersectObjects(referenceLines);

// Handle intersections based on type
if (mainIntersections.length > 0) {
    // Handle main line intersection
} else if (referenceIntersections.length > 0) {
    // Handle reference line intersection
}
``` 