# Strategic TypeScript Adoption in PGB

**Status:** P1 (typed event bus) done, with a small gap; P3 (Look system) partial — converted to `.ts` but `Look` is not abstract; P2 (string-literal unions) and P4 (spine return types) open. Verified against `src/` 2026-11-26.

## Background

PGB started as a JavaScript codebase. In April 2026 the dataset ingestion layer (`datasetModel.ts`, `datasetParser.ts`, `datasetValidator.ts`) was converted to TypeScript as a first incremental step. Since then the event bus, the Look system, the main widgets (`assemblyWidget`, `pclaiWidget`, `populationWidget`, `populationOnlyWidget`, `printPanel`), the annotation track and the whole of `src/tubemap/` have been written or converted in `.ts`. `tsconfig.json` checks only `src/**/*.ts` (`checkJs: false`), so the remaining `.js` files get no type checking; `npm run typecheck` is the gate.

The governing principle — *use TypeScript at contract boundaries*, and write all new files in TypeScript — is stated in [`CLAUDE.md`](../../CLAUDE.md) §New files in TypeScript. A contract boundary is where one part of the system hands data to another under an implicit agreement about shape and meaning. In PGB those agreements were carried by comments, JSDoc, or nothing at all; TypeScript makes them compiler-enforced.

This document does the part the rule can't: it names *which* boundaries are worth converting, in priority order, and records which are done.

## Remaining targets at a glance

| Priority | Target | State | What's left |
|---|---|---|---|
| 1 | Typed event bus | Done | Add `locus:token` to `EventMap`; JS publishers/subscribers are unchecked until converted |
| 2 | String-literal unions for magic strings | Open | Spine option/event-type unions, `GeometryContext` discriminated union |
| 3 | Abstract `Look` base class | Partial | Make `Look` abstract with required lifecycle hooks; type `createMesh` `context` |
| 4 | Spine-feature return types | Open | `SpineResult` / `SpineEvent` interfaces for `getSpineFeatures()` |

---

## Priority 1: Typed Event Bus — DONE

`src/utils/eventBus.ts` is generic over the `EventMap` registry in `src/utils/eventMap.ts`: `publish<K extends keyof EventMap>(event: K, data: EventMap[K])` and likewise `subscribe`. In `.ts` files a wrong event name or payload shape is a compile error, and adding an event means adding it to `EventMap` — the registry is the documentation of the event set.

Remaining gaps:

- **`locus:token` is missing from `EventMap`.** It is published in `src/locusInput.js` and subscribed in `src/main.js` and `src/widgets/mountPclaiChart.js`; because those are `.js` and `checkJs` is off, nothing flags it. Add `'locus:token': { token: string | null }`.
- **JS callers are unchecked.** `main.js`, `locusInput.js`, `widgets/pclaiChartController.js`, `widgets/mountPclaiChart.js` and `widgets/pclaiCoordinateService.js` still call the bus from `.js`. Per the implementation strategy below, these get checked when they are next converted, not in a dedicated pass.

The unsubscription bug this priority was expected to surface (unsubscribe handles in `nodeEmphasisLook` checked but never assigned) is gone: `Look` now has a protected `subscribe()` that records every unsubscribe and releases them all in `deactivate()`.

---

## Priority 2: String Literal Unions for Magic Strings — OPEN

### The Problem

Several services use string constants as informal enums, documented only in comments:

**`src/pangenomeService.js` — `getSpineFeatures()` and walk options** (documented only in comments/JSDoc; set by the caller in `src/genomicService.js`):
```javascript
includeOffSpineComponents = "none"     // "none" | "summary" | "full"
startPolicy: "preferArrowEndpoint"     // "preferEndpoint" | "forceFromNode" | "preferArrowEndpoint"
directionPolicy: "edgeFlow"            // "edgeFlow" | "asIs"
```

**`src/pangenomeService.js` — spine event types:**
```javascript
type: "braid"  // "braid" | "pill" | "simple_bubble" | "dangling"
```

**`src/geometryFactory.js` — geometry context types:**
```javascript
{ type: 'node', ... }  // vs { type: 'edge', ... }
```
`src/looks/look.ts` consumes these as `context: any` in `createMesh()`, `createNodeMesh()` and `createEdgeMesh()`, branching on `context.type` with no narrowing.

(The `nodeColor` overloading in `getNodeRibbonEmphasisMaterial()`, once listed here, is now typed: `look.ts` exports `type NodeColor = THREE.ColorRepresentation | Map<string, THREE.Color>`.)

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

