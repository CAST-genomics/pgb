/**
 * The parser is the one part of the renderer that can be silently wrong without looking
 * wrong: a mis-numbered regex group yields plausible geometry, and a coordinate
 * conversion applied twice yields a picture that is merely upside down somewhere else.
 *
 * These run against the committed fixture and check the counts the node survey
 * recorded, plus the conversion this copy adds.
 */

import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { NonConformingDocument } from '../documentGrammar.ts'
import {
    FLAT,
    LEFTWARD,
    MAX_STRAND_ID,
    RIGHTWARD,
    THICKNESS,
    bandDirection,
    observedDirection,
    parseBands
} from '../parseBands.ts'
import {
    EVERY_FIXTURE_PATH,
    FIXTURE_PATH,
    INVERTED_FIXTURE_PATH,
    TALL_FIXTURE_PATH,
    readEveryFixture,
    readFixture,
    readInvertedFixture,
    readTallFixture
} from './fixture.ts'

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

/** Which way each drawable in `g.track` runs, in document order, read straight off the text
 *  rather than from the parser — a `<rect>` rightward by construction, a `<path>` by which
 *  of its endpoints is further left. The parser's own answer is checked against all 11,586
 *  of them rather than against the handful worth typing out. */
function directionsInSource(text: string): string[] {
    const trackGroupEnd = text.indexOf('<g class="node"')
    const trackGroup = -1 === trackGroupEnd ? text : text.slice(0, trackGroupEnd)
    const directions: string[] = []

    for (const match of trackGroup.matchAll(/<rect |<path d="M ([^"]*?) V /g)) {
        if (undefined === match[1]) {
            directions.push('rightward')

            continue
        }

        // `M x0 y0 C cx y0 cx y1 x1 y1` — the seventh number is where the forward edge ends.
        const numbers = match[1].trim().split(/[\sC]+/).map(Number)

        directions.push(numbers[6] < numbers[0] ? 'leftward' : 'rightward')
    }

    return directions
}

/** How many of a parsed map's bands run leftward, over the whole map or over one strand. */
function leftward(
    map: { bandDirections: Uint8Array, strandIds: Uint16Array, bandCount: number },
    strandId?: number
): number {
    let total = 0

    for (let i = 0; i < map.bandCount; i += 1) {
        const counts = LEFTWARD === map.bandDirections[i]
            && (undefined === strandId || strandId === map.strandIds[i])

        total += counts ? 1 : 0
    }

    return total
}

/** The inverted document's geometry as it first parsed, 2026-08-26 — the only one of the
 *  five with no earlier reading to be identical to. */
const INVERTED_GEOMETRY = 'cb6937dd96fdc3d6a084410cef5d8557b4c9f8a63e7ae39276970a0caa18a261'

/** How many flat bands the inverted document draws before the first of its connectors: it
 *  draws all 5638 of its `<rect>` elements first, so band 5638 is the first `<path>`. */
