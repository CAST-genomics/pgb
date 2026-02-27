# Look/Scene Switch Interaction Diagram

Interaction flows for switching between scene/look combinations in PGB.

---

## 1. Architecture Overview

Two scenes, two looks, one active at a time:

| Scene | Look | Activated By |
|-------|------|-------------|
| **nodeEmphasisScene** | NodeEmphasisLook | Assembly widget, PCA widget, population deselection, data load |
| **heatmapScene** | HeatmapLook | Population/superpopulation selection |

```mermaid
%%{init: {'themeVariables': {'fontSize': '18px', 'fontFamily': 'arial'}, 'flowchart': {'nodeSpacing': 60, 'rankSpacing': 50}}}%%
flowchart TB
    subgraph Widgets["Widget Layer"]
        WS[WidgetService<br/>Assembly / Population / PCA buttons]
        AW[AssemblyWidget]
        PW[PopulationOnlyWidget]
        PCAW[PCAWidget]
    end

    subgraph AppLayer["App Layer"]
        APP[App<br/>setActiveScene<br/>animate loop]
    end

    subgraph SceneLayer["Scene Management"]
        SM[SceneManager<br/>activeSceneName<br/>scenes Map]
        LM[LookManager<br/>looks Map]
    end

    subgraph Looks["Look Instances"]
        NEL[NodeEmphasisLook<br/>assembly:emphasis<br/>pcaWidget:emphasis]
        HL[HeatmapLook<br/>population:selected<br/>superpopulation:selected]
    end

    subgraph ThreeJS["Three.js"]
        NES[nodeEmphasisScene]
        HS[heatmapScene]
        REN[Renderer]
    end

    WS -->|"setActiveScene()"| APP
    PW -->|"setActiveScene()"| APP
    APP --> SM
    SM -->|"activateLook()"| LM
    LM -->|"deactivate()"| NEL
    LM -->|"deactivate()"| HL
    LM -->|"activate()"| NEL
    LM -->|"activate()"| HL
    SM --> NES
    SM --> HS
    APP -->|"render()"| REN

    AW -->|"eventBus"| NEL
    PCAW -->|"eventBus"| NEL
    PW -->|"eventBus"| HL
```

---

## 2. Scene Switch — Full Sequence

When the user triggers a scene switch (e.g., clicking a population button to go from nodeEmphasisScene to heatmapScene):

```mermaid
%%{init: {'themeVariables': {'fontSize': '16px'}}}%%
sequenceDiagram
    autonumber
    participant User
    participant Widget as Widget<br/>(e.g. PopulationOnlyWidget)
    participant APP as App
    participant SM as SceneManager
    participant LM as LookManager
    participant OldLook as NodeEmphasisLook<br/>(deactivating)
    participant NewLook as HeatmapLook<br/>(activating)
    participant EB as EventBus
    participant Renderer as Three.js Renderer

    User->>Widget: click population button

    Note over Widget,APP: Phase 1 — Initiate scene switch
    Widget->>APP: app.setActiveScene('heatmapScene', true)
    APP->>APP: stopAnimation()<br/>(setAnimationLoop null)

    Note over APP,LM: Phase 2 — SceneManager activates new scene
    APP->>SM: setActiveScene('heatmapScene', renderer, camera)
    SM->>SM: activeSceneName = 'heatmapScene'
    SM->>LM: activateLook('heatmapScene')

    Note over LM,NewLook: Phase 3 — LookManager swaps looks
    LM->>OldLook: deactivate()
    OldLook->>EB: unsubscribe('assembly:emphasis')
    OldLook->>EB: unsubscribe('assembly:normal')
    OldLook->>EB: unsubscribe('pcaWidget:emphasis')
    OldLook->>EB: unsubscribe('pcaWidget:normal')
    OldLook->>OldLook: isActive = false

    LM->>NewLook: activate()
    NewLook->>EB: subscribe('superpopulation:selected')
    NewLook->>EB: subscribe('superpopulation:deselected')
    NewLook->>EB: subscribe('population:selected')
    NewLook->>EB: subscribe('population:deselected')
    NewLook->>NewLook: isActive = true

    Note over SM,Renderer: Phase 4 — Compile and prepare scene
    SM->>Renderer: renderer.compile(heatmapScene, camera)
    SM-->>APP: return true

    Note over APP,Renderer: Phase 5 — Ensure visual feedback
    APP->>APP: check for raycast visual feedback in scene
    APP->>APP: add visual feedback if missing

    Note over APP,Renderer: Phase 6 — Resume rendering
    APP->>APP: startAnimation()<br/>(setAnimationLoop → animate)

    Note over Widget,EB: Phase 7 — Widget publishes data event
    Widget->>EB: publish('population:selected', { acronym })
    EB->>NewLook: handleSelectionEvent(data, 'population')
    NewLook->>NewLook: iterate all nodes<br/>compute frequency color<br/>update material.color
```

### Key Points

| Aspect | Detail |
|--------|--------|
| **Animation pause** | The render loop is stopped before the switch and restarted after, preventing partial-state rendering |
| **Deactivate before activate** | `LookManager.activateLook()` deactivates ALL other looks first, then activates the target |
| **Event isolation** | After the switch, only the new look's event subscriptions are live. Events for the old look's concerns are ignored |
| **Scene compilation** | `renderer.compile()` is called to pre-compile shaders, avoiding first-frame stutter |
| **Event follows switch** | The widget publishes its data event AFTER `setActiveScene()`, ensuring the new look is ready to receive it |

