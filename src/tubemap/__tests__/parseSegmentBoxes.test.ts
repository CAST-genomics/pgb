/**
 * Same reason `parseBands.test.ts` exists: a mis-numbered regex group yields a plausible
 * rectangle, and a coordinate conversion applied twice yields boxes that are merely upside
 * down somewhere else. The numbers below are the ones #37 measured off the fixtures before
 * anything was built, so a change in the document's grammar shows up here as a count that
 * moved rather than as a picture nobody looked at closely enough.
 */

import { describe, expect, it } from 'vitest'
import { NonConformingTubeMap } from '../nonConformingTubeMap.ts'
import { parseBands } from '../parseBands.ts'
import { parseSegmentBoxes } from '../parseSegmentBoxes.ts'
import { readFixture, readPairedDocument } from './fixture.ts'

/** What the survey in #37 recorded for the committed document. */
const SURVEYED = {
    boxes: 75,
    width: { min: 18, median: 18, max: 77 },
    height: { min: 33, median: 5418, max: 5553 },
    sequence: { min: 1, median: 1, max: 130 }
}

/** min / median / max of a list, the shape the survey in #37 reported. */
function spread(values: number[]): { min: number, median: number, max: number } {
    const sorted = [...values].sort((a, b) => a - b)

    return { min: sorted[0], median: sorted[Math.floor(sorted.length / 2)], max: sorted[sorted.length - 1] }
}

