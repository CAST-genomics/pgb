# Strategic TypeScript Adoption in PGB

## Background

PGB is a JavaScript codebase. In April 2026 we converted the dataset ingestion layer (`datasetModel.ts`, `datasetParser.ts`, `datasetValidator.ts`) to TypeScript as a first incremental step. This document identifies the next high-value targets — places where TypeScript's type system would catch real bugs and enforce contracts that JavaScript cannot.

The principle: **use TypeScript at contract boundaries** — where one part of the system hands data to another with an implicit agreement about shape and meaning. These agreements are currently documented in comments, JSDoc, or not at all. TypeScript makes them compiler-enforced.

---

## Priority 1: Typed Event Bus

### The Problem

`src/utils/eventBus.js` is a simple pub/sub. Publishers call `eventBus.publish('eventName', data)` and subscribers call `eventBus.subscribe('eventName', callback)`. Neither the event name nor the payload shape is checked — they're arbitrary strings and objects.

The codebase has 12+ distinct event types, each with a different payload shape:

| Event | Payload | Published From |
|-------|---------|---------------|
| `assembly:emphasis` | `{ assembly: {name}, nodeSet: Set, deemphasisColor }` | assemblyWidget.js |
| `assembly:normal` | `{ nodeSet: Set }` | assemblyWidget.js |
| `pclaiWidget:emphasis` | `{ assembly: {name}, nodeSet: Set, absentNodeSet: Set, deemphasisColor }` | pclaiWidget.js |
| `pclaiWidget:normal` | `{ nodeSet: Set }` | pclaiWidget.js |
| `pclaiWidget:absence` | `{ absentNodeSet: Set }` | pclaiWidget.js |
| `population:selected` | `{ acronym: string }` | populationWidget.js |
| `population:deselected` | `{ population, acronym }` | populationWidget.js |
| `superpopulation:selected` | `{ acronym: string }` | populationWidget.js |
| `superpopulation:deselected` | `{ superpopulation, acronym }` | populationWidget.js |
| `lineIntersection` | `{ t, nodeName, nodeLine: THREE.Object3D }` | app.js |
| `clearIntersection` | `{}` | app.js |
| `datasetLoaded` | `{ dataset: DatasetModel }` | app.js |

Subscribers destructure these payloads with no compile-time verification. If a publisher changes the payload shape, every subscriber silently receives the wrong data.

### The TypeScript Feature: Generic Mapped Types

TypeScript can tie event names to payload shapes via a single registry interface:

```typescript
// eventMap.ts — single source of truth for all events
interface EventMap {
    'assembly:emphasis':       { assembly: { name: string }; nodeSet: Set<string>; deemphasisColor: string };
    'assembly:normal':         { nodeSet: Set<string> };
    'pclaiWidget:emphasis':      { assembly: { name: string }; nodeSet: Set<string>; absentNodeSet: Set<string>; deemphasisColor: string };
    'pclaiWidget:normal':        { nodeSet: Set<string> };
    'pclaiWidget:absence':       { absentNodeSet: Set<string> };
    'population:selected':     { acronym: string };
    'population:deselected':   { population: object; acronym: string };
    'superpopulation:selected':   { acronym: string };
    'superpopulation:deselected': { superpopulation: object; acronym: string };
    'lineIntersection':        { t: number; nodeName: string; nodeLine: THREE.Object3D };
    'clearIntersection':       Record<string, never>;
    'datasetLoaded':           { dataset: DatasetModel };
}
```

The bus itself becomes generic — the compiler infers the payload type from the event name:

```typescript
class EventBus {
    publish<K extends keyof EventMap>(event: K, data: EventMap[K]): void;
    subscribe<K extends keyof EventMap>(event: K, cb: (data: EventMap[K]) => void): () => void;
}
```

Now:
- Publishing `'assembly:emphasis'` without a `nodeSet` is a compile error
- A subscriber destructuring `{ acronym }` from an `assembly:emphasis` event is a compile error
- Adding a new event requires adding it to `EventMap` — the registry is the documentation

### Known Bugs This Would Surface

The codebase exploration found what appear to be subscription/unsubscription mismatches in `nodeEmphasisLook.js`. Unsubscribe handles (`deemphasizePCLAIChartUnsub`, `restorePCLAIChartUnsub`) are checked in `deactivate()` but never assigned in `activate()`. A typed event bus would make this class of bug structurally harder to introduce.

