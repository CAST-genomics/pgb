# Creating a New Look

A step-by-step guide for adding a new Look to PGB.

---

## 1. Create the Look Subclass

Create a new file in `src/looks/`. Extend the base `Look` class:

```javascript
import Look from './look.js'
import eventBus from '../utils/eventBus.js'

class MyNewLook extends Look {

    constructor(name, config) {
        super(name, config)
        // Store any additional config your look needs
    }

    static createMyNewLook(name, config) {
        return new MyNewLook(name, config)
    }
}

export default MyNewLook
```

## 2. Override Hooks as Needed

The base class provides several hooks. Override only what your look requires:

| Hook | Purpose | When to Override |
|------|---------|-----------------|
| `getNodeColor(nodeName)` | Return a `THREE.Color` for normal node appearance | Your look uses non-default node colors |
| `getEdgeColors(startNode, endNode, edgeKey)` | Return `[startColor, endColor]` for edge gradient | Your look uses non-default edge colors |
| `createNodeTooltipContent(nodeObject)` | Return HTML string for node hover tooltip | Your look shows specialized tooltip data |
| `getZOffset(objectId)` | Return Z position for a node or edge | Your look uses custom depth layering |
| `updateBehavior(deltaTime, scene)` | Called every frame in the render loop | Your look has animation |

## 3. Subscribe to Events

Override `activate()` and `deactivate()` to wire up event-driven behavior:

```javascript
activate() {
    super.activate()

    this.myEventUnsub = eventBus.subscribe('myWidget:someEvent', data => {
        // React to widget interaction
    })
}

deactivate() {
    super.deactivate()

    if (this.myEventUnsub) {
        this.myEventUnsub()
        this.myEventUnsub = null
    }
}
```

Every subscription made in `activate()` **must** be unsubscribed in `deactivate()`. This ensures only the active look responds to events.

## 4. Register in main.js

Follow the existing pattern:

```javascript
import MyNewLook from './looks/myNewLook.js'

// Create the look
const myNewLook = MyNewLook.createMyNewLook('myNewLook', {
    genomicService,
    geometryManager,
    assemblyWidget,
    // ... any additional config
})

// Create its scene
sceneManager.createScene('myNewScene', rubinColors.rubinIvory)

// Register look with scene
sceneManager.lookManager.setLook('myNewScene', myNewLook)
```

## 5. Wire Up Scene Switching

In the widget or UI component that activates your look:

```javascript
app.setActiveScene('myNewScene', true)
```

The `true` parameter pauses/resumes the animation loop around the switch for stability.

## 6. Disposal

If your look creates resources beyond the base class material cache, override `dispose()`:

```javascript
dispose() {
    super.dispose()
    // Clean up any additional resources
}
```

---

## Config Properties

The base `Look` constructor expects these in the config object:

| Property | Required | Used By |
|----------|----------|---------|
| `genomicService` | Yes | Node metadata lookups |
| `geometryManager` | Yes | Geometry and node name access |
| `assemblyWidget` | Yes | Assembly data access |
| `sceneManager` | No | Only if look needs scene references (e.g., NodeEmphasisLook) |
| `behaviors` | No | Animation configuration |

---

## Checklist

- [ ] Subclass extends `Look`
- [ ] Factory method created (static `create...` method)
- [ ] Hooks overridden as needed
- [ ] Events subscribed in `activate()`, unsubscribed in `deactivate()`
- [ ] Look + Scene registered in `main.js`
- [ ] Scene switching wired in widget/UI
- [ ] Dispose cleans up any extra resources
