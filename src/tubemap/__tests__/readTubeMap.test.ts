/**
 * Which reader runs, and what the other one leaves behind.
 *
 * The surface takes a response and draws it; this is the one line where a response becomes
 * a picture, and the whole of what the format flag changes downstream of the fetch. It is
 * tested here rather than through `bandSurface.show` because that builds a WebGL renderer,
 * and nothing about *which parser ran* needs one.
 *
 * The pairing fixtures are what make the two comparable: a payload and a document from one
 * render. `parseBandPayload.test.ts` holds the two readings to each other number by number;
 * what is asserted here is only that the right reading happens to the right bytes.
 */

import { describe, expect, it } from 'vitest'
import { NonConformingTubeMap } from '../nonConformingTubeMap.ts'
import { readTubeMap } from '../readTubeMap.ts'
import { tubeMapEncodingOf } from '../tubeMapEncoding.ts'
import { PAIRED_INVERTED_STEM, readFixture, readPairedDocument, readPayloadFixture } from './fixture.ts'

describe('readTubeMap', () => {

    it('reads a document with the document parser, and its segment boxes with it', () => {
        const { map, boxes } = readTubeMap(readFixture())

        expect(map.bandCount).toBeGreaterThan(0)
        expect(boxes.length).toBeGreaterThan(0)
    })

    it('reads bytes with the payload parser, and reaches the same picture', () => {
        const fromPayload = readTubeMap(readPayloadFixture(PAIRED_INVERTED_STEM))
        const fromDocument = readTubeMap(readPairedDocument(PAIRED_INVERTED_STEM))

        expect(fromPayload.map.bandCount).toBe(fromDocument.map.bandCount)
        expect(fromPayload.map.strandCount).toBe(fromDocument.map.strandCount)
        expect(fromPayload.map.content).toEqual(fromDocument.map.content)
    })

    /**
     * ADR `0005` rejects reading the payload's `outline` strings: their #66 replaces them
     * with the five numbers they encode, which deletes this repo's outline grammar. So the
     * band route draws no segment boxes until it does, and that is a decision recorded
     * rather than an omission — this test is what keeps it from being read as a bug.
     */
    it('draws no segment boxes on the band route, deliberately', () => {
        expect(readTubeMap(readPayloadFixture(PAIRED_INVERTED_STEM)).boxes).toEqual([])
    })

    // The refusal is the parsers' own and is not re-thrown as something else here: the
    // failure card must not be able to say which encoding it was reading.
    it('refuses a payload that is not one, as a non-conforming tube map', () => {
        expect(() => readTubeMap(new Uint8Array([0, 0, 0, 0]))).toThrow(NonConformingTubeMap)
    })
})

/**
 * Reading a format back out of a URL — for the hosts that are handed one rather than
 * building it. The app never asks: it builds the URL and reads the response from one flag,
 * and this exists so the dev pages, which open whatever is typed at them, cannot caption a
 * payload as a document the way #128 had them captioning `5514+` as `5519`.
 */
describe('tubeMapEncodingOf', () => {

    it('reads the format the request asks for', () => {
        expect(tubeMapEncodingOf('https://api.example/seqtubemap?chrom=chr1&format=bands')).toBe('bands')
        expect(tubeMapEncodingOf('https://api.example/seqtubemap?chrom=chr1')).toBe('document')
    })

    it('reads a committed payload by its extension', () => {
        expect(tubeMapEncodingOf('/src/tubemap/__tests__/fixtures/stm-chr8-10079054-10080461.bands')).toBe('bands')
        expect(tubeMapEncodingOf('/src/tubemap/__tests__/fixtures/stm-chr1-25331046-25331646.svg')).toBe('document')
    })

    it('defaults to the document, which is what an unrecognisable URL returns', () => {
        expect(tubeMapEncodingOf('')).toBe('document')
        expect(tubeMapEncodingOf('/whatever?format=svg')).toBe('document')
    })
})
