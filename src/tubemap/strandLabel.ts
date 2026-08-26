/**
 * The names of the strands under the feeler, following the cursor.
 *
 * This is the first thing in the viewer that says *what* a strand is rather than which
 * integer it is. `parseBands` keeps `trackName` verbatim; this reads it out beside the
 * cursor for as long as the gesture holds, so a researcher who has isolated a haplotype
 * has something to write down.
 *
 * ## Why it is a list
 *
 * At fit six haplotypes lie inside the cursor's css pixel, and until #120 the pick answered
 * with whichever of them was drawn last — five real answers discarded, and nothing on screen
 * saying they existed. The pick now reports the set in screen order and this reads
 * it out in the same order, so the label says what the map actually holds there.
 *
 * **The count is itself information.** *Six strands here* tells the researcher what the
 * map's resolution is at this zoom, and that magnifying will separate them. It is
 * self-annulling in the way the thickness floor is: as the view magnifies the set shrinks,
 * and at the zoom where every band exceeds a pixel this is one name — byte for byte the
 * label #111 shipped.
 *
 * **Each name carries its own colour, as a swatch.** The dot beside a name is the dot that
 * haplotype has in the ancestry cloud — same colour, same shape — so a researcher reading a
 * name and looking for it in the cloud is matching one mark against another rather than
 * holding a position in their head. The lit row's swatch takes the cloud's own hairline ring,
 * which makes the two panels' answers the same object drawn twice.
 *
 * **The colour is not spent on the text**, and that is a measurement rather than a taste. Every
 * one of the 464 strand colours on `5520+` is a pastel: against this card's white the best of
 * them reaches 2.74:1 and the median is 1.88:1, so not one reaches even the 3:1 that large
 * text wants, and the unplaced grey `rgb(211, 211, 211)` lands at 1.5:1. Coloured names would
 * be a label nobody can read. A swatch spends the colour where contrast does not matter —
 * against a filled shape — and leaves the name at the card's own near-black.
 *
 * **An inverted name says so** (#132). The caption over the map says how many haplotypes are
 * inverted; this is the only surface that says *which*, and a researcher holding one of 463
 * haplotypes cannot otherwise tell whether it is one of the 166. A word rather than a mark
 * because colour and alpha are both already spoken for and a band is 0.19 css px tall at fit
 * — ADR `0004` §Consequences argues it. Only the exceptions are named, so most rows carry no
 * word at all; which ones do, and why the ordinary case is left silent, are `inversion.ts`'s
 * decisions, and this file writes down what it is handed.
 *
 * **One of them is lit, and the list says which.** The map emphasizes exactly one strand out
 * of the set — `CONTEXT.md` §feeler states why — so that row is drawn at full strength and
 * the rest recede, the same statement the map is making underneath. A name at full strength
 * still refers to the strand currently emphasized, which is the invariant #111 established
 * and #120 must not quietly break.
 *
 * ## Why it is gated on the feeler and not on hover
 *
 * Holding `Shift` is the act of reaching into the crowd, and the names are an answer to it.
 * An ungated hover would put a list on screen wherever the cursor sat on the strip.
 *
 * ## Why it is not `.graph-tooltip`
 *
 * `segmentOverlay`'s tooltip is PGB's node tooltip borrowed outright: a card with a title
 * and a details table of *one node's properties*, positioned below-right of the cursor. This
 * is a stack of identifiers for as many haplotypes as share a pixel — the same shape only if
 * you squint. #111 said that if the label ever grew a second row that would be the moment to
 * reconsider merging them, and #120 grew it several. It is still not worth it: a details
 * table's rows are label-and-value pairs about one thing, these rows are peers, and the
 * measure, the emphasis and the cap are all this label's own. Merging would buy one owner
 * for two layouts. The offsets keep the two apart on the rare document where both are on
 * screen at once (at fit no segment box is wide enough to be drawn at all, so mostly they
 * never meet).
 *
 * It does, however, **look exactly like one**: PGB's tooltip ground, border, radius and
 * sans-serif face, with each name set as a `.node-title`. A researcher crosses between the
 * 3D graph, the segment tooltip and this label constantly, and a readout that changed
 * medium between them would read as a different kind of object rather than as one more
 * thing the viewer is saying. Sharing an appearance is not sharing an owner; the shared
 * declarations are stated once in `surfaceStyles.ts`.
 *
 * Inert to the pointer, like the badge and the `?pick` readout: the map underneath keeps
 * answering, so the cursor is never over the label instead of over the strand it names.
 */

import { beside, type Point, type Size } from './geometry.ts'
import type { HaplotypeReading } from './inversion.ts'

