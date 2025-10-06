# Raycaster Parameters for Line2 Objects

## Overview
The raycaster parameters for Line2 objects are crucial for handling intersections with specialized line geometries in Three.js. These parameters are set in the `setupRaycaster` method of the SceneManager class.

## Parameters Explained

### `this.raycaster.params.Line2 = {}`
- Initializes a special parameter object specifically for Line2 objects
- Line2 is a special type of line geometry in Three.js that supports:
  - Variable line widths
  - Better rendering quality
  - Improved visual appearance

### `this.raycaster.params.Line2.threshold = 0`
- Sets the threshold for ray-line intersection detection
- A value of 0 means the ray must hit the line exactly
- Increasing this value would make intersection detection more forgiving
- Higher values would allow the ray to register hits when near but not exactly on the line

## Usage in the Project
These parameters are essential for:
- Proper intersection detection with Line2 objects
- Enabling the intersection feedback system (green sphere)
- Supporting the spiral visualization's interactive features

## Location in Code
```javascript
setupRaycaster() {
    this.raycaster.params.Line2 = {};
    this.raycaster.params.Line2.threshold = 0;
}
``` 