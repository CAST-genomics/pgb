/**
 * The parser is the one part of the renderer that can be silently wrong without looking
 * wrong: a mis-numbered regex group yields plausible geometry, and a coordinate
 * conversion applied twice yields a picture that is merely upside down somewhere else.
 *
 * These run against the committed fixture and check the counts the node survey
 * recorded, plus the conversion this copy adds.
 */

import { describe, expect, it } from 'vitest'
import { NonConformingDocument } from '../documentGrammar.ts'
import { MAX_STRAND_ID, THICKNESS, parseBands } from '../parseBands.ts'
import { readFixture, readTallFixture } from './fixture.ts'

/** Every `trackID`/`trackName` pair the document spells out, read straight off the text.
 *  The parser's own answer is checked against this rather than against a hand-copied list,
 *  so the assertion covers all 369 and 464 names rather than the three worth typing out. */
function namesInSource(text: string): Map<number, string> {
    const spelled = new Map<number, string>()

    for (const match of text.matchAll(/trackID="(\d+)" trackName="([^"]*)"/g)) {
        spelled.set(Number(match[1]), match[2])
    }

    return spelled
}

/** Every `trackID`'s placement and score, read straight off the text, so the parser's
 *  answer is checked against all 369 and 464 rather than the two worth typing out. */
function placementsInSource(text: string): Map<number, { x: number, y: number } | null> {
    const spelled = new Map<number, { x: number, y: number } | null>()

    for (const match of text.matchAll(/trackID="(\d+)"[^>]*? pclaiX="([^"]*)" pclaiY="([^"]*)"/g)) {
        const id = Number(match[1])

        if (false === spelled.has(id)) {
            spelled.set(id, 'None' === match[2] ? null : { x: Number(match[2]), y: Number(match[3]) })
        }
    }

    return spelled
}

/** How many strands the document places, and how many it does not. */
function placed(map: { strandPlacements: ({ x: number, y: number } | null)[] }): number {
    return map.strandPlacements.filter(placement => null !== placement).length
}

function unplaced(map: { strandPlacements: ({ x: number, y: number } | null)[] }): number {
    return map.strandPlacements.filter(placement => null === placement).length
}

/** What the node survey recorded for the committed document. */
const SURVEYED = { bands: 10270, strands: 369, width: 35562.42857142856 }

