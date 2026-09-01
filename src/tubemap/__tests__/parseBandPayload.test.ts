/**
 * The payload reader is checked against the document reader, on five renders that produced
 * both.
 *
 * That pairing is the whole strength of these tests. A parser written from a spec can be
 * self-consistently wrong — a swapped field, a control abscissa normalized against the
 * unswapped span — and every such error survives any test that only reads the payload back.
 * What it cannot survive is agreeing, band for band and float for float, with a parser that
 * reached the same numbers from an SVG document by an entirely different route.
 *
 * The two readers meet at `ParsedMap`, so agreement is checked there rather than on
 * intermediate values: it is exactly what `bandSurface` and the rest are handed.
 */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { describeFailure } from '../loadFailure.ts'
import { NonConformingTubeMap } from '../nonConformingTubeMap.ts'
import { FLAT, LEFTWARD, RIGHTWARD, parseBands } from '../parseBands.ts'
import type { ParsedMap } from '../parseBands.ts'
import { parseBandPayload } from '../parseBandPayload.ts'
import {
    PAIRED_FIXTURE_STEM,
    PAIRED_INVERTED_STEM,
    readPairedDocument,
    readPayloadFixture
} from './fixture.ts'

/**
 * Two typed arrays, element by element, naming the first index they differ at.
 *
 * Hand-rolled because `toEqual` is not usable at this size: `5520+` carries 268,770 floats,
 * and vitest's deep equality builds a diff of the whole pair before it reports anything —
 * a comparison that never finished in ten minutes when it was written that way. The loop
 * below runs in milliseconds and says more when it fails, since the index is the band.
 */
function expectSameNumbers(
    actual: Float32Array | Uint16Array | Uint8Array,
    expected: Float32Array | Uint16Array | Uint8Array,
    what: string
): void {
    expect(actual.length, `${what}: length`).toBe(expected.length)

    for (let at = 0; at < expected.length; at += 1) {
        if (actual[at] !== expected[at]) {
            expect.fail(`${what}: differs at ${at} — payload ${actual[at]}, document ${expected[at]}`)
        }
    }
}

/** One float32 ulp at `magnitude` — the finest distinction a coordinate of that size can
 *  carry, and the bound the two readers agree to. */
function ulpAt(magnitude: number): number {
    return Math.pow(2, Math.ceil(Math.log2(magnitude)) - 24)
}

/** Where a band's control point sits, in world units: the fraction put back on the span. */
function controlAt(geometry: Float32Array, at: number, field: 4 | 5): number {
    return geometry[at] + geometry[at + field] * geometry[at + 2]
}

/** Written as a bare compare rather than `toBeCloseTo`, which is decimal-places and would
 *  have to be spelled differently per document; the ulp is the same statement everywhere. */
function expectWithinUlp(actual: number, expected: number, ulp: number, what: string): void {
    if (Math.abs(actual - expected) > ulp) {
        expect.fail(
            `${what}: payload ${actual}, document ${expected} — `
            + `${(Math.abs(actual - expected) / ulp).toFixed(2)} ulp apart`
        )
    }
}

/** The payload and the document of one render, both parsed. */
function bothReadings(stem: string): { payload: ParsedMap, document: ParsedMap } {
    return {
        payload: parseBandPayload(readPayloadFixture(stem)),
        document: parseBands(readPairedDocument(stem))
    }
}

/** A payload with one field of its header changed, re-encoded. Every refusal test builds
 *  its case this way, from a real payload, so what is under test is the one difference. */
function payloadWithHeader(stem: string, edit: (header: Record<string, any>) => void): Uint8Array {
    const bytes = readPayloadFixture(stem)
    const length = new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, true)
    const header = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + length)))

    edit(header)

    const encoded = new TextEncoder().encode(JSON.stringify(header))
    const bodyStart = (4 + length + 3) & ~3
    const body = bytes.subarray(bodyStart)
    const rebuiltBodyStart = (4 + encoded.length + 3) & ~3
    const rebuilt = new Uint8Array(rebuiltBodyStart + body.length)

    new DataView(rebuilt.buffer).setUint32(0, encoded.length, true)
    rebuilt.set(encoded, 4)
    rebuilt.set(body, rebuiltBodyStart)

    return rebuilt
}