describe('parseSegmentBoxes', () => {

    it('reproduces the surveyed box dimensions', () => {
        const boxes = parseSegmentBoxes(readFixture(), { x: 0, y: 0 })

        expect(boxes).toHaveLength(SURVEYED.boxes)
        expect(spread(boxes.map(box => box.width))).toEqual(SURVEYED.width)
        expect(spread(boxes.map(box => box.height))).toEqual(SURVEYED.height)
        expect(spread(boxes.map(box => box.sequence.length))).toEqual(SURVEYED.sequence)
    })

    it('gives every box a distinct id and a sequence', () => {
        const boxes = parseSegmentBoxes(readFixture(), { x: 0, y: 0 })

        expect(new Set(boxes.map(box => box.id)).size).toBe(boxes.length)

        for (const box of boxes) {
            expect(box.id).toMatch(/^\d+$/)
            expect(box.sequence).toMatch(/^[ACGT]+$/)
        }
    })

    it('translates by the centre it is given, and nothing else', () => {
        const text = readFixture()
        const origin = parseSegmentBoxes(text, { x: 0, y: 0 })
        const centred = parseSegmentBoxes(text, { x: 100, y: 40 })

        for (let i = 0; i < origin.length; i += 1) {
            expect(centred[i].x).toBeCloseTo(origin[i].x - 100, 9)
            // y points up once the centre is applied, so the top edge moves the other way.
            expect(centred[i].y).toBeCloseTo(origin[i].y + 40, 9)
            expect(centred[i].width).toBe(origin[i].width)
            expect(centred[i].height).toBe(origin[i].height)
        }
    })

    it('reads the top edge as the larger world y, since y points up', () => {
        const boxes = parseSegmentBoxes(readFixture(), { x: 0, y: 0 })

        // Every box has positive extent, and `y` names the edge the height descends from.
        for (const box of boxes) {
            expect(box.width).toBeGreaterThan(0)
            expect(box.height).toBeGreaterThan(0)
        }

        // The first box in the fixture: `M 11 20 Q 11 11 20 11 L 67 11 … L 76 5564 …`.
        expect(boxes[0].x).toBe(11)
        expect(boxes[0].y).toBe(-11)
        expect(boxes[0].width).toBe(65)
        expect(boxes[0].height).toBe(5553)
    })

    it('reads both spellings of the same rectangle', () => {
        // A box exactly 2·radius wide has no straight run along its top or bottom, so the
        // server omits the two horizontal `L` commands. 48 of the fixture's 75 boxes are
        // written that way, and they are every 1 bp variant in the document — the boxes it
        // would be least obvious were missing.
        const boxes = parseSegmentBoxes(readFixture(), { x: 0, y: 0 })
        const narrow = boxes.filter(box => box.width === 2 * box.radius)

        expect(narrow).toHaveLength(48)
        expect(boxes.length - narrow.length).toBe(27)
    })

    it('refuses the whole document when a box is off-grammar', () => {
        const text = readFixture()

        expect(() => parseSegmentBoxes(text.replace('fill-opacity: 0.4', 'fill-opacity: 0.5'), { x: 0, y: 0 }))
            .toThrow(NonConformingTubeMap)
    })

    it('refuses a box whose corner arithmetic does not close', () => {
        const text = readFixture()

        // The first box's opening `M 11 20`, which every other number in its outline is
        // checked against. Moved, the box is still a plausible path and no longer a rectangle.
        expect(() => parseSegmentBoxes(text.replace('d="M 11 20 Q 11 11', 'd="M 11 21 Q 11 11'), { x: 0, y: 0 }))
            .toThrow(NonConformingTubeMap)
    })

    it('refuses a document that drops a box from g.node', () => {
        const text = readFixture()
        // Not deleted — mangled into something the grammar cannot read, which is how a
        // silently absent variant would actually arrive.
        const broken = text.replace(' sequence="AGAGCCTGTCTTCTGCTTTTACACTTCTGGTGTCATCTTCCTTTTTTTT"', ' sequence=')

        expect(() => parseSegmentBoxes(broken, { x: 0, y: 0 })).toThrow(NonConformingTubeMap)
    })

    it('reads the corner radius and the stroke width off every box', () => {
        // Both are dimensions, and dimensions are read rather than assumed — the surveyed
        // values are what this finds, not what it requires.
        const boxes = parseSegmentBoxes(readFixture(), { x: 0, y: 0 })

        expect(new Set(boxes.map(box => box.radius))).toEqual(new Set([9]))
        expect(new Set(boxes.map(box => box.stroke))).toEqual(new Set([2]))
    })

    /**
     * The server spells one coordinate two ways inside a single box. This is verbatim from
     * node `141457` of `il7.json` (chr8:78,771,162-78,771,252), fetched 2026-08-18: the
     * outline's top half spells the left edge `4067.8571428571427` and its bottom half
     * spells the same edge `4067.857142857143` — two doubles one ulp apart, a relative
     * difference of 1.1e-16.
     *
     * Nothing about the rectangle is wrong; only the printing is. An exact `!==` on the
     * redundancy check therefore refused a well-formed document, and the error card blamed
     * the grammar for a difference four hundred million times smaller than a screen pixel.
     */
    it('accepts a box whose coordinates are spelled to different last digits', () => {
        const box = '<path id="181810314" d="'
            + 'M 4067.8571428571427 -40 Q 4067.8571428571427 -49 4076.8571428571427 -49 '
            + 'L 4128.857142857143 -49 Q 4137.857142857143 -49 4137.857142857143 -40 '
            + 'L 4137.857142857143 6920 Q 4137.857142857143 6929 4128.857142857143 6929 '
            + 'L 4076.857142857143 6929 Q 4067.857142857143 6929 4067.857142857143 6920 '
            + 'L 4067.857142857143 -40" sequence="ACGT" '
            + 'style="fill: rgb(255, 255, 255); fill-opacity: 0.4; stroke: rgb(0, 0, 0); stroke-width: 2px;"'

        const boxes = parseSegmentBoxes(`<g class="node">${box}</path></g>`, { x: 0, y: 0 })

        expect(boxes).toHaveLength(1)
        expect(boxes[0].width).toBeCloseTo(70, 9)
        expect(boxes[0].height).toBeCloseTo(6978, 9)
        expect(boxes[0].radius).toBe(9)
    })

    /**
     * The other way the server spells a box exactly as wide as its corners are round —
     * verbatim from segment `181810312` of chr8:78,771,162-78,771,252, rendered on their
     * `main` after PangenomeAPI#66. `parseSegmentBoxes.ts`'s header says why the string
     * came out this way; what matters here is that it did, and that the reader reads the
     * spelling it was given rather than deriving which one it should have been handed.
     */
    const LONG_WAY = '<path id="181810312" d="'
        + 'M 4079.571428571429 35 Q 4079.571428571429 26 4088.571428571429 26 '
        + 'L 4088.5714285714294 26 Q 4097.571428571429 26 4097.571428571429 35 '
        + 'L 4097.571428571429 6995 Q 4097.571428571429 7004 4088.5714285714294 7004 '
        + 'L 4088.571428571429 7004 Q 4079.571428571429 7004 4079.571428571429 6995 '
        + 'L 4079.571428571429 35" sequence="A" '
        + 'style="fill: rgb(255, 255, 255); fill-opacity: 0.4; stroke: rgb(0, 0, 0); stroke-width: 2px;"'

    /** One `<path>`, as a `g.node` the parser will read. */
    const asDocument = (box: string): string => `<g class="node">${box}</path></g>`

    it('reads a box as wide as its corners are round that spells its horizontal runs anyway', () => {
        const boxes = parseSegmentBoxes(asDocument(LONG_WAY), { x: 0, y: 0 })

        expect(boxes).toHaveLength(1)
        expect(boxes[0].width).toBeCloseTo(18, 9)
        expect(boxes[0].radius).toBe(9)
    })

    /** The invariant that replaced the prediction: the two runs stand or fall together.
     *  The bottom run alone is deleted, so this is the one edit under test. */
    it('refuses a box that spells one horizontal run and not the other', () => {
        const oneRun = LONG_WAY.replace('L 4088.571428571429 7004 ', '')

        expect(oneRun).not.toBe(LONG_WAY)
        expect(() => parseSegmentBoxes(asDocument(oneRun), { x: 0, y: 0 })).toThrow(NonConformingTubeMap)
    })

    /**
     * What the deleted prediction was also doing, kept as a check on the document instead.
     *
     * Omitting both runs asserts that the top-left corner ends where the top-right corner
     * begins. A box 70 units wide that omits them is not a rounded rectangle, and reading
     * it as one would draw a shape the document never described — so the corners are asked
     * to actually meet, the same way every other redundancy in the outline is checked.
     */
    it('refuses a box that omits its horizontal runs without its corners meeting', () => {
        const tooWide = LONG_WAY
            .replace(/4097\.571428571429/g, '4149.571428571429')
            .replace('L 4088.5714285714294 26 ', '')
            .replace('L 4088.571428571429 7004 ', '')

        expect(() => parseSegmentBoxes(asDocument(tooWide), { x: 0, y: 0 })).toThrow(/omits its horizontal edges/)
    })

    /**
     * The tolerance absorbs printing, not geometry. A whole unit off is a different shape
     * and stays refused — the check exists because a mis-numbered group yields a plausible
     * rectangle, and loosening it into meaninglessness would give that back.
     */
    it('still refuses a box that is off by a whole unit', () => {
        const text = readFixture()

        expect(() => parseSegmentBoxes(text.replace('d="M 11 20 Q 11 11', 'd="M 12 20 Q 12 11'), { x: 0, y: 0 }))
            .toThrow(NonConformingTubeMap)
    })

    it('refuses a document whose boxes carry no stroke width it can read', () => {
        const text = readFixture()

        expect(() => parseSegmentBoxes(text.replace('stroke-width: 2px', 'stroke-width: thin'), { x: 0, y: 0 }))
            .toThrow(NonConformingTubeMap)
    })
})

