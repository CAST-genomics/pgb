/**
 * The PCLAI inset — every haplotype the open document places, as a dot at its ancestry
 * coordinate, over the ancestry colour ramp. Hold the feeler over a strand in the map and
 * the crowd recedes while that haplotype's dot is ringed and scaled up.
 *
 * ## It is a position report, and nothing in it is clickable
 *
 * `docs/adr/0003-passive-pclai-inset.md` is the record, and it is a rejection on
 * measurement rather than a deferral: 99.5–99.8% of the coordinate's variance separates
 * five ancestry clusters and 0.2–0.5% lies within them, so at any size a panel can be, the
 * median haplotype's nearest neighbour is a fraction of a pixel away. The inset answers
 * *which group*; the strand name under the feeler answers *which haplotype*. A click
 * handler here would be answering the second question with the first one's data.
 *
 * So the surface is transparent to the pointer and the map keeps every gesture aimed at
 * it: a drag that starts on the cloud pans the map, a wheel over it zooms the map. The two
 * exceptions are the header and the resize grip, which are the only things this widget is
 * interactive *for*, and they take their own events through `shieldFromMap`.
 *
 * ## The mark is a ring, not a bigger dot
 *
 * A dot's colour is nearly identical to its neighbours' — that is the whole finding behind
 * the inset — so scaling alone would leave a bigger dot of the same hue inside a cluster of
 * that hue. The ring is stroked in the viewer's own ink, which is not a colour the ancestry
 * palette contains, and the scale is what makes it findable at a glance rather than hunted
 * for. Feeling a strand the document does not place recedes the crowd and rings **nothing**:
 * absence is never reported as a position.
 *
 * ## It reads the document, not the dataset
 *
 * Every coordinate comes from `parseBands`' reading of the SVG the panel already fetched,
 * so the plotted population is exactly the strand population drawn in the map. Sourcing
 * from `pclaiCoordinateService` would let the inset address haplotypes the map does not
 * draw and vice versa, and would need the 3-part↔2-part key bridge. PGB therefore has two
 * PCLAI scatters on purpose: that one indexes nodes in the 3D graph, this one indexes
 * strands in one document, and what they share is the coordinate space rather than a class.
 *
 * ## Divs, not WebGL
 *
 * A dot is a small circle and a circle is a div with a radius, exactly as
 * `segmentOverlay`'s boxes are rectangles that are rectangles. 460 elements positioned once
 * per document and touched one at a time by the feeler — the band renderer's context stays
 * the one thing it draws.
 *
 * ## What is not drawn
 *
 * Strands the document does not place (`pclaiX="None"`) produce no dot. There are 6 of them
 * in the chr1 strip, 12 in the chr8 document and 99 in `5520+`, so at some loci a fifth of
 * the population is absent from a picture that otherwise reads as complete. ADR 0003
 * accepts that cost explicitly: the inset's claim is "every *placed* haplotype", and the map
 * compensates — feeling an unplaced strand rings nothing, and the name label says which
 * strand it was.
 */

import { clamp, type Point, type Size } from './geometry.ts'
import type { ParsedMap } from './parseBands.ts'
import { createPointerDrag, type PointerDragHandle } from './pointerDrag.ts'
import { projectPlacement } from './strandCoordinates.ts'
import { shieldFromMap } from './surfacePointer.ts'

/**
 * How big the **plot** starts out, in css pixels — the box the ramp is stretched over and
 * the projection maps the ramp's domain onto. The widget around it is larger by the mat and
 * the header, so this is not the size of anything you can measure with a ruler on screen.
 *
 * Square, because the ramp is: a non-square plot stretches the legend, and while it would
 * stretch the dots identically — so the legend would stay exact — the cloud's shape would
 * stop being the cloud's shape. The grip keeps it square for that reason.
 *
 * Small enough to be an annotation on the map rather than a second view of it, which is the
 * same judgement that took the navigator to 75% of its measured size. Resizing is the only
 * way to spend more pixels on the cloud, so the dots **reproject** at the new size rather
 * than the plot scaling as a bitmap.
 */
export const PLOT_SIZE = 216

/** The smallest and largest plot the grip will make, in css pixels. The floor is where the
 *  lobes stop being separable at all; the ceiling is a cap against a readout that has become
 *  the view. Both are further bounded by the panel, which the widget stays inside. */