/** The smallest payload, at 0.07 MB: what every test that is not about a specific region
 *  uses, so the suite stays fast. */
const SMALLEST = 'stm-chr8-78771162-78771252'

describe('parseBandPayload', () => {

    it('returns a ParsedMap of the same shape the document parser returns', () => {
        const { payload, document } = bothReadings(SMALLEST)

        expect(Object.keys(payload).sort()).toEqual(Object.keys(document).sort())

        expect(payload.geometry).toBeInstanceOf(Float32Array)
        expect(payload.strandIds).toBeInstanceOf(Uint16Array)
        expect(payload.bandDirections).toBeInstanceOf(Uint8Array)
        expect(payload.strandColors).toBeInstanceOf(Uint8Array)
        expect(payload.geometry.length).toBe(payload.bandCount * 6)
        expect(payload.strandIds.length).toBe(payload.bandCount)
        expect(payload.bandDirections.length).toBe(payload.bandCount)
        expect(payload.strandColors.length).toBe(payload.strandCount * 3)
        expect(payload.strandNames.length).toBe(payload.strandCount)
        expect(payload.strandPlacements.length).toBe(payload.strandCount)
        expect(payload.strandScores.length).toBe(payload.strandCount)
    })

    describe.each(PAIRED_FIXTURE_STEM)('%s', stem => {

        it('recovers the same frame and band count as the document', () => {
            const { payload, document } = bothReadings(stem)

            expect(payload.centre).toEqual(document.centre)
            expect(payload.content).toEqual(document.content)
            expect(payload.bandCount).toBe(document.bandCount)
        })

        /**
         * The two readers agree to the last bit the document's coordinate range can hold.
         *
         * Not to the *identical* float, and the difference is the format rather than either
         * parser. The payload rounds every abscissa to float32 on the wire, and this parser
         * then derives `width` and the two control fractions from those rounded numbers; the
         * document parser derives the same three in double from full-precision text and
         * rounds once at the end. So the payload's derived fields carry a double rounding,
         * and the control fractions carry it amplified by cancellation — `controlTop - x0` is
         * a span of tens of units taken between two numbers near 10⁵.
         *
         * Measured over all five renders, 2026-09-01, the largest disagreement in each field
         * as a fraction of one float32 ulp at the document's own width:
         *
         *     region                       x0    width  controlTop/Bottom
         *     chr8:78,771,162-78,771,252   0.50  0.86   0.60
         *     chr1:25,331,046-25,331,646   0.50  0.86   0.81
         *     chr8:10,079,054-10,080,461   0.25  0.44   0.49
         *     chr1:25,301,271-25,309,238   0.50  0.86   0.86
         *     chr1:25,331,646-25,335,796   0.50  0.86   0.78
         *
         * — so one ulp is the bound, it holds with margin everywhere, and it is a bound a
         * structural error cannot hide under: a swapped end, a control fraction normalized
         * against the unswapped span, or a frame off by the centre all miss by hundreds of
         * units rather than by a fifteen-millionth of the picture.
         *
         * **The ordinates are compared exactly**, and are exactly equal: nothing is derived
         * from them, so the wire's rounding is the only one and both parsers see its result.
         */
        it('recovers the same geometry as the document, within one float32 ulp', () => {
            const { payload, document } = bothReadings(stem)
            const ulp = ulpAt(document.content.width)

            for (let band = 0; band < document.bandCount; band += 1) {
                const at = band * 6

                expect(payload.geometry[at + 1], `band ${band} y0`).toBe(document.geometry[at + 1])
                expect(payload.geometry[at + 3], `band ${band} y1`).toBe(document.geometry[at + 3])

                expectWithinUlp(payload.geometry[at], document.geometry[at], ulp, `band ${band} x0`)
                expectWithinUlp(payload.geometry[at + 2], document.geometry[at + 2], ulp, `band ${band} width`)

                // The control abscissae compared where they are meaningful — as positions in
                // the picture, not as fractions. A fraction's tolerance would depend on how
                // wide its band is, which is what the cancellation above is about.
                expectWithinUlp(
                    controlAt(payload.geometry, at, 4),
                    controlAt(document.geometry, at, 4),
                    ulp,
                    `band ${band} controlTop`
                )
                expectWithinUlp(
                    controlAt(payload.geometry, at, 5),
                    controlAt(document.geometry, at, 5),
                    ulp,
                    `band ${band} controlBottom`
                )
            }
        })

        it('recovers the same strand table as the document', () => {
            const { payload, document } = bothReadings(stem)

            expect(payload.strandCount).toBe(document.strandCount)
            expectSameNumbers(payload.strandIds, document.strandIds, 'strandIds')
            expect(payload.strandNames).toEqual(document.strandNames)
            expectSameNumbers(payload.strandColors, document.strandColors, 'strandColors')
            expect(payload.strandPlacements).toEqual(document.strandPlacements)
            expect(payload.strandScores).toEqual(document.strandScores)
        })

        it('derives the same band directions as the document', () => {
            const { payload, document } = bothReadings(stem)

            expectSameNumbers(payload.bandDirections, document.bandDirections, 'bandDirections')
        })
    })

    /**
     * The direction census, stated as figures rather than as agreement.
     *
     * The test above would pass if both parsers were wrong the same way — they derive
     * direction from the same rule, and a rule inverted in both is invisible to a
     * comparison. These numbers come from the picture: the region is an inversion
     * polymorphism, and 2,334 of its bands are drawn right-to-left.
     */
    it('counts the inversion fixture\'s 2,334 leftward bands', () => {
        const { bandDirections } = parseBandPayload(readPayloadFixture(PAIRED_INVERTED_STEM))
        const census = { [RIGHTWARD]: 0, [LEFTWARD]: 0, [FLAT]: 0 } as Record<number, number>

        for (const direction of bandDirections) {
            census[direction] += 1
        }

        expect(census[LEFTWARD]).toBe(2334)
        expect(census[RIGHTWARD]).toBe(4370)
        expect(census[FLAT]).toBe(6542)
        expect(bandDirections.length).toBe(13246)
    })

    /**
     * Normalization, said about the arrays rather than about one band.
     *
     * `ParsedMap` promises a positive width and `x0` at the left end whichever end the
     * layout drew first, and the payload's leftward bands are exactly the ones that promise
     * can be broken on. A `>= 0` here would pass on a parser that dropped the swap and left
     * the widths signed, since two thirds of them are positive either way.
     */
    it('stores every band left-to-right, including the leftward ones', () => {
        const { geometry, bandDirections } = parseBandPayload(readPayloadFixture(PAIRED_INVERTED_STEM))
        let leftward = 0

        for (let band = 0; band < bandDirections.length; band += 1) {
            expect(geometry[band * 6 + 2]).toBeGreaterThan(0)

            if (LEFTWARD === bandDirections[band]) {
                leftward += 1
            }
        }

        expect(leftward).toBeGreaterThan(0)
    })

    /**
     * The two control abscissae are read separately.
     *
     * They differ per band — the top and bottom edges of a band are not translates of each
     * other — and a parser that read one and reused it for the other would draw a picture
     * that is wrong by less than a pixel nearly everywhere. Agreement with the document
     * already covers it; this says the fixture actually exhibits the case, so that
     * agreement is not agreement about a constant.
     */
    it('reads the top and bottom control abscissae as the different numbers they are', () => {
        const { geometry, bandDirections } = parseBandPayload(readPayloadFixture(PAIRED_INVERTED_STEM))
        let differing = 0

        for (let band = 0; band < bandDirections.length; band += 1) {
            if (FLAT !== bandDirections[band] && geometry[band * 6 + 4] !== geometry[band * 6 + 5]) {
                differing += 1
            }
        }

        expect(differing).toBeGreaterThan(0)
    })

    /**
     * The geometry is the buffer that arrived.
     *
     * ADR `0005`: "the regex pass is deleted rather than shrunk — the body's geometry column
     * is a `Float32Array` view over the bytes that arrived, which is the instance buffer."
     * That is a claim about allocation, and this is where it is held to: the largest payload
     * is 1.4 MB and copying it would be invisible in every other test here.
     */
    it('views the response\'s bytes rather than copying them', () => {
        const bytes = readPayloadFixture(SMALLEST)
        const { geometry } = parseBandPayload(bytes)

        expect(geometry.buffer).toBe(bytes.buffer)
    })

    /**
     * The bytes need not start where a `Float32Array` can be viewed over them.
     *
     * A `fetch` hands over a buffer of its own, so in the browser they always do; a
     * `Buffer` from `readFileSync` need not, because Node pools small reads, and a
     * `Float32Array` cannot be viewed over an odd offset at all. The parser copies the
     * column rather than throwing, and this is the case that says so — the fixtures are
     * detached on the way in precisely so they do *not* exercise it by accident.
     */
    it('reads a payload whose bytes do not start on a four-byte boundary', () => {
        const bytes = readPayloadFixture(SMALLEST)
        const shifted = new Uint8Array(bytes.length + 1)

        shifted.set(bytes, 1)

        const odd = parseBandPayload(shifted.subarray(1))
        const aligned = parseBandPayload(readPayloadFixture(SMALLEST))

        expect(odd.bandCount).toBe(aligned.bandCount)
        expectSameNumbers(odd.geometry, aligned.geometry, 'geometry')
        expectSameNumbers(odd.strandIds, aligned.strandIds, 'strandIds')
        expect(odd.strandNames).toEqual(aligned.strandNames)
    })

    describe('refuses the whole payload', () => {

        it('when the format is not this one', () => {
            expect(() => parseBandPayload(payloadWithHeader(SMALLEST, header => {
                header.format = 'pangenome-tiles'
            }))).toThrow(NonConformingTubeMap)
        })

        it('when the version is one this build does not know', () => {
            expect(() => parseBandPayload(payloadWithHeader(SMALLEST, header => {
                header.version = 2
            }))).toThrow(NonConformingTubeMap)
        })

        it('when the payload draws a reversal', () => {
            expect(() => parseBandPayload(payloadWithHeader(SMALLEST, header => {
                header.reversals.connectors = [ { order: 3 } ]
            }))).toThrow(NonConformingTubeMap)

            expect(() => parseBandPayload(payloadWithHeader(SMALLEST, header => {
                header.reversals.corners = [ { order: 7 } ]
            }))).toThrow(NonConformingTubeMap)
        })

        it('when the body is truncated', () => {
            const bytes = readPayloadFixture(SMALLEST)

            expect(() => parseBandPayload(bytes.slice(0, bytes.length - 24)))
                .toThrow(NonConformingTubeMap)
        })

        it('when the body is longer than the header says', () => {
            const bytes = readPayloadFixture(SMALLEST)
            const padded = new Uint8Array(bytes.length + 4)

            padded.set(bytes)

            expect(() => parseBandPayload(padded)).toThrow(NonConformingTubeMap)
        })

        it('when the strand table is larger than a Uint16 can address', () => {
            expect(() => parseBandPayload(payloadWithHeader(SMALLEST, header => {
                header.strands = { length: 65537 }
            }))).toThrow(NonConformingTubeMap)
        })

        it('when a strand sits in a row that is not its id', () => {
            expect(() => parseBandPayload(payloadWithHeader(SMALLEST, header => {
                header.strands[4].id = 400
            }))).toThrow(NonConformingTubeMap)
        })

        it('when the bands are not the thickness this renderer draws', () => {
            expect(() => parseBandPayload(payloadWithHeader(SMALLEST, header => {
                header.band.thickness = 20
            }))).toThrow(NonConformingTubeMap)
        })

        it('when the viewBox is not four numbers', () => {
            expect(() => parseBandPayload(payloadWithHeader(SMALLEST, header => {
                header.document.viewBox = '0 -20 4803.142857142858'
            }))).toThrow(NonConformingTubeMap)
        })

        it('when a band has no width to normalize against', () => {
            const bytes = readPayloadFixture(SMALLEST)
            const length = new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, true)
            const header = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + length)))
            const geometry = new Float32Array(
                bytes.buffer,
                bytes.byteOffset + ((4 + length + 3) & ~3) + header.band.geometry.byteOffset,
                header.band.count * 6
            )

            // x1 := x0. The control fractions would be NaN and the band would draw as
            // nothing, which the document parser refuses in both its arms.
            geometry[2] = geometry[0]

            expect(() => parseBandPayload(bytes)).toThrow(NonConformingTubeMap)
        })

        it('when the header carries no band or strand tables', () => {
            expect(() => parseBandPayload(payloadWithHeader(SMALLEST, header => {
                delete header.band
            }))).toThrow(NonConformingTubeMap)

            expect(() => parseBandPayload(payloadWithHeader(SMALLEST, header => {
                delete header.strands
            }))).toThrow(NonConformingTubeMap)
        })

        it('when a column\'s declared size disagrees with the band count', () => {
            expect(() => parseBandPayload(payloadWithHeader(SMALLEST, header => {
                header.band.geometry.byteLength -= 24
            }))).toThrow(NonConformingTubeMap)
        })

                it('when the response is not a band payload at all', () => {
            expect(() => parseBandPayload(new TextEncoder().encode('<html>504 Gateway Timeout</html>')))
                .toThrow(NonConformingTubeMap)
        })
    })

    /**
     * The failure card does not say which encoding failed.
     *
     * ADR `0005`: from where the researcher sits the encoding is not their business, and
     * "this tube map cannot be drawn" is the same sentence whichever parser refused. The
     * classification is what carries that, so it is checked at `describeFailure` rather
     * than at the error class.
     */
    it('shows the same failure card as a refused document', () => {
        const url = 'https://example.org/seqtubemap?chrom=chr8&start=1&end=2'

        let fromPayload: unknown

        try {
            parseBandPayload(payloadWithHeader(SMALLEST, header => { header.version = 2 }))
        } catch (error) {
            fromPayload = error
        }

        let fromDocument: unknown

        try {
            parseBands('<svg viewBox="0 0 1 1"></svg>')
        } catch (error) {
            fromDocument = error
        }

        const payloadCard = describeFailure(url, fromPayload)
        const documentCard = describeFailure(url, fromDocument)

        expect(payloadCard.kind).toBe('undrawable')
        expect(documentCard.kind).toBe('undrawable')
        expect(payloadCard.heading).toBe(documentCard.heading)
        expect(payloadCard.note).toBe(documentCard.note)
    })

    /**
     * ADR `0002`'s cost, discharged and held discharged.
     *
     * The whole point of this path is that the picture is not recovered from text, and a
     * regular expression is how it would creep back — a `split(/\s+/)` on the viewBox, a
     * sniff at the response's first bytes. Cheap to state, and it states the thing the rest
     * of the suite cannot: agreement with the document parser would survive a parser that
     * ran a regex to get there.
     */
    /**
     * ADR `0002`'s cost, discharged and held discharged.
     *
     * The whole point of this path is that the picture is not recovered from text, and a
     * regular expression is how it would creep back — a `split(/\s+/)` on the viewBox, a
     * sniff at the response's first bytes. Cheap to state, and it states the thing the rest
     * of the suite cannot: agreement with the document parser would survive a parser that
     * ran a regex to get there.
     *
     * Comments are stripped before the source is searched, rather than filtered by how a
     * line begins, so a pattern named in a trailing comment does not fail the test and one
     * hidden after code on a commented line does not pass it.
     */
    it('runs no regular expression over the response', () => {
        const code = readFileSync('src/tubemap/parseBandPayload.ts', 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/^[^\n]*?\/\/[^\n]*$/gm, '')

        expect(code).not.toContain('RegExp')

        for (const method of [ 'test', 'exec', 'match', 'matchAll', 'replace', 'replaceAll', 'search', 'split' ]) {
            expect(code, `${method} is called somewhere in the parser`).not.toContain(`.${method}(`)
        }
    })
})
