/**
 * The PCLAI inset — every haplotype the open document places, as a dot at its ancestry
 * coordinate, over the ancestry colour ramp.
 *
 * This is the idle state and the whole of it in this ticket: the cloud at rest, in the
 * document's own colours, so the lobe structure is on screen before anything is
 * highlighted. Ringing the feeler's haplotype (#115) and the drag/resize/hide chrome
 * (#114) attach to this; neither exists yet.
 *
 * ## It is a position report, and nothing in it is clickable
 *
 * `docs/adr/0003-passive-pclai-inset.md` is the record, and it is a rejection on
 * measurement rather than a deferral: 99.5–99.8% of the coordinate's variance separates
 * five ancestry clusters and 0.2–0.5% lies within them, so at any size a panel can be, the
 * median haplotype's nearest neighbour is a fraction of a pixel away. The inset answers
 * *which group*; the strand name under the feeler answers *which haplotype*. A click
 * handler here would be answering the second question with the first one's data, so the
 * surface is inert to the pointer and stays inert.
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
 * `segmentOverlay`'s boxes are rectangles that are rectangles. 460 elements positioned
 * once per document, transformed never — the band renderer's context stays the one thing
 * it draws, and the inset cannot be a reason its scene grows a second one.
 *
 * ## What is not drawn
 *
 * Strands the document does not place (`pclaiX="None"`) produce no dot. There are 6 of
 * them in the chr1 strip, 12 in the chr8 document and 99 in `5520+`, so at some loci a
 * fifth of the population is absent from a picture that otherwise reads as complete. ADR
 * 0003 accepts that cost explicitly: the inset's claim is "every *placed* haplotype", and
 * the map compensates — feeling an unplaced strand will ring nothing, and the name label
 * says which strand it was.
 */

import type { Point, Size } from './geometry.ts'
import type { ParsedMap } from './parseBands.ts'
import { projectPlacement } from './strandCoordinates.ts'

/**
 * How big the **plot** is, in css pixels — the box the ramp is stretched over and the
 * projection maps the ramp's domain onto. The widget around it is larger by `PLOT_INSET`
 * on each side, so this is not the size of anything you can measure with a ruler on
 * screen; #114's drag handle and resize grip size themselves from the widget, not here.
 *
 * Square, because the ramp is: a non-square plot would stretch the legend away from the
 * coordinates it calibrates. Small enough to be an annotation on the map rather than a
 * second view of it, which is the same judgement that took the navigator to 75% of its
 * measured size.
 *
 * Owned here rather than in the stylesheet because the dots are positioned in these
 * pixels: two spellings of the plot's size is how a cloud ends up subtly off its ramp.
 */
export const PLOT_SIZE: Size = { width: 216, height: 216 }

/**
 * How wide a dot is, in css pixels.
 *
 * The cloud is dense by nature — the median haplotype's nearest neighbour is well under a
 * pixel here — so this sets how the *lobes* read rather than how an individual haplotype
 * does. Four keeps a sparse arm of the cloud visible as dots instead of dissolving it,
 * without filling the dense lobes into flat blocks.
 */
export const DOT_SIZE = 4

/**
 * How far the plot sits inside the widget's edge, in css pixels.
 *
 * Half a dot, and it exists because the extremes of the ramp's domain are real positions
 * rather than headroom: the chr1 strip puts 27 haplotypes within a pixel of the domain's
 * bottom-right corner, and with the plot flush to the edge that lobe is drawn as half
 * dots against the widget's boundary. The ramp is inset by the same amount, so the legend
 * stays exactly under the coordinates it calibrates.
 */
export const PLOT_INSET = DOT_SIZE * 0.5

/** One haplotype's dot: which strand it is, where it goes, and what colour it is. */
export interface PlottedDot {
    strandId: number
    /** Centre, in css pixels from the inset's top-left corner, y down. */
    at: Point
    /** The document's own colour for that strand, as CSS. */
    color: string
}

/**
 * The document's cloud on a surface of the given size: one dot per **placed** strand, in
 * strand id order.
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

export interface PclaiInset {
    /** Plot this document's cloud, replacing whatever was there. */
    show(map: ParsedMap): void
    /** Take the cloud off screen, in the same call that empties the map. */
    clear(): void
    destroy(): void
}

export function createPclaiInset(parent: HTMLElement): PclaiInset {

    const doc = parent.ownerDocument

    const element = doc.createElement('div')

    element.className = 'stm-pclai-inset'
    element.hidden = true

    // Here rather than in the stylesheet, from the same constants the dots are placed with:
    // the ramp is stretched over exactly the box `strandCoordinates.ts` maps the ramp's
    // domain onto, which is what makes a dot's colour the colour underneath it.
    element.style.width = `${PLOT_SIZE.width + PLOT_INSET * 2}px`
    element.style.height = `${PLOT_SIZE.height + PLOT_INSET * 2}px`
    element.style.backgroundSize = `${PLOT_SIZE.width}px ${PLOT_SIZE.height}px`
    element.style.backgroundPosition = `${PLOT_INSET}px ${PLOT_INSET}px`

    parent.append(element)

    return {

        show(map: ParsedMap): void {
            const cloud = plotCloud(map, PLOT_SIZE)
            const fragment = doc.createDocumentFragment()

            for (const dot of cloud) {
                const point = doc.createElement('div')

                point.className = 'stm-pclai-dot'
                point.style.left = `${PLOT_INSET + dot.at.x - DOT_SIZE * 0.5}px`
                point.style.top = `${PLOT_INSET + dot.at.y - DOT_SIZE * 0.5}px`
                point.style.background = dot.color

                fragment.append(point)
            }

            element.replaceChildren(fragment)

            // A document that places nobody gets no widget rather than an empty one. An
            // empty plot over the ramp is a picture of a cohort with no ancestry, which is
            // a claim; showing nothing says nothing, which is the true thing to say about a
            // document that carries no placements. Every document in this repo places most
            // of its strands, so this is the non-HPRC case rather than a locus.
            element.hidden = 0 === cloud.length
        },

        clear(): void {
            element.replaceChildren()
            element.hidden = true
        },

        destroy(): void {
            element.remove()
        }
    }
}