None of these types exist yet in `src/` (no `OffSpineOption`, `StartPolicy`, `SpineEventType` or `GeometryContext`). This can be done incrementally: the types can live in standalone `.ts` files (e.g. `spineTypes.ts`, `geometryTypes.ts`) and be imported where needed. `look.ts` can use `GeometryContext` immediately. The service files can stay `.js` at first, with JSDoc `@type` annotations referencing the types — but with `checkJs: false` that gives IDE hints only, not compiler enforcement; enforcement arrives when the producer is converted.

---

## Priority 3: Abstract Classes for the Look System — PARTIAL

**Done.** `src/looks/look.ts`, `nodeEmphasisLook.ts` and `heatmapLook.ts` are TypeScript. The base class owns subscription cleanup: subclasses call the protected `subscribe()` and `deactivate()` releases every handle, so the activate/deactivate subscription pairing no longer depends on each subclass. (`src/looks/lookManager.js` is still `.js`.)

**Remaining.** `Look` is a plain `class Look` (`look.ts` line 16), not `abstract`. `activate(activeScene)` and `deactivate()` are overridable methods, so a subclass that forgets its activation logic, or overrides `deactivate()` without calling `super.deactivate()` (which would leak its subscriptions), still compiles. The target is the template-method shape:

```typescript
abstract class Look {
    // Subclasses MUST implement these — compiler error if missing
    protected abstract onActivate(): void;
    protected abstract onDeactivate(): void;

    // Base class controls the lifecycle — calls subclass hooks
    activate(activeScene: THREE.Scene): void {
        this.isActive = true;
        this.activeScene = activeScene;
        this.onActivate();
    }

    deactivate(): void {
        this.onDeactivate();
        for (const unsub of this.unsubs) unsub();
        this.unsubs.length = 0;
        this.isActive = false;
    }
}
```

With this, a new Look that forgets `onActivate()` is a compile error and the base class guarantees cleanup runs. Typing `createMesh()`'s `context` with `GeometryContext` (Priority 2) belongs in the same change. The Look system is well isolated, so this remains a self-contained change.

---

## Priority 4: Service Return Types (Spine Features) — OPEN

### The Problem

`getSpineFeatures()` in `src/pangenomeService.js` (still `.js`) returns a deeply nested object with spine data, events, off-spine components, and an abort flag. The structure is complex:

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

`src/genomicService.js` calls it and stores the result as `spineFeatures` in its `assemblyWalkMap`; `src/geometryFactory.js` and `src/widgets/assemblyWidget.ts` read `spineFeatures.spine.nodes` from there. Each consumer reverse-engineers the structure from usage; there is no single place that documents the shape, and `assemblyWidget.ts` reads it untyped despite being TypeScript.

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

No `SpineResult` or `SpineEvent` type exists in `src/` yet. The interfaces would serve as both compiler-enforced contracts and self-documenting references. When a consumer needs to know "what fields does a spine event have?", the answer is in `SpineEvent` — not scattered across producer and consumer code.

---

## What the Four Targets Have in Common

They are all **contracts between parts of the system**:

| Target | Contract Between | Enforcement Today |
|--------|-----------------|-------------------|
| Event bus | Publishers ↔ subscribers | `EventMap` in `.ts` files; none in `.js` callers |
| Magic strings | Callers ↔ services that interpret string params | Comments only |
| Look system | Base class ↔ concrete subclasses | Types on methods; lifecycle by convention |
| Spine features | `pangenomeService` ↔ `genomicService` / `geometryFactory` / `assemblyWidget` | Reverse engineering |

The dataset ingestion layer was the contract between **external data** and the app. These four are the contracts **within** the app. The same principle applies: TypeScript is most valuable where it enforces agreements between parts of the system that would otherwise drift apart silently.

---

## Implementation Strategy

The same incremental approach used for the dataset layer works here:

1. **One target at a time.** The event bus went first; next are the abstract `Look`, then the spine types (P2's spine unions and P4 are naturally one change). Don't convert everything at once.
2. **Types in `.ts`, logic can stay in `.js` temporarily.** You can define interfaces in a `.ts` file and reference them from `.js` files via JSDoc `@type {import('./eventMap.ts').EventMap}`. With `checkJs: false` this gives IDE support only; the compiler checks a file once it is `.ts`.
3. **`npm run typecheck` (`tsc --noEmit`) is your safety net.** Vite handles the build; TypeScript only checks types. No build process changes needed.
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