export const MIN_PLOT_SIZE = 120
export const MAX_PLOT_SIZE = 900

/**
 * How wide a dot is, in css pixels.
 *
 * The cloud is dense by nature — the median haplotype's nearest neighbour is well under a
 * pixel here — so this sets how the **lobes** read rather than how an individual haplotype
 * does. No size makes a haplotype pointable; that is ADR 0003's whole subject.
 *
 * Doubled from 4 on 2026-08-21, off a sweep of 4, 6 and 8 on the chr1 strip. At 4 the
 * sparse arm running down the right of the cloud is a line of specks and the orange lobe in
 * the corner is a smudge; at 8 both are dots a reader can count, and the teal lobe is a
 * shape rather than a mark. The cost is that the densest stretches merge into a solid
 * ribbon, which is honest — they *are* solid, at 0.39 px median separation on a plot twice
 * this one's size — and the grip is what buys the texture back when someone wants it.
 */
export const DOT_SIZE = 8

/**
 * How wide the ringed dot is, and how thick its ring, in css pixels.
 *
 * Two and a half times the crowd, which is the ratio the mark was judged at when the crowd
 * was 4: a ring that is merely a little larger than its neighbours has to be hunted for,
 * and hunting is what the ring exists to end. It moves with `DOT_SIZE` for that reason —
 * fixing it while the crowd grew would leave the feeler's answer the same size as the
 * things it is being told apart from.
 */
export const FOCUS_SIZE = DOT_SIZE * 2.5
export const RING_WIDTH = 1.5

/**
 * White space between the plot and the widget's edge, in css pixels.
 *
 * The extremes of the ramp's domain are real positions rather than headroom — the chr1
 * strip puts 27 haplotypes within a pixel of the bottom-right corner — and a dot is centred
 * on its coordinate, so half of one always lies outside the plot. The mat is what that half
 * lands on. It is sized from the **ringed** dot, the largest thing the plot ever draws, so a
 * haplotype at the edge of the cloud can be ringed without the ring being clipped by the
 * widget it sits in.
 *
 * Half the ringed dot, its ring, and 2 px of air. The air is not slack: at exactly the ring's
 * outer bound, a haplotype in the corner lobe — which the chr1 strip has 27 of — is ringed
 * flush against the widget's border, and a ring touching a border reads as a ring that has
 * been cut off.
 */
export const MAT = Math.ceil(FOCUS_SIZE * 0.5 + RING_WIDTH + 2)

/** One haplotype's dot: which strand it is, where it goes, and what colour it is. */
export interface PlottedDot {
    strandId: number
    /** Centre, in css pixels from the plot's top-left corner, y down. */
    at: Point
    /** The document's own colour for that strand, as CSS. */
    color: string
}

/**
 * The document's cloud on a plot of the given size: one dot per **placed** strand, in strand
 * id order.
 *
 * Separate from the mounting so that what enters the plot and where it lands is answerable
 * without a DOM — which is the part of this that can be wrong while the picture stays
 * plausible.
 */
export function plotCloud(map: ParsedMap, surface: Size): PlottedDot[] {
    const dots: PlottedDot[] = []

    for (let strandId = 0; strandId < map.strandCount; strandId += 1) {
        const placement = map.strandPlacements[strandId]

        // Absence, not a coordinate. Drawing it anywhere — the origin most temptingly —
        // would report a position the inference declined to give.
        if (null === placement) {
            continue
        }

        const red = strandId * 3

        dots.push({
            strandId,
            at: projectPlacement(placement, surface),
            color: `rgb(${map.strandColors[red]}, ${map.strandColors[red + 1]}, ${map.strandColors[red + 2]})`
        })
    }

    return dots
}

/** What the cloud looks like for one feeler answer: whether the crowd recedes, and which
 *  haplotype — if any — is ringed. */
export interface CloudState {
    receded: boolean
    ringed: number | null
}

/**
 * What the feeler's answer does to the cloud.
 *
 * Three states, and the third is the one worth stating: a **placed** strand recedes the
 * crowd and is ringed; an **unplaced** strand recedes the crowd and rings nothing, because
 * absence must not be drawn as a position; **nothing** under the feeler leaves the cloud at
 * rest, since a receded crowd with no ring in it reports on a haplotype that is not there.
 */