### Scope of Change

- Convert `eventBus.js` to `eventBus.ts`
- Create `eventMap.ts` with the `EventMap` interface
- Every publisher and subscriber file would need import updates, but the logic stays identical — only the types are added

---

## Priority 2: String Literal Unions for Magic Strings

### The Problem

Several services use string constants as informal enums, documented only in comments:

**pangenomeService.js — `getSpineFeatures()` options:**
```javascript
includeOffSpineComponents = "none"     // "none" | "summary" | "full"
startPolicy: "preferArrowEndpoint"     // "preferEndpoint" | "forceFromNode" | "preferArrowEndpoint"
directionPolicy: "edgeFlow"            // "edgeFlow" | "asIs"
```

**pangenomeService.js — spine event types:**
```javascript
type: "braid"  // "braid" | "pill" | "simple_bubble" | "dangling"
```

**geometryFactory.js — cache key prefixes and context types:**
```javascript
{ type: 'node', ... }  // vs { type: 'edge', ... }
```

**look.js — `getNodeRibbonEmphasisMaterial()` parameter overloading:**
```javascript
// nodeColor can be THREE.Color OR Map<string, THREE.Color> — no hint which
```

A typo like `"summry"` or `"perferEndpoint"` compiles fine in JavaScript and fails silently at runtime.

### The TypeScript Feature: String Literal Types and Discriminated Unions

```typescript
// String literal union — compiler rejects typos
type OffSpineOption = 'none' | 'summary' | 'full';
type StartPolicy = 'preferEndpoint' | 'forceFromNode' | 'preferArrowEndpoint';
type DirectionPolicy = 'edgeFlow' | 'asIs';
type SpineEventType = 'braid' | 'pill' | 'simple_bubble' | 'dangling';

// Options interface — documents AND enforces the 10-parameter bag
interface SpineAssessmentOptions {
    includeAdjacent: boolean;
    allowMidSpineReentry: boolean;
    includeDangling: boolean;
    includeOffSpineComponents: OffSpineOption;
    maxPathsPerEvent: number;
    maxRegionHops: number;
    maxRegionNodes: number;
    maxRegionEdges: number;
    operationBudget: number;
    locusStartBp: number;
}

// Discriminated union — compiler narrows the type based on a tag field
type GeometryContext =
    | { type: 'node'; nodeName: string; spline: THREE.CatmullRomCurve3 }
    | { type: 'edge'; startNode: string; endNode: string; edgeKey: string };
```

With discriminated unions, the compiler knows that inside `if (context.type === 'node')`, the object has a `nodeName` property. Inside the `'edge'` branch, it has `startNode` and `endNode`. No runtime checks needed — TypeScript narrows the type statically.

### Scope of Change

This could be done incrementally. The types could live in standalone `.ts` files (e.g., `spineTypes.ts`, `geometryTypes.ts`) and be imported where needed. The service files themselves could remain `.js` initially, with JSDoc `@type` annotations referencing the TypeScript types for IDE support.

---

## Priority 3: Abstract Classes for the Look System

### The Problem

The Look system (`src/looks/look.js`) uses a base class with methods that subclasses are expected to override: `activate()`, `deactivate()`, and optionally `getZOffset()`, `createNodeTooltipContent()`, etc. But there's no enforcement — a subclass can forget to implement a required method, and the failure shows up only at runtime.

Current concrete looks: `NodeEmphasisLook`, `HeatmapLook`.

The contract also requires that:
- `activate()` subscribes to events, `deactivate()` unsubscribes from the same events
- Subclasses call `super.activate()` / `super.deactivate()`
- Each look manages its own materials and emphasis state

None of this is enforced.

### The TypeScript Feature: Abstract Classes

```typescript
abstract class Look {
    // Subclasses MUST implement these — compiler error if missing
    protected abstract onActivate(): void;
    protected abstract onDeactivate(): void;

    // Base class controls the lifecycle — calls subclass hooks
    activate(): void {
        this.isActive = true;
        this.onActivate();
    }

    deactivate(): void {
        this.onDeactivate();
        this.isActive = false;
    }

    // Optional overrides — subclasses CAN override but don't have to
    getZOffset(_objectId: string): number { return 0; }
    createNodeTooltipContent(_nodeObject: THREE.Object3D): HTMLElement | null { return null; }

    // Concrete shared methods remain as-is
    createMesh(geometry: THREE.BufferGeometry, context: GeometryContext): void { ... }
}
```

