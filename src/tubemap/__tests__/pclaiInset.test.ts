/**
 * The cloud is judged by looking at it — a lobe structure that fails to appear is not
 * something a unit test can see, and neither is a ramp that sits a pixel off.
 *
 * What is covered here is the one decision inside the inset that can be silently wrong:
 * which strands enter the plot and where each one goes. A document places 363 of its 369
 * haplotypes and leaves 6 nowhere, and a plot that quietly draws the missing 6 at the
 * origin — or that drops the wrong 6 — is a cloud that looks exactly as convincing as the
 * true one while reporting a position for a haplotype the inference declined to place.
 *
 * Follows `segmentOverlay.test.ts`: the exported function, never the overlay's DOM.
 */

import { describe, expect, it } from 'vitest'
import { plotCloud } from '../pclaiInset.ts'
import { parseBands, type ParsedMap } from '../parseBands.ts'
import { RAMP_DOMAIN, projectPlacement } from '../strandCoordinates.ts'
import { readFixture, readTallFixture } from './fixture.ts'

const SURFACE = { width: 216, height: 216 }

describe('plotCloud', () => {

    it('draws one dot for every placed strand and none for the rest', () => {
        // 363 of 369, and 452 of 464. The counts are the documents' own — see
        // `parseBands.test.ts`, where they are read off the source text.
        const strip = parseBands(readFixture())
        const tall = parseBands(readTallFixture())

        expect(plotCloud(strip, SURFACE)).toHaveLength(363)
        expect(plotCloud(tall, SURFACE)).toHaveLength(452)
    })

    it('leaves every unplaced strand out of the plot entirely', () => {
        const map = parseBands(readFixture())
        const plotted = new Set(plotCloud(map, SURFACE).map(dot => dot.strandId))

        for (let id = 0; id < map.strandCount; id += 1) {
            expect(plotted.has(id)).toBe(null !== map.strandPlacements[id])
        }
    })

    it('puts each dot where the projection puts its placement', () => {
        const map = parseBands(readFixture())

        for (const dot of plotCloud(map, SURFACE)) {
            const placement = map.strandPlacements[dot.strandId]

            expect(placement).not.toBeNull()
            expect(dot.at).toEqual(projectPlacement(placement as { x: number, y: number }, SURFACE))
        }
    })

    it('gives every dot the colour the document draws that strand in', () => {
        // The dots, the strands in the map and PGB's 3D graph all speak one colour
        // vocabulary; a dot recoloured on the way in would be the inset saying something
        // about ancestry that the map beside it does not say.
        const map = parseBands(readFixture())

        for (const dot of plotCloud(map, SURFACE)) {
            const at = dot.strandId * 3

            expect(dot.color)
                .toBe(`rgb(${map.strandColors[at]}, ${map.strandColors[at + 1]}, ${map.strandColors[at + 2]})`)
        }
    })

    it('keeps the whole of a real document inside the surface', () => {
        // Not a property of the projection — which does not clamp — but of the cohort: every
        // strand these documents place sits inside the reference cloud the ramp is drawn
        // over. A document that ever fails this is one whose coordinates are on a different
        // scale, and the picture would be a cloud pressed against one edge.
        for (const text of [readFixture(), readTallFixture()]) {
            for (const dot of plotCloud(parseBands(text), SURFACE)) {
                expect(dot.at.x).toBeGreaterThanOrEqual(0)
                expect(dot.at.x).toBeLessThanOrEqual(SURFACE.width)
                expect(dot.at.y).toBeGreaterThanOrEqual(0)
                expect(dot.at.y).toBeLessThanOrEqual(SURFACE.height)
            }
        }
    })

    it('plots a document that places nobody as an empty cloud', () => {
        const map: ParsedMap = {
            ...parseBands(readFixture()),
            strandPlacements: new Array(369).fill(null)
        }

        expect(plotCloud(map, SURFACE)).toHaveLength(0)
    })

    it('reads y downward, so the lower placement is the lower dot', () => {
        // The inset's own restatement of `strandCoordinates`' measurement, made through the
        // function the inset actually calls — the projection could be right and the plot
        // could still flip it on the way to a style attribute.
        const map: ParsedMap = {
            ...parseBands(readFixture()),
            strandPlacements: [
                { x: 0, y: RAMP_DOMAIN.y.min },
                { x: 0, y: RAMP_DOMAIN.y.max },
                ...new Array(367).fill(null)
            ]
        }

        const [top, bottom] = plotCloud(map, SURFACE)

        expect(top.at.y).toBeLessThan(bottom.at.y)
    })
})
