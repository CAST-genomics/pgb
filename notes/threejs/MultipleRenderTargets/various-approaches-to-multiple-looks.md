# Rendering a Single Scene to Multiple Canvases with Different Materials in Three.js

## Overview
This document summarizes different strategies for rendering a single Three.js scene to multiple canvases while using different materials for each rendering.

## Strategies

### 1. Multiple Render Targets (MRT)
- Uses a single renderer to render to multiple textures simultaneously
- Efficient for post-processing and different material effects
- Example implementation:
```javascript
// Create render target with multiple textures
const renderTarget = new THREE.WebGLMultipleRenderTargets(width, height, 2);

// Render scene to target
renderer.setRenderTarget(renderTarget);
renderer.render(scene, camera);
renderer.setRenderTarget(null);

// Use textures in different materials
const material1 = new THREE.MeshPhongMaterial({ map: renderTarget.textures[0] });
const material2 = new THREE.MeshPhongMaterial({ map: renderTarget.textures[1] });
```

### 2. Scene Override Material
- Temporarily changes materials during rendering using `scene.overrideMaterial`
- Useful for rendering the same scene with different material properties
- Example:
```javascript
// Set override material
scene.overrideMaterial = newMaterial;

// Render with override
renderer.render(scene, camera);

// Reset override
scene.overrideMaterial = null;
```

### 3. Multiple Scenes with Shared Geometry
- Creates separate scenes sharing the same geometry but with different materials
- Each scene has its own camera and viewport
- Example:
```javascript
function makeScene(geometry, material) {
    const scene = new THREE.Scene();
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    return scene;
}

const scene1 = makeScene(geometry, material1);
const scene2 = makeScene(geometry, material2);
```

### 4. Render Target with Material Switching
- Renders scene to a texture first, then uses that texture in different materials
- Good for effects like reflections or screen-space effects
- Example:
```javascript
// Render to target
renderer.setRenderTarget(renderTarget);
renderer.render(scene, camera);
renderer.setRenderTarget(null);

// Use in material
const material = new THREE.MeshPhongMaterial({
    map: renderTarget.texture
});
```

### 5. Array Camera with Different Viewports
- Uses ArrayCamera to render the same scene from different viewpoints
- Each viewport can use different materials
- Example:
```javascript
const camera = new THREE.ArrayCamera([
    new THREE.PerspectiveCamera(45, aspect, near, far),
    new THREE.PerspectiveCamera(45, aspect, near, far)
]);

// Each camera can have its own viewport
camera.cameras[0].viewport.set(0, 0, 0.5, 1);
camera.cameras[1].viewport.set(0.5, 0, 0.5, 1);
```

### 6. Material Side Switching
- Renders both sides of transparent materials with different materials
- Useful for glass-like effects
- Example:
```javascript
if (material.transparent && material.side === THREE.DoubleSide) {
    // Render back side
    material.side = THREE.BackSide;
    renderer.render(scene, camera);
    
    // Render front side
    material.side = THREE.FrontSide;
    renderer.render(scene, camera);
    
    // Reset
    material.side = THREE.DoubleSide;
}
```

## Considerations
When choosing a strategy, consider:
- Performance requirements
- Real-time update needs
- Material complexity
- Viewport requirements
- Memory constraints

## Best Practices
1. Use MRT for complex post-processing effects
2. Use scene override for simple material changes
3. Use multiple scenes when you need different viewports
4. Use render targets for screen-space effects
5. Use array cameras for multiple viewpoints
6. Use material side switching for transparent effects

## Performance Tips
- Reuse geometries and materials when possible
- Use appropriate render target sizes
- Consider using lower resolution for secondary views
- Implement proper cleanup of render targets
- Use appropriate material properties for each use case