/**
 * Every way the gate can fire, driven through a real document and read as the researcher
 * reads it.
 *
 * `parseBands.test.ts` and `parseSegmentBoxes.test.ts` check *that* each of these refuses.
 * What is checked here is the other half of the promise ADR `0002` made in exchange for
 * interpreting the server's geometry: that a refusal arrives as something a person can act
 * on. A gate that fires correctly and reports `undefined is not a function` has kept the
 * wrong map off the screen and told nobody why — and the error state is the only arm of
 * this design that produces a bug report (`CONTEXT.md` #1).
 *
 * So each corruption is run end to end, through `describeFailure`, and the sentence that
 * comes out is what is asserted. It is a table rather than one test per reason because the
 * property is the same for all of them, and because a reason added later that is left out
 * of the table is a reason nobody checked.
 */

import { describe, expect, it } from 'vitest'
import { NonConformingTubeMap } from '../nonConformingTubeMap.ts'
import { describeFailure } from '../loadFailure.ts'
import { MAX_STRAND_ID, parseBands } from '../parseBands.ts'
import { parseSegmentBoxes } from '../parseSegmentBoxes.ts'
import { readFixture } from './fixture.ts'

/** One straight band and one segment box out of the fixture, as the document spells them. */
const RECT = '<rect x="0" y="5540" width="68" height="15"'
const BOX = 'M 11 20 Q 11 11 20 11 L 67 11 Q 76 11 76 20 L 76 5555 Q 76 5564 67 5564 L 20 5564 Q 11 5564 11 5555 L 11 20'

/** Read the whole document the way the surface does: bands, then boxes, both able to refuse. */
function read(text: string): void {
    const map = parseBands(text)
    parseSegmentBoxes(text, map.centre)
}

const CORRUPTIONS: Array<{ what: string, corrupt: (text: string) => string }> = [
    {
        what: 'the response is not an SVG at all',
        corrupt: () => '<!doctype html><html><body>500 Internal Server Error</body></html>'
    },
    {
        what: 'the document declares no viewBox',
        corrupt: text => text.replace(/ viewBox="[^"]*"/, '')
    },
    {
        what: 'the viewBox cannot be read',
        corrupt: text => text.replace(/viewBox="[^"]*"/, 'viewBox="0 -80 wide"')
    },
    {
        what: 'g.track holds nothing drawable',
        corrupt: text => text.slice(0, text.indexOf('<rect')) + text.slice(text.indexOf('<g class="node"'))
    },
    {
        what: 'a band is the wrong height',
        corrupt: text => text.replace(RECT, '<rect x="0" y="5540" width="68" height="16"')
    },
    {
        what: 'a band has no width',
        corrupt: text => text.replace(RECT, '<rect x="0" y="5540" width="0" height="15"')
    },
    {
        what: 'a trackID is too large for the instance buffer',
        corrupt: text => text.replace(/trackID="0"/g, `trackID="${MAX_STRAND_ID + 1}"`)
    },
    {
        what: 'the strand ids are sparse',
        corrupt: text => text.replace(/trackID="0"/g, 'trackID="9000"')
    },
    {
        what: 'an element in g.track is off the band grammar',
        corrupt: text => text.replace(RECT, '<rect x="0" y="5540" width="68" height="15" rx="4"')
    },
    {
        what: 'a curved band has no width',
        // Grammatical in every other way — the ordinates repeat, the return edge is offset
        // by THICKNESS — and it begins and ends at the same abscissa.
        corrupt: text => text.replace(
            /<path d="[^"]*"/,
            '<path d="M 100 200 C 150 200 150 260 100 260 V 275 C 150 275 150 215 100 215 Z"'
        )
    },
    {
        what: 'a curved band contradicts itself',
        corrupt: text => text.replace(/C (-?[\d.]+) /, 'C $1.5 ')
    },
    {
        what: 'a segment box has a degenerate corner radius',
        corrupt: text => text.replace(BOX, BOX.replace(/ 20 /g, ' 11 '))
    },
    {
        what: 'a segment box has no stroke',
        corrupt: text => text.replace('stroke-width: 2px;', 'stroke-width: 0px;')
    },
    {
        what: 'an element in g.node is off the box grammar',
        corrupt: text => text.replace(BOX, 'M 11 20 L 76 5564 Z')
    }
]

describe('what the researcher is told when a document is refused', () => {

    for (const { what, corrupt } of CORRUPTIONS) {

        it(`says something actionable when ${what}`, () => {
            let thrown: unknown

            try {
                read(corrupt(readFixture()))
            } catch (error) {
                thrown = error
            }

            // The corruption has to actually reach the gate, or the sentence below is a
            // sentence about a document that was drawn.
            expect(thrown, `${what} was accepted`).toBeInstanceOf(NonConformingTubeMap)

            const failure = describeFailure('/tube-map.svg', thrown)

            // Told apart from a fetch that failed, because the two are fixed differently.
            expect(failure.kind).toBe('undrawable')

            // A sentence, not a fragment of a trace: opens with a capital, closes with a
            // stop, and carries no stack frames.
            expect(failure.reason).toMatch(/^[A-Z]/)
            expect(failure.reason).toMatch(/\.$/)
            expect(failure.reason).not.toMatch(/\n|\s{2}|at .*\(/)

            // And says more than the heading already did. Most reasons name the count,
            // coordinate or id that was wrong; the few that do not — no viewBox, nothing
            // drawable, not an SVG — are statements about the whole document, and there
            // is no number in them to name.
            expect(failure.reason).not.toBe(failure.heading)
        })
    }

    it('gives every reason its own words', () => {
        const reasons = new Set<string>()

        for (const { corrupt } of CORRUPTIONS) {
            try {
                read(corrupt(readFixture()))
            } catch (error) {
                reasons.add(describeFailure('/tube-map.svg', error).reason)
            }
        }

        expect(reasons.size).toBe(CORRUPTIONS.length)
    })

    it('draws the conforming document it was corrupted from', () => {
        // The gate is only worth having if it lets the real thing through, and every
        // corruption above is one edit away from this.
        expect(() => read(readFixture())).not.toThrow()
    })
})