export function cloudState(map: ParsedMap, focused: number | null): CloudState {
    if (null === focused) {
        return { receded: false, ringed: null }
    }

    return {
        receded: true,
        ringed: null === map.strandPlacements[focused] ? null : focused
    }
}

/**
 * How large the grip may make a plot, given the widget's non-plot extent (`chrome`: the mat
 * on both axes, and the header on one) and the panel it lives in.
 *
 * **The panel binds before the ceiling does**, and that is the whole point of this. The
 * surface root clips what leaves it, so a plot grown past the panel carries the grip — which
 * sits at the widget's far corner — out of the panel with it. The grip is then not merely
 * awkward to hit: the browser answers that point with the canvas, so the grab pans the map
 * instead, and no gesture is left that shrinks the plot again. The researcher has resized
 * their way into a widget they cannot resize.
 *
 * A panel too small even for `MIN_PLOT_SIZE` gets a plot below it rather than a hidden grip:
 * a floor exists to keep the lobes separable, and a cloud too small to read is a better
 * failure than a control nobody can reach.
 */
export function fitPlotSize(wanted: number, chrome: Size, host: Size): number {
    const cap = Math.min(MAX_PLOT_SIZE, host.width - chrome.width, host.height - chrome.height)
    const floor = Math.min(MIN_PLOT_SIZE, cap)

    return Math.round(clamp(wanted, Math.max(1, floor), Math.max(1, cap)))
}

/**
 * Where a widget of size `widget` may sit inside a panel of size `host`, in css pixels from
 * the panel's top-left corner.
 *
 * It stays inside the panel: a readout that can be pushed off the edge is one that can be
 * lost, and one that could be dragged onto PGB's 3D graph would invite clicks the graph will
 * not answer — ADR 0001's card sprawl, and ADR 0003's passivity. When the panel is smaller
 * than the widget no position fits and the near corner wins, because that is the one that
 * keeps the header, and so the hide button, reachable.
 */
export function withinHost(at: Point, widget: Size, host: Size): Point {
    return {
        x: clamp(at.x, 0, Math.max(0, host.width - widget.width)),
        y: clamp(at.y, 0, Math.max(0, host.height - widget.height))
    }
}

/** Where the widget sits when a panel is first opened, in css pixels from its corner. */
const HOME: Point = { x: 16, y: 16 }

/**
 * Hidden stays hidden for the session.
 *
 * Module-level rather than per-instance, deliberately: dismissing the readout is a statement
 * about wanting it, not about this document, so being re-served it on every node opened
 * afterwards is how a dismissible thing becomes an irritation. It is not persisted past the
 * session — the discovery path for the whole feature is holding `Shift` and seeing something
 * move, and that only exists if the cloud is on screen the first time.
 */
let hiddenForSession = false

export interface PclaiInset {
    /** Plot this document's cloud, replacing whatever was there. */
    show(map: ParsedMap): void
    /** Ring the haplotype under the feeler, or take the ring off. Idempotent: a sweep
     *  re-reports the same strand for many frames running. */
    focus(strandId: number | null): void
    /** Take the cloud off screen, in the same call that empties the map. */
    clear(): void
    /** The panel changed size; keep the widget inside it. */
    relayout(): void
    destroy(): void
}

