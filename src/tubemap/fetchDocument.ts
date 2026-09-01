/**
 * Fetching a tube map document, which is all the mount does with a URL.
 *
 * `open(url)` is the entire input surface (`CONTEXT.md` #2): the host constructs the URL
 * from a clicked minigraph node's id and coordinates, and the viewer never builds one,
 * never checks eligibility, and never learns whether it is local or remote. A fixture in
 * `public/` is just another URL.
 *
 * The response comes back unparsed — as text, or as bytes — because reading it is not the
 * fetch's business: `readTubeMap.ts` is where a response becomes a picture.
 *
 * **Text or bytes is the caller's to say, and it is the only thing the format flag changes
 * here.** The band payload is a length, a JSON header and typed arrays over what follows
 * (`parseBandPayload.ts`), so decoding it as UTF-8 would corrupt it before anything could
 * read it. Everything else below — the clock, the two aborts, the classification, the
 * omitted credentials, the empty-response sentence — is one piece of code on both paths,
 * which is what makes the failure card identical whichever encoding failed (ADR `0005`).
 *
 * Note from the CORS survey (`notes/sequence-tube-map/measurements/2026-08-12-api-reachability-and-cors.md`): the API's
 * error responses carry no CORS headers, so a 500 reaches the browser as an opaque
 * network failure rather than a status. Both paths below are therefore live.
 *
 * The failures below say what went wrong and not *what it went wrong with*: the error
 * state shows the URL on a line of its own (`loadFailure.ts`), and a message that names it
 * again puts it on the screen twice.
 *
 * ## Why the fetch gives up
 *
 * The API crashes while generating large responses (#23) and does it slowly: probed
 * failures came back at 33–100 s, and two catalogued nodes never answered at all. Without
 * a limit those become an indefinite spinner, which is the one outcome that tells the
 * researcher nothing — a viewer that is still trying looks exactly like a viewer that is
 * hung.
 *
 * `PATIENCE_MS` is 90 s, and it is a *guardrail, not a diagnosis*. The slowest observed
 * success took 65.6 s, so the limit sits above every response known to arrive and gives up
 * on the rest. Diagnosing why the server takes that long is UCSD's, and deliberately not
 * this viewer's — see `notes/sequence-tube-map/measurements/2026-08-13-api-fetch-ceiling.md`.
 */

import type { TubeMapEncoding } from './tubeMapEncoding.ts'

/**
 * How long to wait before calling it a server-side problem.
 *
 * Above the slowest success ever measured (65.6 s, `5511+` at 7,632 bp) with room to
 * spare, because aborting a request that would have arrived is the worse error: the
 * researcher gets a failure card for a node that works, and no way to tell that from a
 * node that doesn't.
 */
export const PATIENCE_MS = 90_000

export class TubeMapLoadError extends Error {

    constructor(message: string, readonly kind: 'network' | 'content' | 'slow') {
        super(message)
        this.name = 'TubeMapLoadError'
    }
}

export async function fetchDocument(
    url: string,
    signal?: AbortSignal,
    patienceMs: number = PATIENCE_MS,
    encoding: TubeMapEncoding = 'document'
): Promise<string | Uint8Array> {

    // Our own controller rather than the caller's, so the two reasons a request stops stay
    // distinguishable: the caller aborting is silent housekeeping — a second `open()`
    // overtaking the first — and running out of patience is a failure the researcher must
    // be shown. Both arrive at the `catch` below as the same `AbortError`, and only
    // `expired` tells them apart.
    const attempt = new AbortController()
    let expired = false

    const timer = setTimeout(() => {
        expired = true
        attempt.abort()
    }, patienceMs)

    const relay = (): void => attempt.abort()

    signal?.addEventListener('abort', relay, { once: true })

    // The body is read inside the timer's reach as well as the headers. A 14 MB response
    // whose first byte arrives quickly and whose last never does is exactly the hang this
    // exists to end, and stopping the clock at the headers would sail straight past it.
    try {
        let response: Response

        try {
            // `credentials: 'omit'`, not the default `'same-origin'`, and it is a
            // correctness requirement rather than hygiene: the API answers with a wildcard
            // `access-control-allow-origin` *and* `access-control-allow-credentials: true`,
            // a pairing browsers reject outright. Any request that carried credentials
            // would fail CORS before the response was readable. Saying `omit` also keeps
            // that true for a future host that mounts the viewer same-origin behind a
            // proxy, where the default would start attaching cookies.
            response = await fetch(url, { signal: attempt.signal, credentials: 'omit' })
        } catch (error) {
            throw translate(error, expired, signal, patienceMs)
        }

        if (false === response.ok) {
            throw new TubeMapLoadError(`The server answered ${response.status} ${response.statusText}`, 'network')
        }

        let body: string | Uint8Array

        try {
            body = 'bands' === encoding
                ? new Uint8Array(await response.arrayBuffer())
                : await response.text()
        } catch (error) {
            throw translate(error, expired, signal, patienceMs)
        }

        // Emptiness is a property of the response, not of either reading of it, so it is
        // named here — in one sentence, said the same way about no bytes as about no text.
        // Left to the renderers it comes back as whatever each one's parser happens to miss
        // first — "no drawable elements in g.track" is a diagnosis of the band grammar, and
        // the document had no bytes.
        if (isEmpty(body)) {
            throw new TubeMapLoadError('The response was empty — no tube map for this minigraph node.', 'content')
        }

        return body
    } finally {
        clearTimeout(timer)
        signal?.removeEventListener('abort', relay)
    }
}

/**
 * Which of the three ways a stopped request stopped.
 *
 * Order matters. The caller's abort is checked first and rethrown untouched, because the
 * mount reads it as "this load was superseded" and returns without drawing anything;
 * wrapping it in a `TubeMapLoadError` would put a failure card on the screen every time a
 * researcher opened a second node before the first finished.
 */
function translate(error: unknown, expired: boolean, signal: AbortSignal | undefined, patienceMs: number): unknown {
    if (signal?.aborted) {
        return error
    }

    if (expired) {
        return new TubeMapLoadError(
            `The server did not answer within ${Math.round(patienceMs / 1000)} seconds`,
            'slow'
        )
    }

    return new TubeMapLoadError(`The request did not complete — ${describe(error)}`, 'network')
}

/** Nothing arrived: no bytes at all, or a document that is only whitespace. */
function isEmpty(body: string | Uint8Array): boolean {
    return 'string' === typeof body ? 0 === body.trim().length : 0 === body.byteLength
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}
