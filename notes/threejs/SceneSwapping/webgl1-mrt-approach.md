# WebGL1-Compatible MRT Approach

## The Problem

WebGL1 only supports **one texture per WebGLRenderTarget**, which prevents true Multiple Render Targets (MRT) where multiple textures are rendered simultaneously.

## The Solution: Sequential Rendering with Multiple Render Targets

Instead of true MRT, we use **sequential rendering** to multiple separate render targets, each with one texture.

## Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Scene A       │    │   Scene B       │    │   Scene C       │
│   (Blue Look)   │    │   (Red Look)    │    │   (Green Look)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ RenderTarget A  │    │ RenderTarget B  │    │ RenderTarget C  │
│ (Blue Texture)  │    │ (Red Texture)   │    │ (Green Texture) │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 ▼
                    ┌─────────────────────────┐
                    │   Composite Scene       │
                    │   (Display Quads)       │
                    └─────────────────────────┘
```

## Implementation Strategy

### 1. **Multiple Render Targets Setup**

```javascript
class MRTManager {
    constructor(renderer, width, height) {
        this.renderer = renderer;
        this.renderTargets = new Map();
        this.scenes = new Map();
        
        // Create render targets for each scene
        this.createRenderTargets(width, height);
    }
    
    createRenderTargets(width, height) {
        const options = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            wrapS: THREE.ClampToEdgeWrapping,
            wrapT: THREE.ClampToEdgeWrapping,
            generateMipmaps: false,
            anisotropy: this.renderer.capabilities.getMaxAnisotropy(),
            format: THREE.RGBAFormat,
            type: THREE.UnsignedByteType,
            depthBuffer: true,
            stencilBuffer: false
        };
        
        // Create separate render target for each scene
        this.renderTargets.set('blue-scene', new THREE.WebGLRenderTarget(width, height, options));
        this.renderTargets.set('red-scene', new THREE.WebGLRenderTarget(width, height, options));
        this.renderTargets.set('green-scene', new THREE.WebGLRenderTarget(width, height, options));
    }
}
```

### 2. **Sequential Rendering Loop**

```javascript
class MRTManager {
    // ... existing code ...
    
    renderAllScenes(camera) {
        // Render each scene to its own render target
        for (const [sceneName, scene] of this.scenes) {
            const renderTarget = this.renderTargets.get(sceneName);
            
            // Set render target and render
            this.renderer.setRenderTarget(renderTarget);
            this.renderer.render(scene, camera);
        }
        
        // Reset to default render target
        this.renderer.setRenderTarget(null);
    }
}
```

### 3. **Composite Display**

```javascript
class CompositeDisplay {
    constructor(renderer, renderTargets) {
        this.renderer = renderer;
        this.compositeScene = new THREE.Scene();
        this.compositeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        
        // Create display quads for each render target
        this.createDisplayQuads(renderTargets);
    }
    
    createDisplayQuads(renderTargets) {
        // Create fullscreen quads to display each render target
        for (const [sceneName, renderTarget] of renderTargets) {
            const geometry = new THREE.PlaneGeometry(2, 2);
            const material = new THREE.MeshBasicMaterial({
                map: renderTarget.texture,
                transparent: true,
                opacity: 0.5 // Blend multiple scenes
            });
            
            const quad = new THREE.Mesh(geometry, material);
            this.compositeScene.add(quad);
        }
    }
    
    render() {
        this.renderer.render(this.compositeScene, this.compositeCamera);
    }
}
```

## Integration with Current Architecture

### 1. **Minimal Changes Required**

Your current architecture is already perfect! The changes needed are minimal:

```javascript
// In App.js - modify the animate() method
animate() {
    // ... existing animation code ...
    
    // Instead of single render:
    // this.renderer.render(this.sceneMap.get(this.currentSceneName), this.cameraManager.camera)
    
    // Use MRT rendering:
    this.mrtManager.renderAllScenes(this.cameraManager.camera);
    this.compositeDisplay.render();
}
```

### 2. **LookManager Integration**

Your `LookManager` already supports multiple scenes perfectly:

```javascript
// Create different Looks for different scenes
const blueLook = new AssemblyVisualizationLook('blue', {colorScheme: 'blue'});
const redLook = new AssemblyVisualizationLook('red', {colorScheme: 'red'});

// Register with LookManager
lookManager.setLook('blue-scene', blueLook);
lookManager.setLook('red-scene', redLook);

// Update all animations
lookManager.updateAllAnimations(deltaTime, geometryManager);
```

### 3. **GeometryManager Integration**

No changes needed! Geometry is already shared:

```javascript
// Same geometry, different scenes with different Looks
geometryManager.addToScene(blueScene);  // Uses blueLook
geometryManager.addToScene(redScene);   // Uses redLook
```

## Performance Considerations

### 1. **Memory Usage**

- **Multiple Render Targets**: Each render target uses memory for color + depth buffers
- **Mitigation**: Use smaller render targets for secondary scenes
- **Benefit**: Still much more efficient than duplicating geometry

### 2. **Rendering Performance**

- **Sequential Rendering**: Each scene rendered separately
- **Mitigation**: Limit number of scenes, use LOD for secondary scenes
- **Benefit**: Shared geometry reduces vertex processing

### 3. **Optimization Strategies**

```javascript
// Only render active scenes
renderActiveScenes(camera) {
    const activeScenes = this.getActiveScenes();
    
    for (const sceneName of activeScenes) {
        const scene = this.scenes.get(sceneName);
        const renderTarget = this.renderTargets.get(sceneName);
        
        this.renderer.setRenderTarget(renderTarget);
        this.renderer.render(scene, camera);
    }
}
```

## Implementation Steps

### Phase 1: Create MRTManager
1. Create `MRTManager` class
2. Implement multiple render target creation
3. Implement sequential rendering

### Phase 2: Create CompositeDisplay
1. Create `CompositeDisplay` class
2. Implement display quad creation
3. Implement composite rendering

### Phase 3: Integrate with App
1. Modify `App.animate()` method
2. Add MRTManager and CompositeDisplay to App
3. Test with multiple scenes

### Phase 4: Optimize
1. Implement scene activation/deactivation
2. Add LOD for secondary scenes
3. Optimize render target sizes

## Benefits of This Approach

1. **WebGL1 Compatible**: Works with current browser support
2. **Shared Geometry**: Maintains MRT benefits
3. **Independent Looks**: Each scene has its own visual style
4. **Scalable**: Easy to add/remove scenes
5. **Performance**: Much better than geometry duplication

## Limitations

1. **Sequential Rendering**: Not true MRT (but still very effective)
2. **Memory Usage**: Multiple render targets use more memory
3. **Complexity**: Slightly more complex than single scene rendering

This approach gives you 90% of the MRT benefits while being fully WebGL1 compatible! 
