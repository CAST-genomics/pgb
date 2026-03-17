```markdown
# Multiple Render Targets for Different Scene "Looks"

## Overview
This document explains how to implement multiple render targets in Three.js to create different visual "looks" for the same scene. Each render target can have its own material appearance (e.g., blue look, purple look) while maintaining the same geometry and camera controls.

## Basic Implementation

### 1. Create Render Target
```javascript
const renderTarget = new THREE.WebGLRenderTarget(
    width,
    height,
    {
        count: 2,  // Number of render targets
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter
    }
);

// Name the targets for debugging
renderTarget.textures[0].name = 'blueLook';
renderTarget.textures[1].name = 'purpleLook';
```

### 2. Create Different Materials
```javascript
const blueMaterial = new THREE.MeshPhongMaterial({
    color: 0x0000ff,  // Blue
    shininess: 100
});

const purpleMaterial = new THREE.MeshPhongMaterial({
    color: 0x800080,  // Purple
    shininess: 50
});
```

### 3. Create Scenes with Different Materials
```javascript
const blueScene = new THREE.Scene();
const purpleScene = new THREE.Scene();

// Add the same geometry to both scenes with different materials
const geometry = new THREE.TorusKnotGeometry(1, 0.3, 128, 32);
const blueMesh = new THREE.Mesh(geometry, blueMaterial);
const purpleMesh = new THREE.Mesh(geometry, purpleMaterial);

blueScene.add(blueMesh);
purpleScene.add(purpleMesh);

// Add lights to both scenes
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(1, 1, 1);
blueScene.add(light.clone());
purpleScene.add(light.clone());
```

### 4. Create Display Quad
```javascript
// Create a plane geometry that fills the screen
const quadGeometry = new THREE.PlaneGeometry(2, 2);

// Create a basic material that will display the render target texture
const displayMaterial = new THREE.MeshBasicMaterial({
    map: renderTarget.textures[0]  // Initially show the first render target
});

// Create the quad mesh
const quad = new THREE.Mesh(quadGeometry, displayMaterial);
scene.add(quad);

// Set up an orthographic camera for the quad
const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
quadCamera.position.z = 0.5;  // Position slightly in front of the quad
```

### 5. Set Up Camera Controls
```javascript
// Create a single camera that will be shared across all scenes
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0, 5);

// Create MapControls with the shared camera
const controls = new THREE.MapControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
```

### 6. Render Function
```javascript
function render() {
    // Update controls
    controls.update();
    
    // Render to render targets
    renderer.setRenderTarget(renderTarget);
    
    // Render blue scene
    renderer.setViewport(0, 0, width, height);
    renderer.render(blueScene, camera);
    
    // Render purple scene
    renderer.setViewport(0, 0, width, height);
    renderer.render(purpleScene, camera);
    
    // Render quad to screen
    renderer.setRenderTarget(null);
    renderer.render(scene, quadCamera);
}
```

### 7. Switch Between Looks
```javascript
function switchLook(index) {
    displayMaterial.map = renderTarget.textures[index];
    displayMaterial.needsUpdate = true;
}
```

### 8. Handle Window Resize
```javascript
function onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    // Update main camera
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    
    // Update renderer and render target
    renderer.setSize(width, height);
    renderTarget.setSize(width, height);
    
    // Update quad camera to maintain aspect ratio
    const aspect = width / height;
    quadCamera.left = -aspect;
    quadCamera.right = aspect;
    quadCamera.updateProjectionMatrix();
}
```

## Key Concepts

### Render Target vs Screen Rendering
- `renderer.setRenderTarget(renderTarget)` tells the renderer to draw to the render target's textures
- `renderer.setRenderTarget(null)` tells the renderer to draw directly to the screen

### Camera Setup
- Main camera (perspective): Used for rendering 3D scenes to render targets, controlled by MapControls
- Quad camera (orthographic): Static camera used only for rendering the display quad to screen

### Scene Organization
- Each "look" has its own scene with the same geometry but different materials
- All scenes share the same camera for consistent viewing
- The display quad is in a separate scene for final rendering

## Adding More Looks
To add more looks:
1. Increase the render target count
2. Create additional materials
3. Create additional scenes
4. Update the render function to render each scene
5. Update the switchLook function to handle more indices

## Performance Considerations
- Each render target requires additional memory and processing power
- Consider using lower resolution for secondary targets if full resolution isn't needed
- Use appropriate texture formats and filtering based on your needs
```

Would you like me to add any additional sections or expand on any particular aspect of the implementation?