describe('the two parsers, on one document', () => {

    it('puts the boxes in the same centred world frame as the bands', () => {
        const map = parseBands(readFixture())
        const boxes = parseSegmentBoxes(readFixture(), map.centre)

        expect(boxes).toHaveLength(SURVEYED.boxes)

        // Inside the declared extent, like the bands — the camera frustum is built from
        // it, so a box outside it would be positioned somewhere the map is not.
        for (const box of boxes) {
            expect(box.x).toBeGreaterThanOrEqual(-map.content.width * 0.5 - 1)
            expect(box.x + box.width).toBeLessThanOrEqual(map.content.width * 0.5 + 1)
            expect(box.y).toBeLessThanOrEqual(map.content.height * 0.5 + 1)
            expect(box.y - box.height).toBeGreaterThanOrEqual(-map.content.height * 0.5 - 1)
        }
    })

    it('centres the boxes on the same origin the bands are centred on', () => {
        // Both frames come from the viewBox, so this is really asking whether the centre
        // travelled between the two parsers intact — the one thing that could put a
        // perfectly-parsed box over the wrong part of a perfectly-parsed map.
        const map = parseBands(readFixture())
        const boxes = parseSegmentBoxes(readFixture(), map.centre)

        const left = Math.min(...boxes.map(box => box.x))
        const right = Math.max(...boxes.map(box => box.x + box.width))

        expect(Math.abs(left + right)).toBeLessThan(map.content.width * 0.02)
    })
})

describe('a document rendered after PangenomeAPI#66', () => {

    /**
     * The corpus's post-#66 witness, and the one committed document that carries the
     * spelling #152 was about. The five fetched documents are pre-#66 renders and cannot
     * exhibit it; the paired documents were re-rendered on their `main` on 2026-09-01, and
     * exactly one box in the 90 bp region moved — `181810312`, which is 18 units wide with
     * radius 9 and now writes the two straight runs `18.000000000000455 - 18` leaves over.
     *
     * A reader that predicts the spelling from the width refuses this document whole.
     */
    it('reads the 90 bp region, whose narrowest box spells its horizontal runs', () => {
        const boxes = parseSegmentBoxes(readPairedDocument('stm-chr8-78771162-78771252'), { x: 0, y: 0 })

        expect(boxes).toHaveLength(9)

        // Five of the nine are as wide as their corners are round. Four come out exactly
        // 18 and are still written the short way; the fifth does not, and is written the
        // long way — which is the whole of what #66 changed, and the whole of why
        // predicting the spelling from the width was wrong.
        const narrow = boxes.filter(box => box.width < 2 * box.radius + 1)

        expect(narrow.map(box => box.id)).toEqual(['181810310', '181810311', '181810312', '181810315', '181810316'])
        expect(narrow.filter(box => box.width !== 2 * box.radius).map(box => box.id)).toEqual(['181810312'])
    })
})
