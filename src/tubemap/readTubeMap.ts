/**
 * A response becomes a picture here, and this is the only place that knows there are two of
 * them.
 *
 * One picture arrives in two encodings — an SVG document, or the band payload — and
 * `parseBands.ts` and `parseBandPayload.ts` read them into the identical `ParsedMap`. So
 * `bandSurface`, `bandPicker`, `strandAppearance`, `inversion`, `pclaiInset`, `strandLabel`
 * and `navigator` never learn which one ran, and neither does the surface that calls this:
 * it hands over what the fetch returned and gets back a map and its boxes. ADR `0005`
 * records why there are two readers and why the choice between them is a flag rather than a
 * fallback.
 *
 * **The encoding is not passed in — it is the shape of what arrived.** `fetchDocument` reads
 * the body as text or as bytes according to the flag the host set, so a `string` is a
 * document and a `Uint8Array` is a payload, and there is no third state in which the two
 * could disagree about which one this is.
 *
 * ## Why the band route draws no segment boxes
 *
 * The payload's header does carry the segments, and their outlines are the same rounded-
 * rectangle path strings the document spells — but reading them is work with a known expiry
 * date. [PangenomeAPI#66](https://github.com/CAST-genomics/PangenomeAPI/issues/66) replaces
 * the outline with the five numbers it encodes, which deletes this repo's outline grammar,
 * its nine tolerance-checked redundancy relations and its two spellings of one rectangle.
 * ADR `0005` rejects writing a parser against the string in the meantime, so the band route
 * shows the map without its variant boxes until #66 lands. That is the one thing a
 * researcher could see the flag in, and it is why flipping the flag is gated rather than
 * automatic.
 */

import { parseBandPayload } from './parseBandPayload.ts'
import { parseBands, type ParsedMap } from './parseBands.ts'
import { parseSegmentBoxes, type SegmentBox } from './parseSegmentBoxes.ts'

/** Everything the surface draws, out of one response. */
export interface TubeMapReading {
    map: ParsedMap
    /** `g.node`'s rectangles, or none at all on the band route — see above. */
    boxes: SegmentBox[]
}

/**
 * Read `content` into the picture it describes, refusing the whole of it rather than drawing
 * part (`NonConformingTubeMap`).
 *
 * Both readings of a document happen before anything is built, and both can refuse it: a box
 * the grammar cannot read is a variant nobody would notice was missing, so it refuses the
 * whole map exactly as a non-conforming band does.
 */
export function readTubeMap(content: string | Uint8Array): TubeMapReading {

    if ('string' !== typeof content) {
        return { map: parseBandPayload(content), boxes: [] }
    }

    const map = parseBands(content)

    return { map, boxes: parseSegmentBoxes(content, map.centre) }
}
