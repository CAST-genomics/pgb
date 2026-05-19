# Raycast Refinement at High Zoom

## Symptom

While prototyping sticky node tracking, a separate bug surfaced: at high zoom
levels the cursor would stop registering hits on a node it was clearly hovering
over. Lower the zoom and hits returned; raise it again and they disappeared.
This was not a sticky-tracking artifact — sticky was masking the early stages of
the same bug by widening the threshold.

## Root cause: sample density doesn't scale with zoom, but `halfWidth` does

`RibbonNode.raycast()` finds the closest point on the spline via a coarse-to-fine
sampling search:

1. 32 coarse samples uniformly across parameter-t ∈ [0,1] → pick the closest
   sample → `bestT`.
2. 16 fine samples in `[bestT - 1/32, bestT + 1/32]` → refine.
3. Compare `bestDist` to `halfWidth`; hit if within.

`halfWidth` is computed in world units from a pixel-based target:

```javascript
halfWidth = pixelWidth * worldPerPixel / 2
worldPerPixel = (camera.top - camera.bottom) / (camera.zoom * container.clientHeight)
```

So as zoom increases, `halfWidth` **shrinks in world units**, keeping the visible
ribbon at a constant pixel thickness. That's correct behavior — but the fine
sampling step does not shrink. The worst-case world distance between adjacent
fine samples is approximately `totalArcLength / (32 × 16) = totalArcLength / 512`,
**independent of zoom**.

For a typical node a few hundred world units long, fine-sample spacing is on the
order of ~1 world unit. At low zoom `halfWidth` is also on that order, so the
nearest sample lies essentially on the curve and hits work fine. Zoom in enough
that `halfWidth` drops below the inter-sample step, and a problem emerges: the
true closest point on the curve lies *between* fine samples. The nearest
*sampled* point can be farther from the cursor than `halfWidth`, even when the
cursor is visually on the ribbon. The threshold check fails. Hit silently lost.

This was exacerbated by the recent reduction of `NODE_LINE_WIDTH_PIXELS` (from 8
to 4 for the PCLAI paper), which made `halfWidth` small enough at moderate zoom
that the failure became routine.

## Fix: iterative refinement until sample spacing is well below `halfWidth`

Wrap the fine pass in a loop that halves the t-window around `bestT` each
iteration, exiting when the worst-case world-space sample spacing falls below a
fraction of `halfWidth`:

```typescript
const fineSamples = 16
const RESOLUTION_TARGET = halfWidth / 4
const MAX_REFINE_ITERATIONS = 8
let windowHalf = 1 / coarseSamples

for (let iter = 0; iter < MAX_REFINE_ITERATIONS; iter++) {
    const tLo = Math.max(0, bestT - windowHalf)
    const tHi = Math.min(1, bestT + windowHalf)
    let prevX = 0, prevY = 0
    let maxSpacingSq = 0

    for (let i = 0; i <= fineSamples; i++) {
        const t = tLo + (tHi - tLo) * (i / fineSamples)
        spline.getPoint(t, _splinePoint)
        const dx = _splinePoint.x - pointerX
        const dy = _splinePoint.y - pointerY
        const distSq = dx * dx + dy * dy
        if (distSq < bestDistSq) {
            bestDistSq = distSq
            bestT = t
        }
        if (i > 0) {
            const sdx = _splinePoint.x - prevX
            const sdy = _splinePoint.y - prevY
            const sp = sdx * sdx + sdy * sdy
            if (sp > maxSpacingSq) maxSpacingSq = sp
        }
        prevX = _splinePoint.x
        prevY = _splinePoint.y
    }

    if (Math.sqrt(maxSpacingSq) < RESOLUTION_TARGET) break
    windowHalf *= 0.5
}
```

Each iteration:

1. Samples the current `[bestT - windowHalf, bestT + windowHalf]` window.
2. Updates `bestT` if any sample is closer to the cursor.
3. Tracks the **worst-case spacing** between adjacent samples (squared, to defer
   the sqrt).
4. If spacing is comfortably below `halfWidth`, exits. Otherwise halves the
   window and loops.

## Why this works

- **At normal zoom**, `maxSpacing < halfWidth / 4` is satisfied on iteration 1 —
  cost is identical to the original fine pass (17 `getPoint` calls).
- **At high zoom**, each halving doubles parametric resolution. After 3 halvings
  the effective step is `totalArcLength / 4096`; after 8 halvings it's
  `totalArcLength / 131072`. This comfortably handles any practical zoom level.
- **Cost is bounded**: max 8 iterations × 17 samples = 136 `getPoint` calls
  worst case (vs. 49 before). Per-pointermove cost is still small. The extra
  work only happens at deep zoom, where it's needed.
- **No estimation of derivatives required.** The sample spacing is measured
  directly from two consecutive samples, which automatically accounts for
  variable spline speed (Catmull-Rom curves have non-uniform parameterization).

## Why not Newton refinement?

A parabolic fit to `dist²(t)` at the three nearest fine samples would converge
in one shot. Considered but rejected:

- Iterative refinement is dead simple to read and obviously correct.
- It naturally adapts to spline shape — no derivative computation, no edge cases
  near `t = 0` or `t = 1`.
- The cost ceiling is acceptable, and the common case is free.

If raycast ever becomes a bottleneck, Newton refinement is the next optimization.

## Why not use the arc-length table?

`#getArcLengthTable` already builds 256 samples uniform in arc length. Tempting
to use it as the coarse pass — but it would still be a fixed sample density
problem (just shifted from 32 to 256). The iterative approach solves the problem
at its root: density adapts to the threshold.

## Related

- [Sticky node tracking](../ui/sticky-node-tracking.md) — surfaced this bug.
- [Ribbon mesh spike implementation](./ribbon-mesh-spike-implementation.md) — the
  custom raycast was introduced when the ribbon shader replaced Line2.
- `src/ribbonNode.ts` — the canonical implementation.