/**
 * How many names the label will draw at once.
 *
 * At fit on `5520+` the pick answers with **6.0 strands on average and 7 at the most**
 * (`notes/sequence-tube-map/measurements/2026-08-21-how-finely-to-sample-a-pick.md`), so five
 * is a cap that bites — the count row is usually there, and that is the point. *Five names
 * and one more below* is the map saying how much this pixel is holding; a list long enough to
 * never need the row would say it less clearly and be taller than the bundle it annotates.
 *
 * Five names plus a count is six lines following the cursor, which is about as much as can be
 * read at a glance without becoming a panel.
 */
export const NAME_CAP = 5

/** How far the label sits from the cursor, in css pixels.
 *
 *  Above it, where `segmentOverlay`'s tooltip is below it — the one document-independent
 *  way to keep two things that follow the same cursor from stacking. */
const OFFSET = { x: 14, y: 12 }

/** One haplotype as the label draws it: what it is called, the colour it has everywhere
 *  else in the viewer, and which way it runs. */
export interface LabelledStrand {
    name: string
    /** CSS, from `strandCss` — the same string the cloud paints that strand's dot with. */
    color: string
    /**
     * What this haplotype's direction is called — *inverted*, *mixed* — or `null`, which is
     * the ordinary case and most rows (#132).
     *
     * Required rather than optional, so naming a haplotype is a decision about its direction
     * even when the decision is silence. Which word, and what the silence covers, are
     * `inversion.ts`'s — see `haplotypeReadings`.
     */
    direction: HaplotypeReading | null
}

/** What the label will actually draw: a window onto the set, and what it left out. */
export interface Listing {
    /** The strands to draw, top to bottom — a contiguous run of the set, never a selection. */
    names: LabelledStrand[]
    /** Index into `names` of the strand the map has lit. Always in range. */
    emphasized: number
    /** How many names the cap left out above the window, and below it. */
    above: number
    below: number
}

export interface StrandLabel {
    /**
     * Name the strands at `at`, in css pixels from the surface's top-left corner.
     *
     * `strands` is the set in screen order, topmost first; `emphasized` indexes the one the
     * map has lit. Idempotent: a sweep re-reports the same haplotypes for many frames
     * running.
     */
    show(strands: LabelledStrand[], emphasized: number, at: Point, within: Size): void
    /** Take the name off screen. Idempotent. */
    hide(): void
    destroy(): void
}

export function createStrandLabel(root: HTMLElement): StrandLabel {

    const element = root.ownerDocument.createElement('div')

    element.className = 'stm-strand-label'
    root.append(element)

    /** What is written on it, so a sweep along one strand does not rewrite the DOM 60
     *  times a second to say the same thing. The lit strand is part of the key: the same
     *  five names with the emphasis on a different one is a different picture. */
    let shown: string | null = null
    /** Its own extent, measured on the frame the text last changed. Kept so that moving it
     *  — which happens every frame of a sweep — never reads layout back out of the DOM. */
    let size: Size = { width: 0, height: 0 }

    return {

        show(strands: LabelledStrand[], emphasized: number, at: Point, within: Size): void {
            // The name and its direction key this: a strand's colour is a property of the
            // strand, so two listings that name the same haplotypes cannot differ in their
            // swatches — but the *document* decides the direction, and opening another one
            // can leave the same name in the set reading the other way.
            const key = `${emphasized}\u0000${strands
                .map(strand => `${strand.name}\u0001${strand.direction ?? ''}`)
                .join('\u0000')}`

            if (key !== shown) {
                element.replaceChildren(
                    ...rows(root.ownerDocument, windowOnto(strands, emphasized, NAME_CAP)))

                // Before measuring: `offsetWidth` on a `display: none` element is zero,
                // and the clamp below is measured against it.
                element.classList.add('is-shown')

                size = { width: element.offsetWidth, height: element.offsetHeight }
                shown = key
            }

            // `beside` horizontally — against the right edge the label goes to the left of
            // the cursor rather than under it, where it would hide the strand it names.
            // Vertically there is only one side worth being on, since below-right is the
            // segment tooltip's, so the top edge clamps instead of flipping.
            const left = beside(at.x, size.width, within.width, OFFSET.x)
            const top = Math.max(0, at.y - OFFSET.y - size.height)

            // A transform rather than `left`/`top`: it does not invalidate layout, so a
            // label moving with the cursor cannot turn the surface's own per-move
            // `getBoundingClientRect` into a forced reflow.
            element.style.transform = `translate(${left}px, ${top}px)`
        },

        hide(): void {
            if (null === shown) {
                return
            }

            shown = null
            element.classList.remove('is-shown')
        },

        destroy(): void {
            element.remove()
        }
    }
}