---

## 3. Widget Button Click — Scene Selection Logic

The WidgetService determines which scene to activate based on context:

```mermaid
%%{init: {'themeVariables': {'fontSize': '16px'}}}%%
sequenceDiagram
    autonumber
    participant User
    participant WS as WidgetService
    participant APP as App

    alt Assembly button
        User->>WS: click Assembly
        WS->>WS: hide Population & PCA widgets, reset them
        WS->>APP: setActiveScene('nodeEmphasisScene', true)
        WS->>WS: show AssemblyWidget

    else Population button (no prior selection)
        User->>WS: click Population
        WS->>WS: hide Assembly & PCA widgets, reset them
        WS->>APP: setActiveScene('nodeEmphasisScene', true)
        WS->>WS: show PopulationWidget

    else Population button (has prior selection)
        User->>WS: click Population
        WS->>WS: hide Assembly & PCA widgets, reset them
        WS->>APP: setActiveScene('heatmapScene', true)
        WS->>WS: show PopulationWidget

    else PCA button
        User->>WS: click PCA
        WS->>WS: hide Assembly & Population widgets, reset them
        WS->>APP: setActiveScene('nodeEmphasisScene', true)
        WS->>WS: show PCAWidget
    end
```

### Scene Selection Rules

| Widget Button | Condition | Scene |
|---------------|-----------|-------|
| Assembly | Always | `nodeEmphasisScene` |
| Population | No active selection | `nodeEmphasisScene` |
| Population | Has active superpopulation or population | `heatmapScene` |
| PCA | Always | `nodeEmphasisScene` |

---

## 4. Population Selection/Deselection — Scene Toggling

Within the PopulationOnlyWidget, selecting and deselecting populations toggles between scenes:

```mermaid
%%{init: {'themeVariables': {'fontSize': '16px'}}}%%
sequenceDiagram
    autonumber
    participant User
    participant PW as PopulationOnlyWidget
    participant APP as App
    participant EB as EventBus
    participant HL as HeatmapLook

    alt Select a population
        User->>PW: click population button
        PW->>PW: clearAllSelections()
        PW->>PW: selectedPopulation = population
        PW->>APP: setActiveScene('heatmapScene', true)
        PW->>EB: publish('population:selected', { acronym })
        EB->>HL: handleSelectionEvent(data, 'population')
        HL->>HL: update all node material colors

    else Deselect current population
        User->>PW: click same population button again
        PW->>PW: selectedPopulation = null
        PW->>APP: setActiveScene('nodeEmphasisScene', true)
        PW->>EB: publish('population:deselected', { ... })
        Note right of EB: NodeEmphasisLook is now active<br/>but doesn't listen to this event.<br/>Graph returns to default appearance.
    end
```

---

## 5. Data Load — Initial Scene Setup

When new data is loaded, the system always starts with `nodeEmphasisScene`:

```mermaid
%%{init: {'themeVariables': {'fontSize': '16px'}}}%%
sequenceDiagram
    autonumber
    participant APP as App
    participant SM as SceneManager
    participant LM as LookManager
    participant GM as GeometryManager
    participant NEL as NodeEmphasisLook
    participant HL as HeatmapLook

    APP->>APP: stopAnimation()
    APP->>APP: clearCurrentData()
    Note over APP,SM: Clears all material caches,<br/>disposes scene objects,<br/>activeSceneName = null

    APP->>APP: pangenomeService.loadData(json)
    APP->>APP: genomicService.initialize(json)
    APP->>APP: geometryManager.createGeometry(json)

    APP->>SM: setActiveScene('nodeEmphasisScene')
    SM->>LM: activateLook('nodeEmphasisScene')
    LM->>NEL: activate()
    LM->>HL: deactivate()

    Note over APP,HL: Create meshes for ALL scenes using each scene's look
    APP->>GM: createAllSceneNodeMeshes(scenes, lookManager)
    Note right of GM: For each scene:<br/>look = lookManager.getLook(sceneName)<br/>mesh = look.createNodeMesh(geometry)<br/>scene.add(mesh)
    APP->>GM: createAllSceneEdgeMeshes(scenes, lookManager)

    APP->>APP: updateViewToFitScene(scene, camera, controls)
    APP->>APP: startAnimation()
```

### Key Point

Meshes are created for **all** scenes at data load time, not on-demand. Each scene gets its own set of node and edge meshes, created using that scene's Look (which determines materials and colors). This is why switching scenes is fast — both scenes are pre-populated.

---

## 6. Component Responsibilities

| Component | Responsibility |
|-----------|---------------|
| **WidgetService** | Button UI, determines which scene to activate, shows/hides widget panels |
| **PopulationOnlyWidget** | Population list UI, publishes selection events, calls `setActiveScene()` directly |
| **AssemblyWidget** | Assembly list UI, publishes emphasis events (does not switch scenes) |
| **PCAWidget** | PCA coordinate list UI, publishes emphasis events (does not switch scenes) |
| **App** | Owns renderer and animation loop, `setActiveScene()` pauses/resumes animation |
| **SceneManager** | Manages scene map, delegates to LookManager, compiles scenes |
| **LookManager** | Activates/deactivates looks, enforces one-active-at-a-time |
| **Look subclasses** | Subscribe to events, manage materials, define visual behavior |