With this pattern:
- A new Look subclass that forgets `onActivate()` is a compile error
- The base class guarantees `super` is called (the template method pattern)
- Optional overrides have default implementations, so subclasses only override what they need

### Scope of Change

- Convert `look.js` to `look.ts` with the abstract base class
- Convert `nodeEmphasisLook.js` and `heatmapLook.js` to `.ts`
- This is a relatively self-contained change — the Look system is well-isolated from the rest of the codebase

---

## Priority 4: Service Return Types (Spine Features)

### The Problem

`pangenomeService.getSpineFeatures()` returns a deeply nested object with spine data, events, off-spine components, and an abort flag. The structure is complex:

```javascript
return {
    spine: { nodes: [...], edges: [...], assemblyKey, locusStartBp, locusEndBp },
    events: [{
        id, type,
        anchors: { leftId, rightId, spanStart, spanEnd, refLenBp, orientation },
        region: { nodes, edges, truncated },
        paths: [...],
        stats: { nPaths, minAltLenBp, maxAltLenBp, truncatedPaths, removedSpineLeg },
        relations: { parentId, childrenIds, overlapGroup, sameAnchorGroup },
    }],
    offSpine: [...],
    aborted: boolean,
}
```

Consumers (`annotationRenderService`, `genomicService`, etc.) must reverse-engineer this structure from usage patterns. There's no single place that documents the shape.

### The TypeScript Solution

Define the return type as a set of interfaces:

```typescript
interface SpineResult {
    spine: Spine;
    events: SpineEvent[];
    offSpine: OffSpineComponent[];
    aborted: boolean;
}

interface SpineEvent {
    id: string;
    type: SpineEventType;
    anchors: EventAnchors;
    region: EventRegion;
    paths: Path[];
    stats: EventStats;
    relations: EventRelations;
}
```

The interfaces serve as both compiler-enforced contracts and self-documenting references. When a consumer needs to know "what fields does a spine event have?", the answer is in `SpineEvent` — not scattered across producer and consumer code.

---

## What These Four Targets Have in Common

They are all **contracts between parts of the system**:

| Target | Contract Between | Current Enforcement |
|--------|-----------------|-------------------|
| Event bus | Widgets/Looks that publish ↔ Looks/Services that subscribe | None — arbitrary strings and objects |
| Magic strings | Callers ↔ Services that interpret string params | Comments only |
| Look system | Base class ↔ Concrete subclasses | Convention only |
| Spine features | pangenomeService ↔ annotation/genomic consumers | Reverse engineering |

The dataset ingestion layer (already converted) was the contract between **external data** and the app. These four are the contracts **within** the app. The same principle applies: TypeScript is most valuable where it enforces agreements between parts of the system that would otherwise drift apart silently.

---

## Implementation Strategy

The same incremental approach used for the dataset layer works here:

1. **One target at a time.** Convert the event bus, verify, commit. Then the Look system. Then spine types. Don't convert everything at once.
2. **Types in `.ts`, logic can stay in `.js` temporarily.** You can define interfaces in a `.ts` file and reference them from `.js` files via JSDoc `@type {import('./eventMap.ts').EventMap}`. This lets you get IDE support before fully converting a file.
3. **`tsc --noEmit` is your safety net.** Vite handles the build; TypeScript only checks types. No build process changes needed.
4. **Convert consumers lazily.** When you next touch a file that subscribes to events, update its imports. No need to convert all consumers in one pass.

---

## Appendix: TypeScript Features Reference

For context, here are the TypeScript features referenced in this document and what they do:

- **Interface** — Defines the shape of an object. Checked at compile time, erased at runtime. Zero overhead.
- **String literal type** (`'none' | 'summary' | 'full'`) — A type that only accepts specific string values. Typos are compile errors.
- **Generic mapped type** (`EventMap[K]`) — A type that varies based on another type parameter. Used to tie event names to payload shapes.
- **Discriminated union** (`{ type: 'node'; ... } | { type: 'edge'; ... }`) — A union where a tag field determines which variant you're working with. TypeScript narrows the type inside `if`/`switch` blocks.
- **Abstract class** — A class that cannot be instantiated directly. Subclasses must implement all `abstract` methods or the compiler rejects them.
- **`keyof`** — Extracts the keys of an interface as a union type. `keyof EventMap` = `'assembly:emphasis' | 'assembly:normal' | ...`.
