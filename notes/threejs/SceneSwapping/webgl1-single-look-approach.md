# WebGL1 Approach for Single Look Selection

## The Use Case

The user selects **one Look at a time** to visualize the data. Only one scene needs to be rendered at any given moment.

## The WebGL1 "Restriction" is Not Actually a Problem

Since you're only rendering **one scene at a time**, the WebGL1 limitation of "one texture per WebGLRenderTarget" doesn't matter at all!

## Simplified Architecture

```
┌─────────────────┐
│   User Selects  │
│   "Blue Look"   │
└─────────────────┘
         │
         ▼
┌─────────────────┐
│   LookManager   │
│   getLook()     │
└─────────────────┘
         │
         ▼
┌─────────────────┐
│   Scene with    │
│   Blue Look     │
└─────────────────┘
         │
         ▼
┌─────────────────┐
│   Single Render │
│   (WebGL1 OK)   │
└─────────────────┘
```

## Implementation

### 1. **Look Selection**

```javascript
class App {
    constructor() {
        this.currentLookName = 'default-look';
        this.lookManager = new LookManager();
        
        // Register different Looks
        this.lookManager.setLook('blue-look', blueLook);
        this.lookManager.setLook('red-look', redLook);
        this.lookManager.setLook('green-look', greenLook);
    }
    
    switchLook(lookName) {
        this.currentLookName = lookName;
        this.updateSceneWithNewLook();
    }
}
```

### 2. **Single Scene Rendering**

```javascript
class App {
    animate() {
        // ... existing animation code ...

        // Get current scene with current Look
        const currentScene = this.scenes.get(this.currentLookName);
        const currentLook = this.lookManager.getLook(this.currentLookName);

        // Update animations for current Look only
        currentLook.updateBehavior(deltaTime, this.geometryManager);

        // Render single scene (WebGL1 compatible)
        this.renderer.render(currentScene, this.cameraManager.camera);
    }
}
```

### 3. **Scene Management**

```javascript
class SceneManager {
    constructor(lookManager) {
        this.lookManager = lookManager;
        this.scenes = new Map();
        this.currentSceneName = null;
    }
    
    createSceneForLook(lookName) {
        const scene = new THREE.Scene();
        const look = this.lookManager.getLook(lookName);
        
        // Add geometry to scene with this Look
        this.geometryManager.addToScene(scene, look);
        
        this.scenes.set(lookName, scene);
        return scene;
    }
    
    switchToScene(sceneName) {
        this.currentSceneName = sceneName;
        return this.scenes.get(sceneName);
    }
}
```

## Benefits of This Approach

### 1. **WebGL1 Fully Compatible**
- No render target complications
- Standard single-scene rendering
- No performance overhead

### 2. **Simple Architecture**
- One scene active at a time
- Direct Look switching
- No complex compositing needed

### 3. **Shared Geometry Benefits**
- Geometry created once, reused across Looks
- Memory efficient
- Fast Look switching

### 4. **Clean Separation**
- LookManager handles Look selection
- GeometryManager handles geometry
- SceneManager handles scene switching

## Look Switching Implementation

```javascript
class LookSwitcher {
    constructor(app) {
        this.app = app;
        this.setupUI();
    }
    
    setupUI() {
        // Create UI controls for Look selection
        const lookSelector = document.getElementById('look-selector');
        lookSelector.addEventListener('change', (e) => {
            this.switchLook(e.target.value);
        });
    }
    
    switchLook(lookName) {
        // Update current Look
        this.app.currentLookName = lookName;
        
        // Get or create scene for this Look
        let scene = this.app.sceneManager.getScene(lookName);
        if (!scene) {
            scene = this.app.sceneManager.createSceneForLook(lookName);
        }
        
        // Switch to this scene
        this.app.sceneManager.switchToScene(lookName);
        
        // Update UI to reflect current Look
        this.updateUI(lookName);
    }
}
```

## Performance Considerations

### 1. **Scene Creation**
- Create scenes lazily (only when first selected)
- Reuse scenes once created
- Dispose unused scenes if memory becomes an issue

### 2. **Look Switching**
- Instant switching (no rendering overhead)
- Pre-created scenes for fast switching
- Smooth transitions if desired

### 3. **Memory Management**
- Only one scene active at a time
- Shared geometry reduces memory usage
- Dispose unused Looks when switching

## Example Usage Flow

```javascript
// 1. User selects "Blue Look" from UI
lookSwitcher.switchLook('blue-look');

// 2. App switches to blue scene
app.currentLookName = 'blue-look';
const blueScene = app.sceneManager.switchToScene('blue-look');

// 3. Render loop uses blue scene
app.animate()
{
    const currentScene = app.scenes.get(app.currentLookName);
    const currentLook = app.lookManager.getLook(app.currentLookName);

    currentLook.updateBehavior(deltaTime, app.geometryManager);
    app.renderer.render(currentScene, app.cameraManager.camera);
}

// 4. User selects "Red Look"
lookSwitcher.switchLook('red-look');
// Process repeats with red scene
```

## Key Differences from "True MRT"

| Aspect | True MRT (WebGL2+) | Single Look (WebGL1) |
|--------|-------------------|---------------------|
| **Rendering** | Multiple scenes simultaneously | One scene at a time |
| **Display** | Composite/blend multiple textures | Single texture display |
| **Performance** | Higher GPU usage | Lower GPU usage |
| **Complexity** | Complex compositing | Simple scene switching |
| **Use Case** | Multiple views visible | Single view with switching |

## Conclusion

For your use case of **single Look selection**, the WebGL1 "restriction" is actually a **benefit**! You get:

- ✅ Simple, clean architecture
- ✅ WebGL1 compatibility
- ✅ Shared geometry benefits
- ✅ Fast Look switching
- ✅ No complex render target management

The MRT architecture you've built is still valuable because it provides the foundation for shared geometry and clean Look management - you just don't need the complex multi-target rendering part! 
