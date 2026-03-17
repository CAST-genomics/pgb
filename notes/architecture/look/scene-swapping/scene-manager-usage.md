# SceneManager Usage Guide

The `SceneManager` class provides comprehensive scene lifecycle management for the MRT-style architecture. It handles scene creation, cleanup, and resource disposal.

## Basic Usage

### Creating a SceneManager

```javascript
import SceneManager from './sceneManager.js'

const sceneManager = new SceneManager()
```

### Creating Scenes

```javascript
// Create a scene with default white background
const scene1 = sceneManager.createScene('genomeVisualizationScene')

// Create a scene with custom background
const scene2 = sceneManager.createScene('analysisScene', new THREE.Color(0x000000))
```

### Managing Active Scene

```javascript
// Get the currently active scene
const activeScene = sceneManager.getActiveScene()

// Switch to a different scene
sceneManager.setActiveScene('analysisScene')

// Get active scene name
const activeSceneName = sceneManager.getActiveSceneName()
```

## Scene Lifecycle Management

### Loading New Data Files

When loading new data files, proper cleanup is essential:

```javascript
// In your App class
async
handleSearch(url)
{
    this.stopAnimation()

    // Clear existing data and geometry
    this.clearCurrentData()

    // Load new data...
    const json = await loadPath(url)

    // Create new geometry...
    this.geometryManager.createGeometry(json)
    this.geometryManager.addToScene(scene)

    this.startAnimation()
}

clearCurrentData()
{
    // Clear genomic service data
    this.genomicService.clear()

    // Clear geometry manager
    this.geometryManager.clear()

    // Clear the current scene (but keep the scene itself)
    this.sceneManager.clearSceneWithName(this.currentSceneName)

    // Re-add visual feedback to the cleared scene
    const scene = this.sceneManager.getScene(this.currentSceneName)
    scene.add(this.raycastService.setupVisualFeedback())
}
```

### Scene Switching

```javascript
// Switch between different scenes
app.switchScene('genomeVisualizationScene')
app.switchScene('analysisScene')
```

### Creating New Scenes

```javascript
// Create a new scene with a specific look
const newLook = NodeEmphasisLook.createNodeEmphasisLook('analysis-look', {
    genomicService,
    geometryManager
})

app.createScene('analysisScene', newLook, new THREE.Color(0x000000))
```

## Resource Management

### Automatic Cleanup

The `SceneManager` automatically handles resource disposal:

- **Geometries**: All geometries are disposed when scenes are cleared
- **Materials**: All materials and their textures are disposed
- **Textures**: All textures are properly disposed
- **Scene Objects**: All objects are removed from scenes

### Manual Cleanup

```javascript
// Dispose of a specific scene
sceneManager.disposeSceneWithName('oldScene')

// Dispose of all scenes
sceneManager.disposeAll()

// Clear objects from a scene without disposing the scene
sceneManager.clearSceneWithName('sceneName')
```

## Scene Statistics

Get information about scene resources:

```javascript
const stats = sceneManager.getSceneStats('genomeVisualizationScene')
console.log(stats)
// Output: { objectCount: 150, geometryCount: 150, materialCount: 150, textureCount: 0 }
```

## Integration with LookManager

The `SceneManager` works seamlessly with the `LookManager`:

```javascript
// Create a scene
const scene = sceneManager.createScene('genomeVisualizationScene')

// Set a look for the scene
lookManager.setLook('genomeVisualizationScene', genomeVisualizationLook)

// Get the scene and its look
const scene = sceneManager.getScene('genomeVisualizationScene')
const look = lookManager.getLook('genomeVisualizationScene')
```

## Benefits

1. **Proper Resource Management**: Automatic disposal of Three.js resources prevents memory leaks
2. **Clean Scene Lifecycle**: Easy creation, switching, and cleanup of scenes
3. **Data File Loading**: Proper cleanup when loading new data files
4. **MRT Support**: Facilitates scene switching for Multiple Render Target architecture
5. **Debugging**: Scene statistics help identify resource usage issues

## Best Practices

1. **Always clear scenes** when loading new data files
2. **Use scene switching** instead of creating new scenes for the same data
3. **Dispose of scenes** when they're no longer needed
4. **Monitor scene statistics** during development to catch memory issues
5. **Re-add visual feedback** after clearing scenes 
