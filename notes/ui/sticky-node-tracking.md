# Sticky Node Tracking

## Problem

Node ribbons in PGB are spaghetti — they curl, wander, and double back across the
viewport. The annotation track and the 3D graph are bidirectionally linked through
the cursor's position along a node, so the user often wants to *travel along* a
node to inspect it. With a naïve hit threshold (one halfWidth), the cursor falls
off the ribbon constantly: any twitch perpendicular to the curve breaks the link
and the annotation track snaps away.

## Approach: hysteresis with a single acquire/release radius pair

Classic hysteresis. Two thresholds:

- **Acquire radius (`halfWidth`)** — the threshold a non-sticky node must meet to
  register a hit. Same as the visible ribbon's half-thickness.
- **Release radius (`halfWidth * STICKY_RELEASE_MULTIPLIER`)** — once a node has
  been hit, it keeps the hit out to this wider radius.

Currently `STICKY_RELEASE_MULTIPLIER = 8`. In screen pixels that's 8× the visible
ribbon half-thickness — generous, but it feels right because the cursor doesn't
need to be visually on the ribbon to keep tracking, only "near enough that it's
obviously the same node."

The release radius is in world units but pinned to a pixel-based `halfWidth`, so
the tolerance is **invariant under zoom**: at 1× or 50× zoom you get the same
forgiveness measured in screen pixels.

## Mechanism

Two-file change.

### `src/ribbonNode.ts`

A module-scope `stickyNode` reference and a setter:

```typescript
let stickyNode: RibbonNode | null = null

export function setStickyNode(node: RibbonNode | null): void {
    stickyNode = node
}
```

In `RibbonNode.raycast()`, the per-node threshold widens when this node is the
sticky one:

```typescript
const threshold = (this === stickyNode)
    ? halfWidth * STICKY_RELEASE_MULTIPLIER
    : halfWidth

if (bestDist <= threshold) {
    intersects.push({ /* ... */, splineDistSq: bestDistSq })
}
```

Two important pieces here:

1. The expanded threshold only applies to the currently-sticky node. Every other
   node still uses the tight acquire radius.
2. The intersection now carries **`splineDistSq`** — the squared 2D distance from
   cursor to spline centerline. This is the real proximity signal and is needed
   for the tiebreak step below.

### `src/raycastService.js`

Two changes:

**Tiebreaking by spline distance.** The previous sort was `a.distance - b.distance`
(camera-Z distance). All nodes are coplanar at `NODE_Z_OFFSET` so this sort is
degenerate — order was effectively undefined. With sticky thresholds, both the
sticky node *and* a nearby non-sticky node may produce hits when the cursor is in
the overlap zone. Camera-Z can't disambiguate; spline distance can:

```javascript
intersections.sort((a, b) => {
    const aHas = a.splineDistSq !== undefined
    const bHas = b.splineDistSq !== undefined
    if (aHas && bHas) return a.splineDistSq - b.splineDistSq
    return a.distance - b.distance
})
```

This is the **anti-tunneling rule**: if the cursor is genuinely closer to a
non-sticky neighbor, that neighbor wins. Stickiness only widens the radius; it
does not bias the picker against closer alternatives.

**Sticky bookkeeping.** After each pick, the chosen object becomes sticky (or
sticky is cleared if no node was hit):

```javascript
#updateStickyFromPick(intersection) {
    const hitObject = intersection?.object
    const isNode = hitObject?.userData?.type === 'node'
    setStickyNode(isNode ? hitObject : null)
}
```

Sticky is also cleared on `clearIntersection()` (pointer-out, disable) and on
`clearRibbonRegistry()` (dataset reload).

## Decision flow

For each pointermove:

1. Run `intersectObjects()` across all nodes and edges. Each node tests with its
   own threshold — `halfWidth` if not sticky, `halfWidth * 8` if sticky.
2. Sort hits by `splineDistSq` (proximity to spline centerline).
3. Take the closest. If it's a node, mark it sticky; otherwise clear sticky.

Result:

- Cursor outside any node → no hit, sticky cleared.
- Cursor enters node A within `halfWidth` → A acquired, becomes sticky.
- Cursor drifts off A but stays within `8 × halfWidth` → A keeps the hit.
- Cursor enters node B's normal `halfWidth` while still in A's release zone →
  both produce hits; spline-proximity sort hands the hit to B.
- Cursor leaves canvas → sticky released.

## Tuning notes

- **Multiplier**: 8 was chosen empirically. 2.5–3 felt insufficient; 10+ felt
  grabby in dense regions. 8 is the sweet spot.
- **Dense node nests**: stickiness can technically cause confusion when many thin
  nodes are bundled tightly. In practice the user zooms in and the problem
  resolves itself — the release radius shrinks with `halfWidth` (in world units)
  so at high zoom only nearby pixels stay sticky.
- A more sophisticated variant — *tangent-aware* hysteresis where the release
  threshold extends parallel to the local node tangent but stays tight
  perpendicular — was considered but deferred. The simple isotropic hysteresis is
  predictable and good enough.

## Related

- [Annotation track ↔ 3D node bidirectional mapping](../architecture/annotation-track-interaction.md) — sticky tracking exists *because* this mapping is load-bearing UX.
- [Raycast refinement at high zoom](../threejs/raycast-zoom-refinement.md) — paired fix uncovered during sticky tracking work.
