/**
 * The one sentence the map says about itself: *166 of 463 haplotypes inverted*.
 *
 * The map is a picture of a document and this is the caption on it. It is here because
 * without it a researcher looking at an inversion has no way to know that is what they are
 * looking at: the drawing shows 5948 connectors, 3771 of them running right to left, and at
 * fit a band is 0.19 css px tall, so not one of them resolves as an individual thing. The
 * fact is document-level or it is invisible.
 *
 * What it says is `describeInversion`'s, which is where the reading against GRCh38 lives.
 * This file is the placement and nothing else.
 *
 * ## Where it sits, and why
 *
 * **Top centre.** The rule the rest of this surface's chrome follows is that the affordances
 * are layered over the picture rather than arranged around it, and that each takes a corner:
 * the ancestry cloud has the top left, the navigator the bottom left, the mode badge and the
 * `?pick` readout the bottom right, and the dev harness's URL picker the top right. Centre
 * is what is left, and it is also where a caption belongs — this is a statement about the
 * whole map rather than a control, and a statement about the whole map should not read as
 * belonging to one end of it.
 *
 * **Inert**, like the badge and the label: the map underneath keeps answering the cursor, so
 * the caption is never a hole in pan, zoom or the feeler.
 *
 * **Absent, not empty, when there is nothing to say.** A document whose haplotypes all run
 * with the reference, and a document with no reference at all, get no element on screen —
 * not a blank one. Both are the ordinary case, and a caption slot sitting empty over most
 * maps would be chrome the map has to be read around.
 */

import { describeInversion, type InversionCensus } from './inversion.ts'

export interface InversionNote {
    /**
     * Caption this document, or say nothing about it. Replaces whatever was said before.
     *
     * The census arrives already taken, rather than being taken here from the document: the
     * surface reads the same fold for the direction beside each haplotype's name (#132), and
     * folding a document's 11,586 bands twice at load would buy nothing.
     */
    show(census: InversionCensus): void
    /** Take the caption off screen. Idempotent. */
    clear(): void
    destroy(): void
}

export function createInversionNote(root: HTMLElement): InversionNote {

    // `root.ownerDocument`, not the global `document`: the surface is mounted into whatever
    // document its host belongs to, which is the same reason every other widget here does it.
    const element = root.ownerDocument.createElement('div')

    element.className = 'stm-inversion'
    element.hidden = true
    root.append(element)

    return {

        show(census: InversionCensus): void {
            const said = describeInversion(census)

            element.textContent = said ?? ''
            element.hidden = null === said
        },

        clear(): void {
            element.textContent = ''
            element.hidden = true
        },

        destroy(): void {
            element.remove()
        }
    }
}
