/**
 * The refusal, stated once for every reader of a tube map.
 *
 * It lived in `documentGrammar.ts` while a document was the only thing there was to
 * refuse, and moved here when the band payload arrived: a payload that fails a version
 * check is not a non-conforming *document*, and a reader of numbers imports nothing about
 * SVG text to say so (ADR `0005`).
 *
 * **The policy is unchanged and is the same policy for both encodings**: refuse the whole
 * thing rather than draw part of it. A half-drawn map looks like a correct map of
 * different data, and this API already answers an unknown node with
 * 200-and-plausible-nonsense. What each reader refuses *on* differs — the document has a
 * grammar to violate and the payload has four named conditions — but the researcher sees
 * one failure card either way, because from where they sit the encoding is not their
 * business.
 */

/** A tube map this renderer will not draw, and why. Shown in the mount's error state. */
export class NonConformingTubeMap extends Error {

    constructor(message: string) {
        super(message)
        this.name = 'NonConformingTubeMap'
    }
}
