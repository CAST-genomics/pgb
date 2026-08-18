// @vitest-environment node
/**
 * The parsers and the framing, against a document that is **taller than it is wide**.
 *
 * The rest of the corpus is one 5.6:1 strip, and that shape hid four defects until a user
 * opened a real node and looked (all fixed in #99, all invisible against a strip):
 *
 *  - `fitZoom` fitted the width rather than the map, so 40% of a tall map was on screen at
 *    the one zoom the clamp cannot go below;
 *  - the navigator's height had no ceiling, so its thumbnail came out 1086 px tall;
 *  - `parseSegmentBoxes` compared the outline's redundant coordinates exactly, and this
 *    document spells one box's left edge two ways;
 *  - and the panel, being a card over the graph, made all three worse by being small.
 *
 * What is asserted here is therefore not "the parser works" — `parseBands.test.ts` and
 * `parseSegmentBoxes.test.ts` do that — but the numbers **this shape** turns on, so that a
 * regression to any of those four shows up as a number that moved. The measurements are the
 * document's own, read off it on 2026-08-18 and pinned here.
 */

import { describe, expect, it } from 'vitest'
import { fitZoom, visibleContentRect } from '../bandCamera.ts'
import { parseBands } from '../parseBands.ts'
import { parseSegmentBoxes } from '../parseSegmentBoxes.ts'
import { readTallFixture } from './fixture.ts'

/** What the document measured when it was captured — `il7` node 141457. */
const SURVEYED = {
    content: { width: 4717.4285714285725, height: 7115 },
    bands: 1008,
    strands: 464,
    boxes: 9,
    /** Five 1 bp variants and four longer segments — the spread the tooltip shows. */
    sequenceLengths: [1, 1, 1, 1, 1, 64, 76, 89, 145]
}

describe('a document taller than it is wide', () => {

    it('is the shape the strip fixture cannot be', () => {
        const map = parseBands(readTallFixture())

        expect(map.content.width).toBeCloseTo(SURVEYED.content.width, 6)
        expect(map.content.height).toBeCloseTo(SURVEYED.content.height, 6)
        // The whole point of the file: portrait, where the other fixture is 5.6:1 landscape.
        expect(map.content.height).toBeGreaterThan(map.content.width)
    })

    it('parses to the bands and strands it was captured with', () => {
        const map = parseBands(readTallFixture())

        expect(map.bandCount).toBe(SURVEYED.bands)
        // 464 haplotypes — the full HPRC set, not the API's 8-colour fallback for an
        // unknown node, which is the failure ADR 0001 §5 exists to keep out of the panel.
        expect(map.strandCount).toBe(SURVEYED.strands)
    })

    /**
     * The document that broke exact comparison: the server spells one box's left edge
     * `4067.8571428571427` along the top of the rectangle and `4067.857142857143` along its
     * bottom — two doubles one ulp apart. `parseSegmentBoxes.test.ts` pins that box
     * verbatim; this holds the whole real document to parsing, so the tolerance is exercised
     * against what the server actually sends.
     */
    it('reads every segment box, whichever way the server spelled its coordinates', () => {
        const map = parseBands(readTallFixture())
        const boxes = parseSegmentBoxes(readTallFixture(), map.centre)

        expect(boxes).toHaveLength(SURVEYED.boxes)
        expect(boxes.map(box => box.sequence.length).sort((a, b) => a - b)).toEqual(SURVEYED.sequenceLengths)
        expect(new Set(boxes.map(box => box.radius))).toEqual(new Set([9]))
    })

    it('carries the two spellings of one edge, so the fixture keeps proving the case', () => {
        // Guards the fixture, not the parser: a re-capture that smoothed this out would
        // leave the tolerance untested by any real document and nothing would say so.
        expect(readTallFixture()).toContain('4067.8571428571427')
        expect(readTallFixture()).toContain('4067.857142857143')
    })

    it('is wholly on screen at fit, which is what the navigator means by fit', () => {
        const { content } = parseBands(readTallFixture())
        const viewport = { width: 1299, height: 791 }
        const zoom = fitZoom(content, viewport)

        // Height binds, where a strip's width does.
        expect(zoom).toBeCloseTo(viewport.height / content.height, 12)
        expect(zoom).toBeLessThan(viewport.width / content.width)

        const visible = visibleContentRect({ x: 0, y: 0, zoom }, viewport, content)

        expect(visible.y).toBeLessThanOrEqual(0)
        expect(visible.y + visible.height).toBeGreaterThanOrEqual(content.height)
    })
})
