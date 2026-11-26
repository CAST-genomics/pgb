# Creating a New Look

A step-by-step guide for adding a new Look to PGB.

**Last verified against code:** 2026-11-26.

The rules this guide serves — Looks own appearance, widgets are free event producers, a new visualization is a new Look or a new parameter on an existing one — live in `CLAUDE.md` §"Looks are the heart of the app". This note is the how-to.

---

## 0. Before you create a new Look

**Default move: extend an existing Look. Don't create a new one.**

A Look owns a visual vocabulary — emphasized / deemphasized / absent partitioning (NodeEmphasisLook), continuous frequency coloring (HeatmapLook), and so on. Widgets are event producers that drive that vocabulary. A new widget — or a new feature on an existing widget — should default to:

- Inventing a new event or event payload shape, then
- Subscribing to it in an existing Look's `activate()` and dispatching to existing material/state machinery.

The clearest example: AssemblyWidget and PCLAIWidget both drive `NodeEmphasisLook` with different events (`assembly:emphasis`, `pclaiWidget:emphasis`, `pclaiWidget:normal`). Their payload shapes differ. They never agreed on a shared event vocabulary. That asymmetry is fine — the Look's vocabulary holds them both.

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

Create a new file in `src/looks/` (`.ts` per `CLAUDE.md`). Extend the base `Look` class (`src/looks/look.ts`) and give it a static factory, matching `NodeEmphasisLook` and `HeatmapLook`:

```typescript
import * as THREE from 'three'
import Look from './look.ts'

class MyNewLook extends Look {

    constructor(name: string, config: any) {
        super(name, config)
        // Read any extra config your look needs, e.g.
        // this.raycastService = config.raycastService
    }

    static createMyNewLook(name: string, config: any): MyNewLook {
        return new MyNewLook(name, config)
    }
}

export default MyNewLook
```

## 2. Override Hooks as Needed

The base class provides working defaults for everything. Override only what your look requires:

| Hook | Purpose | When to Override |
|------|---------|-----------------|
| `getNodeRibbonMaterial(nodeName)` | Return the cached `THREE.ShaderMaterial` for a node's normal state (default: `Look.DEFAULT_NODE_COLOR` via `RibbonMaterialFactory`) | Your look's resting node appearance isn't the default gray |
| `createNodeMesh(geometry, context)` / `createEdgeMesh(geometry, context)` | Build the node ribbon / edge arrow mesh. Called through `createMesh()` by `GeometryManager` when a graph loads | Your look needs a different mesh or edge material (`getEdgeMaterial(color)`) |
| `createNodeTooltipContent(nodeObject)` | Return the HTML string for the node hover tooltip | Your look shows specialized tooltip data. `createNodeDetailsTooltip(nodeObject, { showState })` is the shared default body — `HeatmapLook` reuses it with `showState: false` |
| `activate(activeScene)` | Look becomes active for its scene | Always, if the look is driven by events (§3) |
| `deactivate()` | Look stops being active; drains subscriptions | Your look holds UI or state that must close when another look takes over (e.g. `HeatmapLook` closes its breakdown panel). Call `super.deactivate()` |
| `dispose()` | Release resources | See §6 |

There is no per-frame hook: the render loop (`App.animate()`) does not call into the Look. A look that changes appearance does so in its event handlers, by swapping or mutating materials on the meshes under the scene's `NodeMeshGroup` (see `HeatmapLook.paintNodes()`, or the base class's `updateNodeEmphasis()` / `applyEmphasisState()`).

If your look uses discrete states, reuse the base class's partition machinery — `setNodeEmphasis()`, `restoreNodes()`, and the per-state material getters — rather than writing your own. Draw order between states is handled there with `mesh.renderOrder` (emphasized nodes draw on top); there is no Z-offset mechanism.

## 3. Subscribe to Events

Override `activate()` to wire up event-driven behavior. It receives the scene being activated; pass it to `super.activate()`, which stores it in `this.activeScene`. Use the base class's typed `subscribe()` helper — all subscriptions are auto-cleaned in `deactivate()`:

```typescript
activate(activeScene: THREE.Scene): void {
    super.activate(activeScene)

    this.subscribe('myWidget:someEvent', data => {
        // React to widget interaction. `data` is typed via EventMap.
    })
}
```

The base class tracks subscriptions in `this.unsubs` and unsubscribes them en masse when `deactivate()` runs. Subclasses never need to track unsubs by hand. Non-event-bus registrations that return an unsubscribe function can be pushed onto `this.unsubs` directly — `HeatmapLook` does this with `raycastService.registerClickHandler()`.

Add new event types to `src/utils/eventMap.ts` so payloads stay typed end-to-end; `subscribe()` only accepts keys of `EventMap`.

Document the subscribed events in a comment at the top of the class, as `NodeEmphasisLook` does — they are the Look's parameter-binding interface (`CLAUDE.md` §"Looks are the heart of the app").

## 4. Register in main.js

In `src/main.js`, next to the existing two looks:

```javascript
import MyNewLook from './looks/myNewLook.ts'

// My New Look & Scene
const myNewLook = MyNewLook.createMyNewLook('myNewLook', {
    genomicService,
    geometryManager,
    assemblyWidget,
    // ... any additional config your constructor reads
})
sceneManager.createScene('myNewScene', rubinColors.rubinIvory)
sceneManager.lookManager.setLook('myNewScene', myNewLook)
```

Each scene has exactly one Look. Once registered, the scene is populated automatically on every graph load: `GeometryManager.createAllSceneNodeMeshes()` / `createAllSceneEdgeMeshes()` walk every scene and ask its Look to build the meshes. No further wiring is needed for meshes to exist.

## 5. Wire Up Look Switching

In the widget or UI component that activates your look:

```typescript
import { globals } from '../main.js'

globals.widgetService.activateLook('myNewScene')
```

Widgets go through `WidgetService.activateLook()`, not `App` directly; see `populationOnlyWidget.ts` (activates `'heatmapScene'` before publishing `superpopulation:selected`). Activate the look *before* publishing the events it should react to — a look only hears events while active.

Under the hood, `activateLook()` calls `App.setActiveScene(sceneName, true)` (the `true` pauses/resumes the animation loop around the switch), which reaches `LookManager.activateLook()`: every other look is deactivated, then yours gets `activate(scene)`. Switching to the scene that is already active is a no-op, so your look is not re-activated.

## 6. Disposal

If your look creates resources beyond the base class material cache (DOM panels, extra scene objects, services), override `dispose()`:

```typescript
dispose(): void {
    super.dispose()   // deactivates, then clears materialCache
    // Clean up any additional resources
}
```

---

## Config Properties

The base `Look` constructor reads these from the config object:

| Property | Required | Used By |
|----------|----------|---------|
| `genomicService` | Yes | Node metadata lookups (e.g. tooltip length) |
| `geometryManager` | Yes | Node name set for emphasis partitioning |
| `assemblyWidget` | Yes | Assembly data access |

Anything else is subclass-specific: read it in your own constructor. `HeatmapLook`, for example, reads `raycastService` (node clicks) and `graphContainer` (breakdown panel placement).

---

## Checklist

- [ ] Considered §0 — confirmed a new Look is warranted, not just an extension of an existing one
- [ ] Subclass extends `Look` (in a `.ts` file)
- [ ] Factory method created (static `create...` method)
- [ ] Hooks overridden as needed
- [ ] `activate(activeScene)` calls `super.activate(activeScene)`; events subscribed via base class `subscribe()` (auto-cleanup in `deactivate()`)
- [ ] New event types added to `src/utils/eventMap.ts`; subscribed events documented on the class
- [ ] Look + Scene registered in `main.js`
- [ ] Widget/UI activates it via `globals.widgetService.activateLook()`
- [ ] Dispose cleans up any extra resources