export function createPclaiInset(parent: HTMLElement): PclaiInset {

    const doc = parent.ownerDocument

    const element = doc.createElement('div')
    element.className = 'stm-pclai-inset'
    element.hidden = true

    const header = doc.createElement('div')
    header.className = 'stm-pclai-header'

    const title = doc.createElement('span')
    title.className = 'stm-pclai-title'
    title.textContent = 'PCLAI'

    const dismiss = doc.createElement('button')
    dismiss.className = 'stm-pclai-dismiss'
    dismiss.type = 'button'
    dismiss.title = 'Hide the PCLAI cloud'
    dismiss.textContent = '×'

    const plot = doc.createElement('div')
    plot.className = 'stm-pclai-plot'

    const grip = doc.createElement('div')
    grip.className = 'stm-pclai-grip'
    grip.title = 'Resize the PCLAI cloud'

    header.append(title, dismiss)
    element.append(header, plot, grip)

    // Shown in the widget's place while it is hidden, so dismissing it is reversible without
    // a menu this viewer does not have.
    const restore = doc.createElement('button')
    restore.className = 'stm-pclai-restore'
    restore.type = 'button'
    restore.textContent = 'PCLAI'
    restore.title = 'Show the PCLAI cloud'
    restore.hidden = true

    parent.append(element, restore)

    // Chrome, not map: these three answer their own pointer events and the map must not also
    // answer them. The plot is deliberately not in this list — a drag across the cloud pans
    // the map underneath it, which is the whole of this widget's pointer transparency.
    shieldFromMap(header)
    shieldFromMap(grip)
    shieldFromMap(restore)

    /** The document on screen, kept because a resize replots it at the new size. */
    let current: ParsedMap | null = null
    /** The plot's edge in css pixels; the widget's size follows from it. */
    let size = PLOT_SIZE
    let at: Point = { ...HOME }
    /** One element per plotted dot, and where each sits — read when the ring moves, so the
     *  dot it leaves can be put back to its own geometry without recomputing the cloud. */
    let dots: PlottedDot[] = []
    let elements: HTMLElement[] = []
    /** Index into `dots` of the ringed haplotype, or -1. */
    let ringed = -1

    /** Where a drag or a resize started, in client pixels, and what it started from. */
    let grabbed: Point = { x: 0, y: 0 }
    let grabbedAt: Point = { ...HOME }
    let grabbedSize = size

    function hostSize(): Size {
        const bounds = parent.getBoundingClientRect()

        return { width: bounds.width, height: bounds.height }
    }

    /** The widget's own extent: the plot, its mat, and the header. Measured rather than
     *  computed, because the header's height is the stylesheet's business. */
    function widgetSize(): Size {
        return { width: element.offsetWidth, height: element.offsetHeight }
    }

    function place(): void {
        element.style.transform = `translate(${at.x}px, ${at.y}px)`
        restore.style.transform = `translate(${at.x}px, ${at.y}px)`
    }

    function keepInside(): void {
        at = withinHost(at, widgetSize(), hostSize())
        place()
    }

    /** The widget's extent that is not the plot: the mat on both axes, and the header on
     *  one. Measured rather than computed from `MAT`, so the stylesheet stays the one place
     *  the header's height is decided. */
    function chromeSize(): Size {
        return {
            width: Math.max(0, element.offsetWidth - plot.offsetWidth),
            height: Math.max(0, element.offsetHeight - plot.offsetHeight)
        }
    }

    /** Size the plot, and lay the cloud out again in it. */
    function resizePlot(next: number): void {
        size = fitPlotSize(next, chromeSize(), hostSize())

        plot.style.width = `${size}px`
        plot.style.height = `${size}px`
        plot.style.backgroundSize = `${size}px ${size}px`

        if (null !== current) {
            paint(current)
        }
    }

    /** Draw one document's cloud at the current plot size. */
    function paint(map: ParsedMap): void {
        const fragment = doc.createDocumentFragment()

        dots = plotCloud(map, { width: size, height: size })
        elements = []
        ringed = -1

        for (const dot of dots) {
            const point = doc.createElement('div')

            point.className = 'stm-pclai-dot'
            point.style.background = dot.color
            settle(point, dot)

            elements.push(point)
            fragment.append(point)
        }

        plot.replaceChildren(fragment)
        plot.classList.remove('is-feeling')
    }

    /** A dot at rest: its own size, centred on its coordinate. */
    function settle(point: HTMLElement, dot: PlottedDot): void {
        point.style.left = `${dot.at.x - DOT_SIZE * 0.5}px`
        point.style.top = `${dot.at.y - DOT_SIZE * 0.5}px`
        point.style.width = `${DOT_SIZE}px`
        point.style.height = `${DOT_SIZE}px`
        point.classList.remove('is-ringed')
    }

    /** The ringed dot: grown about its own centre, so it still marks the coordinate it
     *  marked at rest. Written as geometry rather than as a `scale()` transform, because a
     *  transform would scale the ring's stroke with it and the ring is a fixed weight. */
    function ring(point: HTMLElement, dot: PlottedDot): void {
        point.style.left = `${dot.at.x - FOCUS_SIZE * 0.5}px`
        point.style.top = `${dot.at.y - FOCUS_SIZE * 0.5}px`
        point.style.width = `${FOCUS_SIZE}px`
        point.style.height = `${FOCUS_SIZE}px`
        point.classList.add('is-ringed')
    }

    /**
     * Show the widget, or the chip that brings it back, or neither.
     *
     * Neither is the honest state for a document that places nobody: an empty plot over the
     * ramp is a picture of a cohort with no ancestry, which is a claim, and offering to
     * restore a cloud that would be empty is the same claim with a button on it.
     */
    function reveal(): void {
        const nothingToShow = null === current || 0 === dots.length

        element.hidden = nothingToShow || hiddenForSession
        restore.hidden = nothingToShow || false === hiddenForSession
    }

    const drag: PointerDragHandle = createPointerDrag(header, {
        accepts: (event: PointerEvent): boolean => 0 === event.button && dismiss !== event.target,

        onStart(event: PointerEvent): void {
            grabbed = { x: event.clientX, y: event.clientY }
            grabbedAt = { ...at }
            element.classList.add('is-dragging')
        },

        onMove(event: PointerEvent): void {
            at = withinHost(
                {
                    x: grabbedAt.x + event.clientX - grabbed.x,
                    y: grabbedAt.y + event.clientY - grabbed.y
                },
                widgetSize(),
                hostSize()
            )

            place()
        },

        onEnd(): void {
            element.classList.remove('is-dragging')
        }
    })

    const stretch: PointerDragHandle = createPointerDrag(grip, {
        accepts: (event: PointerEvent): boolean => 0 === event.button,

        onStart(event: PointerEvent): void {
            grabbed = { x: event.clientX, y: event.clientY }
            grabbedSize = size
            element.classList.add('is-dragging')
        },

        onMove(event: PointerEvent): void {
            // One number, taken from whichever axis was pulled further: the plot stays
            // square, so the cloud keeps its shape and the ramp behind it is never stretched.
            const pulled = Math.max(event.clientX - grabbed.x, event.clientY - grabbed.y)

            resizePlot(grabbedSize + pulled)
            keepInside()
        },

        onEnd(): void {
            element.classList.remove('is-dragging')
        }
    })

    function onDismiss(): void {
        hiddenForSession = true
        reveal()
    }

    function onRestore(): void {
        hiddenForSession = false
        reveal()
        keepInside()
    }

    dismiss.addEventListener('click', onDismiss)
    restore.addEventListener('click', onRestore)

    resizePlot(PLOT_SIZE)
    place()

    return {

        show(map: ParsedMap): void {
            current = map
            paint(map)
            reveal()
            keepInside()
        },

        focus(strandId: number | null): void {
            if (null === current) {
                return
            }

            const state = cloudState(current, strandId)
            const wanted = null === state.ringed
                ? -1
                : dots.findIndex(dot => dot.strandId === state.ringed)

            plot.classList.toggle('is-feeling', state.receded)

            if (wanted === ringed) {
                return
            }

            // The dot the ring is leaving is put back before the next is marked. That is the
            // trail behind the cursor a sweep would otherwise leave, and it is the same bug
            // `strandAppearance` exists to keep dead on the map's side of one gesture.
            if (-1 !== ringed) {
                settle(elements[ringed], dots[ringed])
            }

            if (-1 !== wanted) {
                ring(elements[wanted], dots[wanted])
            }

            ringed = wanted
        },

        clear(): void {
            current = null
            dots = []
            elements = []
            ringed = -1

            plot.replaceChildren()
            plot.classList.remove('is-feeling')
            element.hidden = true
            restore.hidden = true
        },

        relayout(): void {
            // The panel getting smaller is the other way to strand the grip outside it, so
            // the plot is re-fitted rather than only repositioned. A panel that grows again
            // does not grow the plot back: the size is the researcher's to choose, and this
            // only ever takes away what cannot be shown.
            resizePlot(size)
            keepInside()
        },

        destroy(): void {
            drag.destroy()
            stretch.destroy()
            dismiss.removeEventListener('click', onDismiss)
            restore.removeEventListener('click', onRestore)

            element.remove()
            restore.remove()
        }
    }
}
