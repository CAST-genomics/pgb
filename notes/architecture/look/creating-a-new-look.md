# Creating a New Look

A step-by-step guide for adding a new Look to PGB.

---

## 0. Before you create a new Look

**Default move: extend an existing Look. Don't create a new one.**

A Look owns a visual vocabulary — emphasized / deemphasized / absent partitioning (NodeEmphasisLook), continuous frequency coloring (HeatmapLook), and so on. Widgets are event producers that drive that vocabulary. A new widget — or a new feature on an existing widget — should default to:

- Inventing a new event or event payload shape, then
- Subscribing to it in an existing Look's `activate()` and dispatching to existing material/state machinery.

The clearest example: AssemblyWidget and PCLAIWidget both drive `NodeEmphasisLook` with different events (`assembly:emphasis`, `pclaiWidget:emphasis`, `pclaiWidget:absence`). Their payload shapes differ. They never agreed on a shared event vocabulary. That asymmetry is fine — the Look's vocabulary holds them both.

### When a new Look IS warranted

Create a new Look only when the *visual vocabulary itself* is new:

- The graph needs to express something the existing Looks can't express by partitioning nodes into discrete states (e.g., HeatmapLook's continuous color mapping is qualitatively different from NodeEmphasisLook's discrete partition).
- The rendering strategy is fundamentally different (different materials, different per-frame behavior, different tooltips).
- Stretching an existing Look would push its state machine past the point a reader can hold in their head.

### When extension is the right call

- You want to add a new visual state alongside emphasized / deemphasized / absent (e.g., issue #73's `'off-walk'`).
- A new widget wants to drive emphasis/absence with its own events and payload.
- You want per-widget palette overrides (already supported via the `deemphasisColor` event payload field).

See [Look System Architecture §"Looks own visual semantics; widgets are event producers"](./look-system-architecture.md) for the underlying principle.

---

## 1. Create the Look Subclass

Create a new file in `src/looks/` (`.ts` per project convention). Extend the base `Look` class:

```typescript
import Look from './look.ts'

class MyNewLook extends Look {

    constructor(name: string, config: any) {
        super(name, config)
        // Store any additional config your look needs
    }

    static createMyNewLook(name: string, config: any): MyNewLook {
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

Override `activate()` to wire up event-driven behavior. Use the base class's typed `subscribe()` helper — all subscriptions are auto-cleaned in `deactivate()`:

```typescript
activate(): void {
    super.activate()

    this.subscribe('myWidget:someEvent', data => {
        // React to widget interaction. `data` is typed via EventMap.
    })
}
```

The base class tracks subscriptions in `this.unsubs` and unsubscribes them en masse when `deactivate()` runs. Subclasses never need to track unsubs by hand. Add new event types to `src/utils/eventMap.ts` so payloads stay typed end-to-end.

## 4. Register in main.js

Follow the existing pattern:

```typescript
import MyNewLook from './looks/myNewLook.ts'

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

```typescript
dispose(): void {
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

- [ ] Considered §0 — confirmed a new Look is warranted, not just an extension of an existing one
- [ ] Subclass extends `Look` (in a `.ts` file)
- [ ] Factory method created (static `create...` method)
- [ ] Hooks overridden as needed
- [ ] Events subscribed in `activate()` via base class `subscribe()` (auto-cleanup in `deactivate()`)
- [ ] New event types added to `src/utils/eventMap.ts`
- [ ] Look + Scene registered in `main.js`
- [ ] Scene switching wired in widget/UI
- [ ] Dispose cleans up any extra resources
