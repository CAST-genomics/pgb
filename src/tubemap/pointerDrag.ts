/**
 * Pointer drag — capture, the pointer-id filter, and teardown, in one place.
 *
 * Two things here drag: the map (pan) and the navigator rect. Both need the same
 * sharp edges got right — a release outside the window, a gesture the browser
 * cancels, a capture that would otherwise outlive its element — and a fix applied
 * to one copy and not the other produces a viewer where one drag survives a lost
 * pointer and the other doesn't.
 *
 * It knows about pointers and nothing else: what a drag *means* — screen deltas,
 * grab offsets, which class to wear — stays with the caller, which is the half that
 * actually differs between the two.
 *
 * Three things end a drag, and the last two exist because the first can be missed: the
 * `pointerup` (or `pointercancel`), losing the capture, and a `pointermove` arriving with no
 * button pressed. A drag left in flight is worse than one that ends early — it refuses every
 * later press, so the affordance is dead for the rest of the session.
 */

export interface PointerDragOptions {
    /** Whether this press starts a drag at all — the button test, and any mode that forbids one. */
    accepts(event: PointerEvent): boolean
    onStart(event: PointerEvent): void
    onMove(event: PointerEvent): void
    /** Runs however the drag ends: released, cancelled by the browser, or dropped by `cancel`. */
    onEnd(): void
}

export interface PointerDragHandle {
    /** True while a drag is in flight — callers suppress hover work against it. */
    active(): boolean
    /** Drop a drag in flight. `Shift` yields the map to feeler mode through this. */
    cancel(): void
    destroy(): void
}

export function createPointerDrag(element: HTMLElement, options: PointerDragOptions): PointerDragHandle {

    let pointer: number | null = null

    function release(): void {
        if (null === pointer) {
            return
        }

        // Capture is released before the caller is told, so a caller that starts a
        // fresh drag from `onEnd` cannot collide with the one just finishing.
        if (element.hasPointerCapture(pointer)) {
            element.releasePointerCapture(pointer)
        }

        pointer = null
        options.onEnd()
    }

    function onPointerDown(event: PointerEvent): void {
        if (null !== pointer || false === options.accepts(event)) {
            return
        }

        pointer = event.pointerId

        // Capture so a drag that leaves the element — or the window — keeps
        // reporting, and still ends cleanly wherever it is let go.
        element.setPointerCapture(event.pointerId)
        options.onStart(event)
    }

    function onPointerMove(event: PointerEvent): void {
        if (event.pointerId !== pointer) {
            return
        }

        // A move with nothing pressed is not part of a drag, whatever this thinks. If a
        // `pointerup` was ever missed — a capture lost to a fullscreen change, a button
        // released where no event reached us — the drag would otherwise stay in flight
        // forever: hovering near the element would keep dragging it, and every later press
        // would be refused because one is already running. This is what makes that state
        // unreachable rather than merely unlikely.
        if (0 === event.buttons) {
            release()
            return
        }

        options.onMove(event)
    }

    /**
     * Capture went somewhere else, or the browser dropped it.
     *
     * Fired whenever the element stops being the capture target, including for reasons this
     * code did not ask for. Without this the drag freezes — no more moves arrive — while
     * still counting as in flight, which is the same dead end the `buttons` test above
     * closes from the other side.
     */
    function onLostCapture(event: PointerEvent): void {
        if (event.pointerId === pointer) {
            pointer = null
            options.onEnd()
        }
    }

    function onPointerUp(event: PointerEvent): void {
        if (event.pointerId === pointer) {
            release()
        }
    }

    element.addEventListener('pointerdown', onPointerDown)
    element.addEventListener('pointermove', onPointerMove)
    element.addEventListener('pointerup', onPointerUp)
    element.addEventListener('pointercancel', onPointerUp)
    element.addEventListener('lostpointercapture', onLostCapture)

    return {

        active(): boolean {
            return null !== pointer
        },

        cancel(): void {
            release()
        },

        destroy(): void {
            release()
            element.removeEventListener('pointerdown', onPointerDown)
            element.removeEventListener('pointermove', onPointerMove)
            element.removeEventListener('pointerup', onPointerUp)
            element.removeEventListener('pointercancel', onPointerUp)
            element.removeEventListener('lostpointercapture', onLostCapture)
        }
    }
}
