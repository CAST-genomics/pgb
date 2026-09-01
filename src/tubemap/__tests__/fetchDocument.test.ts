/**
 * When the fetch gives up, and which of the ways it stopped it reports.
 *
 * This is the seam the guardrail can be silently wrong at. A timeout that reported itself
 * as a caller abort would leave the mount returning quietly with the spinner still up —
 * the exact indefinite hang the limit exists to end, now unreachable by any other code
 * path. And a caller abort that reported itself as a timeout would put a failure card on
 * the screen every time a researcher opened a second node before the first had finished.
 * Both look fine in a browser until the day they don't.
 *
 * The clock is real rather than faked, so the patience is passed in at milliseconds.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchDocument, PATIENCE_MS, TubeMapLoadError } from '../fetchDocument.ts'

const URL = 'https://api.example/tubemap?minigraphnode=5520'

/** A server that accepts the request and never finishes it — the #23 failure mode. */
function neverAnswers(): typeof fetch {
    return ((_input: unknown, init?: { signal?: AbortSignal }) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(abortError()))
    })) as unknown as typeof fetch
}

/** Headers arrive promptly; the body never does. */
function answersThenStalls(): typeof fetch {
    return ((_input: unknown, init?: { signal?: AbortSignal }) => Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => new Promise<string>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(abortError()))
        })
    })) as unknown as typeof fetch
}

function abortError(): Error {
    const error = new Error('The operation was aborted.')
    error.name = 'AbortError'
    return error
}

afterEach(() => vi.unstubAllGlobals())

describe('fetchDocument', () => {

    it('gives up on a server that never answers, and calls it slow', async () => {
        vi.stubGlobal('fetch', neverAnswers())

        const failure = await fetchDocument(URL, undefined, 20).catch(error => error)

        expect(failure).toBeInstanceOf(TubeMapLoadError)
        expect((failure as TubeMapLoadError).kind).toBe('slow')
        expect(failure.message).toMatch(/did not answer/)
    })

    it('holds the body to the same clock as the headers', async () => {
        vi.stubGlobal('fetch', answersThenStalls())

        const failure = await fetchDocument(URL, undefined, 20).catch(error => error)

        // A 14 MB response whose first byte is prompt and whose last never comes is still
        // an indefinite spinner. Stopping the clock once the headers land sails past it.
        expect((failure as TubeMapLoadError).kind).toBe('slow')
    })

    it('leaves a caller abort as an abort, so a superseded load stays silent', async () => {
        vi.stubGlobal('fetch', neverAnswers())

        const controller = new AbortController()
        const pending = fetchDocument(URL, controller.signal, 10_000).catch(error => error)

        controller.abort()

        const failure = await pending

        // The mount checks `signal.aborted` and returns without drawing. Wrapping this in a
        // TubeMapLoadError would show a failure card for ordinary housekeeping.
        expect(failure).not.toBeInstanceOf(TubeMapLoadError)
        expect((failure as Error).name).toBe('AbortError')
    })

    it('still names an ordinary network failure a network failure', async () => {
        vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')))

        const failure = await fetchDocument(URL, undefined, 10_000).catch(error => error)

        expect((failure as TubeMapLoadError).kind).toBe('network')
    })

    it('asks without credentials', async () => {
        // Not hygiene. The API pairs a wildcard `access-control-allow-origin` with
        // `access-control-allow-credentials: true`, which browsers reject, so a credentialed
        // request fails CORS before the response can be read. The default is `'same-origin'`,
        // which would start attaching cookies the day a host proxies the API same-origin.
        let init: RequestInit | undefined

        vi.stubGlobal('fetch', (_input: unknown, options?: RequestInit) => {
            init = options
            return Promise.resolve({ ok: true, status: 200, statusText: 'OK', text: () => Promise.resolve('<svg/>') })
        })

        await fetchDocument(URL, undefined, 10_000)

        expect(init?.credentials).toBe('omit')
    })

    /**
     * The band payload arrives as bytes, and the only thing that changes is how the body
     * is read. Everything above this line — the clock, the abort, the classification, the
     * omitted credentials — is the same code on both paths, which is what makes the
     * failure card identical whichever encoding failed (ADR `0005` §5).
     */
    describe('reading the band payload', () => {

        /** A server that answers with `body`, recording which reader was asked for it. */
        function answers(body: string | Uint8Array) {
            const asked: string[] = []

            const response = {
                ok: true,
                status: 200,
                statusText: 'OK',
                text: () => { asked.push('text'); return Promise.resolve(String(body)) },
                arrayBuffer: () => {
                    asked.push('arrayBuffer')
                    const bytes = 'string' === typeof body ? new TextEncoder().encode(body) : body
                    return Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
                }
            }

            vi.stubGlobal('fetch', () => Promise.resolve(response))

            return asked
        }

        it('reads the response as bytes when the band payload was asked for', async () => {
            const asked = answers(new Uint8Array([1, 2, 3, 4]))

            const payload = await fetchDocument(URL, undefined, 10_000, 'bands')

            expect(asked).toEqual(['arrayBuffer'])
            expect(payload).toBeInstanceOf(Uint8Array)
            expect(Array.from(payload as Uint8Array)).toEqual([1, 2, 3, 4])
        })

        it('reads the response as text when it was not', async () => {
            const asked = answers('<svg/>')

            expect(await fetchDocument(URL, undefined, 10_000)).toBe('<svg/>')
            expect(asked).toEqual(['text'])
        })

        // Emptiness is a property of the response rather than of either reading of it, so
        // both paths say the same sentence about it — and the researcher, who is not told
        // which encoding was asked for, must not be able to tell from the card.
        it('calls an empty payload empty, in the same words as an empty document', async () => {
            answers(new Uint8Array(0))
            const fromPayload = await fetchDocument(URL, undefined, 10_000, 'bands').catch(error => error)

            answers('   ')
            const fromDocument = await fetchDocument(URL, undefined, 10_000).catch(error => error)

            expect((fromPayload as TubeMapLoadError).kind).toBe('content')
            expect(fromPayload.message).toBe(fromDocument.message)
        })

        it('holds the payload’s body to the same clock as the document’s', async () => {
            vi.stubGlobal('fetch', ((_input: unknown, init?: { signal?: AbortSignal }) => Promise.resolve({
                ok: true,
                status: 200,
                statusText: 'OK',
                arrayBuffer: () => new Promise<ArrayBuffer>((_resolve, reject) => {
                    init?.signal?.addEventListener('abort', () => reject(abortError()))
                })
            })) as unknown as typeof fetch)

            const failure = await fetchDocument(URL, undefined, 20, 'bands').catch(error => error)

            expect((failure as TubeMapLoadError).kind).toBe('slow')
        })
    })

    it('waits longer than the slowest response ever measured', () => {
        // 65.6 s, `5511+` at 7,632 bp (`data/failureProbe.json`). A limit under that would
        // refuse nodes that work, which is worse than the hang it replaces.
        expect(PATIENCE_MS).toBeGreaterThan(65_600)
    })
})
