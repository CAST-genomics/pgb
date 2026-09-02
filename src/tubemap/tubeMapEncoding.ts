/**
 * Which encoding of a tube map the host asked the server for — and the flag that decides.
 *
 * One picture, two wire formats. `/seqtubemap` returns an SVG document; `/seqtubemap?format=bands`
 * returns the same picture as the numbers themselves, an eighth to a ninth of the size on
 * the four regions that are worth measuring. `parseBands.ts` reads the first,
 * `parseBandPayload.ts` reads the second, and both produce the identical reading — the same
 * `ParsedMap` and the same segment boxes — so everything downstream of `readTubeMap.ts` is
 * untouched by which one ran (ADR `0005`).
 *
 * ## A flag, never a fallback
 *
 * The obvious design — ask for bands, fall back to the document when that fails — is a trap
 * on this API specifically. `fetchDocument.ts` carries the measurement: its failures arrive
 * at **33–100 s with no CORS headers**, indistinguishable in the browser from a network
 * error, against a `PATIENCE_MS` of 90 s. A fallback would therefore spend up to ninety
 * seconds before the second request began, on exactly the large nodes this whole effort
 * exists for.
 *
 * So the viewer never probes, never retries and never learns what the server supports. It
 * is *told*, by the constant below, and the constant is one line because flipping it is a
 * deliberate act taken once. That act was taken on **2026-09-02**, when the format reached
 * the server this viewer talks to: `/seqtubemap?format=bands` at the URL
 * `buildSeqTubeMapURL` builds answers 200 with `application/octet-stream`,
 * `access-control-allow-origin: *`, and a `pangenome-bands` v1 payload whose body is byte
 * for byte the one the committed fixtures carry.
 *
 * The line stays here, rather than being deleted along with the document reader, because
 * the two readers answer to two servers. A deployment that rolls back, or a second
 * instance that has not taken the format yet, is one edit away from being usable again —
 * and `parseBands.ts` is still the only reader for the five documents committed under
 * `__tests__/fixtures`, which are older renders and are kept as exactly that.
 */

/** The two encodings of one picture. `'document'` is the SVG; `'bands'` is the payload. */
export type TubeMapEncoding = 'document' | 'bands'

/**
 * **The flag.** What PGB asks the server for.
 *
 * This line carries three things at once and nothing else: the request carries
 * `format=bands`, the response body is read as bytes rather than as text, and
 * `readTubeMap` hands those bytes to `parseBandPayload`. Nothing about the failure card
 * moves, because from where the researcher sits the encoding is not their business.
 *
 * What it buys, measured at the same URL on the day it was flipped: chr1:25,331,046-25,331,646
 * is 285 KB against the document's 2.5 MB, and node `5520+` is 1.4 MB against 14.2 MB — an
 * eighth to a tenth, and no regular expression runs over the response.
 */
export const TUBE_MAP_ENCODING: TubeMapEncoding = 'bands'

/**
 * The encoding a URL is asking for, read back out of it.
 *
 * **Not for the viewer**, which never inspects a URL (`CONTEXT.md` #2) and is told its
 * encoding by whoever hands it one. This is for the hosts that do not *build* their URL —
 * the dev pages, which open whatever is typed into their picker or passed as `?url=`, and
 * which therefore have to work the pair out the way `devTubeMapTarget.ts` works out the
 * node. A `.bands` path is the committed fixture; `format=bands` is a live request.
 */
export function tubeMapEncodingOf(url: string): TubeMapEncoding {
    if (url.endsWith('.bands')) {
        return 'bands'
    }

    const query = url.includes('?') ? new URLSearchParams(url.slice(url.indexOf('?') + 1)) : null

    return 'bands' === query?.get('format') ? 'bands' : 'document'
}