/**
 * Which names the cap lets through, and how many it hid on each side.
 *
 * A **window** rather than the first `cap` names, and the difference is the whole reason this
 * is tested. #120 asked for a cap and a `+N more`; the plain form of that hides names off the
 * bottom, and the lit strand is the one nearest the cursor — roughly the middle of the set —
 * so it would routinely be the name hidden. A list on screen that does not contain the thing
 * it is a list about is worse than no cap at all. So the window is centred on the lit strand
 * and clamped to the ends: the lit name is always drawn, and the run stays contiguous, so
 * what is on screen is still neighbours in the order they are stacked.
 *
 * The two counts are reported separately because they are drawn separately, above the list
 * and below it. A single trailing total would say nothing about which direction the hidden
 * strands lie in, and direction is the only thing the researcher can act on — it is which way
 * to move the cursor.
 */
export function windowOnto(
    names: LabelledStrand[],
    emphasized: number,
    cap: number
): Listing {
    const start = Math.max(0, Math.min(
        emphasized - Math.floor((cap - 1) / 2),
        names.length - cap
    ))

    return {
        names: names.slice(start, start + cap),
        emphasized: emphasized - start,
        above: start,
        below: Math.max(0, names.length - start - cap)
    }
}

/**
 * The listing as elements: one row per name, and a count row on either side for what the cap
 * hid — drawn only when it hid something, since an empty row still takes its line height and
 * would leave the label looking padded at one end.
 */
function rows(doc: Document, listing: Listing): Node[] {
    const drawn: Node[] = []

    if (listing.above > 0) {
        drawn.push(count(doc, `+${listing.above} above`))
    }

    listing.names.forEach((strand, at) => {
        const row = doc.createElement('div')
        const swatch = doc.createElement('span')

        // The strand's own colour, unadjusted — the cloud paints its dot with this exact
        // string, and a swatch that were corrected for contrast would stop being the same
        // mark.
        swatch.className = 'stm-strand-swatch'
        swatch.style.background = strand.color

        // The lit row at full strength and the rest receded — the same statement the map is
        // making underneath, so the two cannot be read as disagreeing about which strand the
        // feeler has.
        row.className = at === listing.emphasized
            ? 'stm-strand-name is-emphasized'
            : 'stm-strand-name'

        // The name in an element of its own, so that what is on screen as *the name* is the
        // document's characters and nothing else — the claim `spell` exists to make, kept
        // true now that a word can share the row (#132).
        const spelled = doc.createElement('span')

        spelled.className = 'stm-strand-name-text'
        spelled.append(...spell(doc, strand.name))
        row.append(swatch, spelled)

        // Absent rather than empty where the document says nothing about direction: an empty
        // span still takes its margin, and every row of four of the five corpus documents
        // would carry one.
        if (null !== strand.direction) {
            row.append(tag(doc, strand.direction))
        }

        drawn.push(row)
    })

    if (listing.below > 0) {
        drawn.push(count(doc, `+${listing.below} below`))
    }

    return drawn
}

/** The direction, set beside the name it is about — the viewer's word for this haplotype,
 *  not another identifier, so it is set smaller and lighter than the name. */
function tag(doc: Document, direction: string): HTMLElement {
    const said = doc.createElement('span')

    said.className = 'stm-strand-direction'
    said.textContent = direction

    return said
}

function count(doc: Document, text: string): HTMLElement {
    const row = doc.createElement('div')

    row.className = 'stm-strand-count'
    row.textContent = text

    return row
}

/**
 * The name as nodes: its `#` separators wrapped so the stylesheet can put a little air on
 * either side of them, and everything else as plain text.
 *
 * **This adds no characters.** The element's `textContent` is still the document's own
 * spelling, character for character — the separation is margin on a span, not a space in
 * the string — so what is on screen is what a researcher would type, and a name that ever
 * becomes selectable copies verbatim.
 *
 * It is also not a parse: nothing here counts the parts or assigns them meaning, which is
 * what would break on the chr8 fixture's four-part names. A name with no `#` in it at all
 * comes through as one text node.
 *
 * Exported for the one thing about this label that is not obvious by looking: an inserted
 * space and a margin are the same picture, and only one of them is still the name.
 */
export function spell(doc: Document, name: string): Node[] {
    // Capturing split, so the separators survive in the list rather than being consumed.
    return name.split(/(#)/).filter(piece => '' !== piece).map(piece => {
        if ('#' !== piece) {
            return doc.createTextNode(piece)
        }

        const hash = doc.createElement('span')

        hash.className = 'stm-strand-hash'
        hash.textContent = piece

        return hash
    })
}