describe('parseBands', () => {

    it('reproduces the surveyed counts', () => {
        const map = parseBands(readFixture())

        expect(map.bandCount).toBe(SURVEYED.bands)
        expect(map.strandCount).toBe(SURVEYED.strands)
        expect(map.content.width).toBeCloseTo(SURVEYED.width, 6)
    })

    it('emits world coordinates centred on the origin', () => {
        const map = parseBands(readFixture())

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity

        for (let i = 0; i < map.bandCount; i += 1) {
            const x0 = map.geometry[i * 6]
            const y0 = map.geometry[i * 6 + 1]
            const width = map.geometry[i * 6 + 2]
            const y1 = map.geometry[i * 6 + 3]

            minX = Math.min(minX, x0)
            maxX = Math.max(maxX, x0 + width)
            minY = Math.min(minY, y0 - THICKNESS, y1 - THICKNESS)
            maxY = Math.max(maxY, y0, y1)
        }

        // Symmetric about the origin on both axes, within the margin the viewBox
        // leaves around the drawing.
        expect(Math.abs(minX + maxX)).toBeLessThan(map.content.width * 0.02)
        expect(Math.abs(minY + maxY)).toBeLessThan(map.content.height * 0.10)

        // And inside the declared extent, which is what the camera frustum is built
        // from — geometry outside it would be invisible at fit.
        expect(minX).toBeGreaterThanOrEqual(-map.content.width * 0.5 - 1)
        expect(maxX).toBeLessThanOrEqual(map.content.width * 0.5 + 1)
    })

    it('yields well formed geometry', () => {
        const map = parseBands(readFixture())

        for (let i = 0; i < map.bandCount; i += 1) {
            const [, y0, width, y1, uTop, uBottom] =
                Array.from(map.geometry.subarray(i * 6, i * 6 + 6))

            expect(width).toBeGreaterThan(0)
            expect(map.strandIds[i]).toBeLessThan(map.strandCount)
            expect(Number.isFinite(y0)).toBe(true)
            expect(Number.isFinite(y1)).toBe(true)

            // The control abscissae sit inside the middle 40% of the span, which is
            // what keeps x(t) monotone and per-pixel coverage well defined. Tolerance
            // is float32 storage only — the survey found u pinned to [0.30, 0.70]
            // exactly, and normalizing before the cast is what keeps that true even on
            // the 177,994-unit-wide documents that stayed in the spike repo.
            for (const u of [uTop, uBottom]) {
                expect(u).toBeGreaterThanOrEqual(0.3 - 1e-6)
                expect(u).toBeLessThanOrEqual(0.7 + 1e-6)
            }
        }
    })

    it('places strands with no gap between them', () => {
        // Pitch 15 against thickness 15, so the map is a solid field of colour rather
        // than thin ribbons on white. This is load-bearing for what the renderer has to
        // preserve at fit scale, so it is asserted rather than remembered.
        const map = parseBands(readFixture())
        const first = new Map<number, number>()

        for (let i = 0; i < map.bandCount; i += 1) {
            const id = map.strandIds[i]

            if (false === first.has(id)) {
                first.set(id, map.geometry[i * 6 + 1])
            }
        }

        const ys = [...first.values()].sort((a, b) => b - a)
        const pitches = new Set<number>()

        for (let i = 1; i < ys.length; i += 1) {
            pitches.add(Number((ys[i - 1] - ys[i]).toFixed(4)))
        }

        expect([...pitches]).toEqual([THICKNESS])
    })

    it('rejects the whole document when anything in g.track is off-grammar', () => {
        const text = readFixture()

        expect(() => parseBands(text.replace('height="15"', 'height="16"')))
            .toThrow(NonConformingDocument)
    })

    it('says a response is not an SVG before it says anything about bands', () => {
        // The common way to arrive with the wrong bytes is an HTML error page. Diagnosing
        // that as a defect in the band grammar sends the reader hunting for a malformed
        // tube map that was never there.
        expect(() => parseBands('<!doctype html><html><body>500</body></html>'))
            .toThrow(/not an SVG document/)
    })

    it('rejects a document whose strand ids are sparse', () => {
        const text = readFixture()

        expect(() => parseBands(text.replace(/trackID="0"/g, 'trackID="9000"')))
            .toThrow(NonConformingDocument)
    })

    it('reads the degenerate flat bands as level, mid-controlled bands', () => {
        // The `<rect>` elements are the same primitive with y0 == y1. They are a third
        // of the document and the shader draws them through the identical code path, so
        // the parser has to hand them geometry a curve shader can consume: level, and
        // with control abscissae that reproduce a straight edge.
        const map = parseBands(readFixture())

        let flat = 0

        for (let i = 0; i < map.bandCount; i += 1) {
            if (map.geometry[i * 6 + 1] !== map.geometry[i * 6 + 3]) {
                continue
            }

            flat += 1

            expect(map.geometry[i * 6 + 4]).toBeCloseTo(0.5, 6)
            expect(map.geometry[i * 6 + 5]).toBeCloseTo(0.5, 6)
        }

        // Every `<rect>` in the fixture, and nothing else is level.
        expect(flat).toBe(4603)
    })

    it('rejects a strand id too large for the instance buffer', () => {
        const text = readFixture()
        const broken = text.replace(/trackID="0"/g, `trackID="${MAX_STRAND_ID + 1}"`)

        expect(() => parseBands(broken)).toThrow(NonConformingDocument)
    })

    it('holds THICKNESS at the surveyed constant', () => {
        expect(THICKNESS).toBe(15)
    })

    /**
     * The names are what makes a strand a haplotype rather than an integer, and they are
     * the one field here that can be wrong without the picture changing at all: a name
     * table off by one row names the neighbouring haplotype, and every map drawn from it
     * looks exactly like a working one.
     */
    describe('strand names', () => {

        it('carries one name per strand, for every strand the document draws', () => {
            for (const text of [readFixture(), readTallFixture()]) {
                const map = parseBands(text)

                expect(map.strandNames).toHaveLength(map.strandCount)
                expect(map.strandNames.every(name => name.length > 0)).toBe(true)
            }
        })

        it('maps every strand id to the name it carries in the source text', () => {
            for (const text of [readFixture(), readTallFixture()]) {
                const map = parseBands(text)
                const spelled = namesInSource(text)

                expect(spelled.size).toBe(map.strandCount)

                for (const [id, name] of spelled) {
                    expect(map.strandNames[id]).toBe(name)
                }
            }
        })

        it('round-trips a four-part name verbatim, alongside a three-part one', () => {
            // The chr8 document spells 463 of its 464 names with four `#`-separated parts
            // and one with three, so any PanSN assumption is already false in this repo.
            // Pinned by hand as well as derived, because the derived check above would pass
            // just as happily against a parser that split and rejoined them.
            const map = parseBands(readTallFixture())

            expect(map.strandNames[0]).toBe('CHM13#0#chr8#0')
            expect(map.strandNames[1]).toBe('GRCh38#0#chr8')
            expect(map.strandNames[10]).toBe('HG00133#1#CM090052.1#0')
        })

        it('refuses a document that draws a band with no name on it', () => {
            // Same treatment as a band with no fill: the whole document, rather than a map
            // whose feeler answers "" for one haplotype and a name for the rest.
            const text = readFixture()

            expect(() => parseBands(text.replace(/ trackName="[^"]*"/, '')))
                .toThrow(NonConformingDocument)
        })
    })

    /**
     * The placement is the other field that can be wrong without the map changing at all:
     * an off-by-one placement table plots the neighbouring haplotype's ancestry, and the
     * cloud looks exactly as plausible either way. The unplaced count is the one number
     * here nothing may hard-code — it is 6 in the strip, 12 in the tall document and 99 in
     * `5520+`, so any constant is wrong for two of the three.
     */
    describe('pclai placements', () => {

        it('carries a placement slot and a score slot for every strand the document draws', () => {
            for (const text of [readFixture(), readTallFixture()]) {
                const map = parseBands(text)

                expect(map.strandPlacements).toHaveLength(map.strandCount)
                expect(map.strandScores).toHaveLength(map.strandCount)
            }
        })

        it('reads the unplaced count from the document rather than from a constant', () => {
            // 6 and 12. `5520+`, which the unit tests do not read, has 99 of them — which is
            // why this is a property of the document and not of the cohort.
            const strip = parseBands(readFixture())
            const tall = parseBands(readTallFixture())

            expect(unplaced(strip)).toBe(6)
            expect(unplaced(tall)).toBe(12)
            expect(placed(strip)).toBe(363)
            expect(placed(tall)).toBe(452)
        })

        it('gives every strand the placement its own bands spell out', () => {
            for (const text of [readFixture(), readTallFixture()]) {
                const map = parseBands(text)
                const spelled = placementsInSource(text)

                expect(spelled.size).toBe(map.strandCount)

                for (const [id, placement] of spelled) {
                    expect(map.strandPlacements[id]).toEqual(placement)
                }
            }
        })

        it('parses a placement to the three decimals the document publishes', () => {
            // Exactly, not approximately: the published quantum is 0.001 against a median
            // neighbour distance of 0.0028, so a placement rounded on the way in moves a dot
            // past its neighbours.
            const map = parseBands(readFixture())

            expect(map.strandPlacements[368]).toEqual({ x: -1.585, y: 0.12 })
            expect(map.strandScores[368]).toBe('995')
        })

        it('reads an unplaced strand as absent rather than as the origin', () => {
            // `pclaiX="None"`. Zero would be a position — and a plausible one, near the
            // middle of the cloud — where absence is the finding.
            const map = parseBands(readFixture())

            expect(map.strandPlacements[315]).toBeNull()
            expect(map.strandScores[315]).toBeNull()
        })

        it('refuses a document whose bands carry no placement at all', () => {
            // Same treatment as a band with no name: the whole document, rather than an
            // inset that silently plots nothing and reads as a locus where nobody is placed.
            const text = readFixture()

            expect(() => parseBands(text.replace(/ pclaiX="[^"]*"/g, '')))
                .toThrow(NonConformingDocument)
        })

        it('carries the score the document spells, including the ones that are not numbers', () => {
            // Every fixture places two strands and scores them `impainted` rather than with
            // an integer. Read as a number those two become NaN, and a confidence of NaN is
            // indistinguishable from a confidence of nothing.
            for (const text of [readFixture(), readTallFixture()]) {
                const map = parseBands(text)

                expect(map.strandScores.filter(score => 'impainted' === score)).toHaveLength(2)
            }
        })

        it('refuses a placement that is neither a number nor None', () => {
            const text = readFixture()

            expect(() => parseBands(text.replace(/pclaiX="-1.585"/g, 'pclaiX="left"')))
                .toThrow(NonConformingDocument)
        })
    })
})
