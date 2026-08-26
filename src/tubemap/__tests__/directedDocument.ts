/**
 * A tube map document as its band directions alone, for the tests that read direction.
 *
 * The corpus is five captured documents and it cannot exhibit what the inversion census has
 * to handle: not one of the five lacks a GRCh38 strand, not one has a haplotype that runs
 * both ways, and none has a reference drawn flat from end to end. ADR `0004` refuses to
 * assert against any of those — each is a document the viewer still draws — so each has to
 * be *shown* to be reported, and showing it means writing one down.
 *
 * This is the smallest thing that can be written down: one row per haplotype, `>` a
 * rightward connector, `<` a leftward one and `=` a passage through a segment box, which is
 * drawn flat and observes no direction at all. Nothing here builds geometry, because nothing
 * that reads direction reads geometry.
 *
 * It sits beside `fixture.ts` rather than inside it: that file is the captured corpus and
 * reads the filesystem, and these documents were never captured from anywhere.
 */

import { FLAT, LEFTWARD, RIGHTWARD } from '../parseBands.ts'
import type { DirectedDocument } from '../inversion.ts'

/** A document whose haplotypes draw the bands `bands` spells, in the order it spells them. */
export function directedDocument(strands: Array<{ name: string, bands: string }>): DirectedDocument {
    const bytes: number[] = []
    const ids: number[] = []

    strands.forEach((strand, id) => {
        for (const band of strand.bands) {
            bytes.push('<' === band ? LEFTWARD : '>' === band ? RIGHTWARD : FLAT)
            ids.push(id)
        }
    })

    return {
        bandDirections: Uint8Array.from(bytes),
        strandIds: Uint16Array.from(ids),
        bandCount: bytes.length,
        strandNames: strands.map(strand => strand.name),
        strandCount: strands.length
    }
}