const INVERTED_FLAT_BANDS = 5638

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
     * Direction is the regularity this parser mistook for a rule: every band in the four
     * documents committed before 2026-08-25 runs left to right, and the assertion saying
     * every band must was refusing an inversion polymorphism. ADR `0004` withdrew it.
     *
     * What replaces it is a datum rather than nothing — the direction is read per band,
     * where it is observed, and the geometry is normalized so that no downstream consumer
     * inherits a signed width.
     */
    describe('band direction', () => {

        it('draws the inverted document rather than refusing it', () => {
            const map = parseBands(readInvertedFixture())

            // 5638 rects and 5948 connectors, 3771 of the connectors running right to left.
            expect(map.bandCount).toBe(11586)
            expect(map.strandCount).toBe(463)
        })

        it('stores a leftward band with a positive width, like every other band', () => {
            const map = parseBands(readInvertedFixture())

            for (let i = 0; i < map.bandCount; i += 1) {
                const [, , width, , uTop, uBottom] = Array.from(map.geometry.subarray(i * 6, i * 6 + 6))

                expect(width).toBeGreaterThan(0)

                // Normalized against a positive width, the control fractions stay inside
                // the same middle band they occupy in a rightward document. Against a
                // signed width they would go negative, which is the shape of the bug the
                // rejected alternative would have shipped.
                for (const u of [uTop, uBottom]) {
                    expect(u).toBeGreaterThanOrEqual(0.3 - 1e-6)
                    expect(u).toBeLessThanOrEqual(0.7 + 1e-6)
                }
            }
        })

        it('carries a direction for every band, saying what the document draws', () => {
            const text = readInvertedFixture()
            const map = parseBands(text)
            const spelled = directionsInSource(text)

            expect(map.bandDirections).toHaveLength(map.bandCount)
            expect(spelled).toHaveLength(map.bandCount)

            for (let i = 0; i < map.bandCount; i += 1) {
                expect(bandDirection(map.bandDirections, i)).toBe(spelled[i])
            }
        })

        it('finds the surveyed count of leftward bands, and none where there are none', () => {
            expect(leftward(parseBands(readInvertedFixture()))).toBe(3771)
            expect(leftward(parseBands(readFixture()))).toBe(0)
            expect(leftward(parseBands(readTallFixture()))).toBe(0)
        })

        it('has the reference running leftward, with a strand of the document running the other way', () => {
            // GRCh38 runs with the 297 here and CHM13 with the 166, so the document's
            // x-axis is oriented along neither and any test assuming the reference runs
            // with the axis is wrong. Aggregated from the bands at read time, which is the
            // only place direction may be aggregated — that no strand mixes the two is a
            // regularity of one document, not a rule.
            const map = parseBands(readInvertedFixture())
            const leftwardBandsOf = (name: string): number => {
                // This document suffixes its names with the interval each haplotype covers
                // — `GRCh38#0#chr8[10078919-10080674]` — which is one more reason nothing
                // parses a strand name. Matched by prefix here, and only here.
                const id = map.strandNames.findIndex(spelled => spelled.startsWith(name))

                expect(id, name).toBeGreaterThanOrEqual(0)

                return leftward(map, id)
            }

            expect(leftwardBandsOf('GRCh38#0#chr8')).toBeGreaterThan(0)
            expect(leftwardBandsOf('CHM13#0#chr8#0')).toBe(0)
        })

        it('reads a flat band as rightward, which is the only way a rect is drawn', () => {
            // A `<rect>` has a positive width by construction, so it says nothing about the
            // direction of the haplotype passing through it: this is the degenerate case of
            // direction the same way it is the degenerate case of the curve. It means an
            // inverted strand's bands are not all leftward — its connectors are — and
            // whatever aggregates direction over a strand has to know that.
            const map = parseBands(readInvertedFixture())

            for (let i = 0; i < INVERTED_FLAT_BANDS; i += 1) {
                expect(bandDirection(map.bandDirections, i)).toBe('rightward')
            }
        })

        it('observes no direction at all in a flat band, which is not the same as rightward', () => {
            // The distinction `bandDirection` cannot make and an aggregate cannot do
            // without: 5638 of this document's bands are `<rect>` elements, and every one
            // of the 297 leftward haplotypes draws some of them. Counted as rightward
            // observations they would make all 297 read as mixing both directions —
            // `inversion.ts` is what would get that wrong, and this is the byte that stops
            // it.
            const map = parseBands(readInvertedFixture())

            for (let i = 0; i < INVERTED_FLAT_BANDS; i += 1) {
                expect(map.bandDirections[i]).toBe(FLAT)
                expect(observedDirection(map.bandDirections, i)).toBeNull()
            }

            expect(observedDirection(map.bandDirections, INVERTED_FLAT_BANDS)).toBe('leftward')
            expect(observedDirection(Uint8Array.of(RIGHTWARD), 0)).toBe('rightward')
        })

        it('normalizes a leftward band onto the curve the document draws', () => {
            // The reversal has to swap the ordinates with the abscissae: the edge that was
            // drawn from (x0, y0) to (x1, y1) is stored from (x1, y1) to (x0, y0), and a
            // band whose ordinates did not travel with its endpoints would slope the wrong
            // way — a picture that still looks like a tube map.
            const text = readInvertedFixture()
            const map = parseBands(text)
            const centre = map.centre
            const first = /<path d="M ([^"]*?) V /.exec(
                text.slice(0, text.indexOf('<g class="node"'))
            )
            const numbers = (first as RegExpExecArray)[1].trim().split(/[\sC]+/).map(Number)
            const at = map.bandDirections.indexOf(LEFTWARD) * 6

            // The first `<path>` in the document is band INVERTED_FLAT_BANDS, and it is one
            // of the 3771 running leftward.
            expect(numbers[6]).toBeLessThan(numbers[0])
            expect(map.bandDirections.indexOf(LEFTWARD)).toBe(INVERTED_FLAT_BANDS)

            expect(map.geometry[at]).toBeCloseTo(numbers[6] - centre.x, 3)
            expect(map.geometry[at + 1]).toBeCloseTo(centre.y - numbers[7], 3)
            expect(map.geometry[at + 2]).toBeCloseTo(numbers[0] - numbers[6], 3)
            expect(map.geometry[at + 3]).toBeCloseTo(centre.y - numbers[1], 3)

            // Both control abscissae are the same number in the document; read against the
            // normalized span they are `1 - u`, the mirror of what a rightward band gets.
            expect(map.geometry[at + 4]).toBeCloseTo(
                (numbers[2] - numbers[6]) / (numbers[0] - numbers[6]), 5
            )
        })

        it('still refuses a band of no width, which the withdrawn assertion also caught', () => {
            // `x1 > x0` refused two things at once, and only one of them was direction. A
            // band with no span has no width to normalize its control abscissae against.
            const text = readFixture()
            const flat = '<path d="M 100 200 C 150 200 150 260 100 260 V 275 C 150 275 150 215 100 215 Z"'

            expect(() => parseBands(text.replace(/<path d="[^"]*"/, flat)))
                .toThrow(NonConformingDocument)
        })

        it('spells the two directions in the vocabulary CONTEXT.md fixes', () => {
            expect(bandDirection(Uint8Array.of(RIGHTWARD), 0)).toBe('rightward')
            expect(bandDirection(Uint8Array.of(LEFTWARD), 0)).toBe('leftward')
        })
    })

    /**
     * The four documents committed before direction existed all drew, and this is what says
     * that adding it moved none of them. A digest rather than a spot check, because the
     * failure being guarded against — a normalization that fires on a band it should not —
     * would move a handful of bands out of tens of thousands and every count would still
     * agree.
     *
     * These were taken from the parser as it stood on 2026-08-25, before the `x1 > x0`
     * assertion came out. The fifth is the inverted document, which had no geometry to be
     * identical to and is pinned here from the first run that drew it.
     */
    describe('the geometry each document parses to', () => {

        it('is unchanged for every document in the corpus', () => {
            // Keyed by the same constants `readEveryFixture` walks, so a fixture added to
            // the corpus without a digest fails as a missing key rather than as `undefined`.
            const pinned = new Map([
                [FIXTURE_PATH, 'f33d67d5d98b833a44d12702d6d4f4522404165d0bd8f9c264fb9e0d4fbe84f9'],
                [TALL_FIXTURE_PATH, '18ccb2f47c9758dd2639c47a6fc93fbfa56ee99165cbf84dc4490edbb99c83d6'],
                [EVERY_FIXTURE_PATH[2], '2b75574a22dc57d9496026bce90fe5b332d89123e686e63107686859a9c2a2a8'],
                [EVERY_FIXTURE_PATH[3], '5c9f1adf855c7a46b827be4d62e5d954736634e51a916eb163405a045c195096'],
                [INVERTED_FIXTURE_PATH, INVERTED_GEOMETRY]
            ])

            expect(pinned.size).toBe(EVERY_FIXTURE_PATH.length)

            for (const { path, text } of readEveryFixture()) {
                const geometry = parseBands(text).geometry
                const digest = createHash('sha256')
                    .update(new Uint8Array(geometry.buffer, 0, geometry.byteLength))
                    .digest('hex')

                expect(digest, path).toBe(pinned.get(path))
            }
        })
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

        it('draws a document that says nothing about ancestry as a document that places nobody', () => {
            // Not a refusal. The survey behind ADR 0002 covered geometry and fill, not these
            // three attributes, and every document committed here is HPRC — so a tube map
            // without them is a map this renderer has no evidence it cannot draw. It draws,
            // and its cloud is empty.
            const text = readFixture().replace(/ pclai[XY]="[^"]*"/g, '').replace(/ pclaiScore="[^"]*"/g, '')
            const map = parseBands(text)

            expect(map.bandCount).toBe(SURVEYED.bands)
            expect(map.strandPlacements.every(placement => null === placement)).toBe(true)
            expect(map.strandScores.every(score => null === score)).toBe(true)
        })

        it('refuses a band placed on one axis and not the other', () => {
            // Half a coordinate is not a position, and the two absences this parser accepts
            // — no attributes at all, and `None` on both — are both whole answers.
            const text = readFixture()

            expect(() => parseBands(text.replace(/pclaiY="0.12"/g, 'pclaiY="None"')))
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
