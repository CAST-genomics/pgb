# Look System — Future Issues

Issues identified during code review that are not urgent but should be addressed when the opportunity arises.

---

## 1. Vestigial Edge Arrow Animation

**Files**: `nodeEmphasisLook.js`, `main.js`

The factory method `createNodeEmphasisLook()` creates the look with edge arrow animation `enabled: true`, but `main.js` immediately calls `setAnimationEnabled(false)`. The flowing-arrow concept for visualizing edge direction is not something we want to retain going forward. The animation infrastructure in `NodeEmphasisLook` (`updateBehavior`, `#updateEdgeAnimation`, `edgeArrowAnimationState`) can be removed in a future cleanup pass.

---

## 2. `emphasisStates` Map — Push Down or Generalize?

**File**: `look.js` (base class), `nodeEmphasisLook.js`

The `emphasisStates` Map is maintained in the base `Look` class but only read by `NodeEmphasisLook.getZOffset()`. The base class sets values in this map (via `setNodeAndEdgeEmphasis` and `restoreLinesandEdgesViaZOffset`) but never reads them. Should this be:
- Pushed down into `NodeEmphasisLook` (if only that look needs state-based Z-offsets)?
- Or kept in the base class with a clearer contract for when/why subclasses would use it?

---

## 3. Polymorphic `nodeColor` Parameter

**File**: `look.js` — `getNodeEmphasisMaterial()`

The `nodeColor` parameter accepts either a single `THREE.Color` or a `Map<nodeName, THREE.Color>`. This dual-type is handled with a runtime `instanceof Map` check. Consider whether:
- Always passing a Map (with a single-entry map for the single-color case) would simplify the interface
- Or if the current flexibility is worth the type ambiguity

---

## 4. Event Naming Inconsistency

Across the codebase, different naming conventions are used for look-related events:

| Source | Emphasis Event | Restore Event |
|--------|---------------|---------------|
| Assembly | `assembly:emphasis` | `assembly:normal` |
| Population | `superpopulation:selected` / `population:selected` | `superpopulation:deselected` / `population:deselected` |
| PCA Widget | `pcaWidget:emphasis` | `pcaWidget:normal` |

Consider standardizing to a consistent verb pattern (e.g., all use `emphasis/normal` or all use `selected/deselected`).

---

## 5. TODO: Normal Edge Material Fallback

**File**: `look.js` (~line 476)

There is a TODO comment about handling the 'normal' edge material state. Currently the code falls back to a hardcoded 'steel' color rather than resolving the proper edge color. This should be revisited to determine the correct behavior for restoring edges to their normal appearance.

---

## 6. `sceneManager` Config Inconsistency

**Files**: `main.js`, `nodeEmphasisLook.js`, `heatmapLook.js`

`NodeEmphasisLook` requires `sceneManager` in its config object. `HeatmapLook` does not. There is no documentation or validation indicating which config properties are required vs. optional for each Look subclass. A config schema or at minimum a documented contract would prevent confusion when creating new looks.
