/**
 * The plane the viewer measures in: three shapes, a clamp, and where a thing beside the
 * cursor goes. Pure, DOM-free.
 *
 * Content space is the tube map's own coordinate system (SVG viewBox units), origin at
 * the map's top-left corner and y down. Everything else — world space, css pixels,
 * device pixels — is a conversion away from it, and every conversion lives with the
 * thing that owns the camera (`bandCamera.ts`) rather than here.
 *
 * This was `viewportTransform.ts` until 2026-08-16, and it was much larger: it owned
 * `{ x, y, scale }` and the pan, zoom, fit and clamp arithmetic driving the SVG surface's
 * CSS transform, including a hand-written copy of `pgb/src/mapControlsFactory.js`'s wheel
 * curve. #40 retired that surface, and `MapControls` had already replaced the arithmetic
 * — see ADR `0001`, which records both. What is left is the vocabulary the rest of the
 * viewer still speaks in, which is why the file is still here under a name that fits it.
 */

export interface Point {
    x: number
    y: number
}

export interface Size {
    width: number
    height: number
}

export interface Rect {
    x: number
    y: number
    width: number
    height: number
}

export function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max)
}

/**
 * Where one edge of a thing offset from the cursor lands, on one axis, so that the thing
 * stays inside the surface: `offset` past `at` when there is room, and `offset` before it
 * when there is not.
 *
 * **Flipped rather than clamped**, which is the whole reason this is not `clamp`. Pinned
 * against the far edge, a tooltip or a label would sit under the pointer and hide the very
 * thing it is describing; put on the other side of the cursor it stays readable and the
 * cursor stays clear. Only if it does not fit on either side does it pin, to zero.
 *
 * Per axis, so a caller flips on both (`segmentOverlay`) or on one and clamps on the other
 * (`strandLabel`, which is only ever above the cursor). Both of those follow the same
 * cursor, and having them disagree about this arithmetic is how two labels end up stacked
 * on one another at an edge.
 */
export function beside(at: number, extent: number, within: number, offset: number): number {
    return at + offset + extent > within
        ? Math.max(0, at - offset - extent)
        : at + offset
}
