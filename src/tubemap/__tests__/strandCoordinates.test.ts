/**
 * The projection is the one part of the inset that can be wrong while the picture stays
 * completely plausible. A cloud of 460 dots is a cloud whichever way up it is drawn, and
 * the only thing that says the ramp beneath it is a legend rather than a texture is that
 * a dot's own colour matches the colour under it — which nobody checks by looking at a
 * dot 3 px wide.
 *
 * So the two facts the ramp was measured for are pinned here: its domain, and which way y
 * goes. Both were derived once (`docs/adr/0003-passive-pclai-inset.md`) and neither is
 * re-derivable from the code.
 */

import { describe, expect, it } from 'vitest'
import { RAMP_DOMAIN, projectPlacement } from '../strandCoordinates.ts'

const SURFACE = { width: 216, height: 216 }

describe('RAMP_DOMAIN', () => {

    it('is the reference cloud’s extent, to the digits it was measured at', () => {
        // Changing these is a deliberate act: they are not a framing choice but a
        // measurement of `public/images/pca-chart-background.png`, and a different pair
        // makes the ramp a decoration that lies about the dots on it.
        expect(RAMP_DOMAIN.x.min).toBeCloseTo(-1.8129293612932906, 12)
        expect(RAMP_DOMAIN.x.max).toBeCloseTo(0.7856702103116423, 12)
        expect(RAMP_DOMAIN.y.min).toBeCloseTo(-1.4238203965523002, 12)
        expect(RAMP_DOMAIN.y.max).toBeCloseTo(1.509197752913014, 12)
    })
})

describe('projectPlacement', () => {

    it('puts the domain’s corners on the surface’s corners', () => {
        // Corners to corners is what makes the ramp exact with no crop arithmetic: the
        // image is stretched over the same box this maps onto.
        expect(projectPlacement({ x: RAMP_DOMAIN.x.min, y: RAMP_DOMAIN.y.min }, SURFACE))
            .toEqual({ x: 0, y: 0 })

        expect(projectPlacement({ x: RAMP_DOMAIN.x.max, y: RAMP_DOMAIN.y.max }, SURFACE))
            .toEqual({ x: SURFACE.width, y: SURFACE.height })
    })

    it('puts the middle of the domain in the middle of the surface', () => {
        const middle = {
            x: (RAMP_DOMAIN.x.min + RAMP_DOMAIN.x.max) * 0.5,
            y: (RAMP_DOMAIN.y.min + RAMP_DOMAIN.y.max) * 0.5
        }

        const at = projectPlacement(middle, SURFACE)

        expect(at.x).toBeCloseTo(SURFACE.width * 0.5, 9)
        expect(at.y).toBeCloseTo(SURFACE.height * 0.5, 9)
    })

    it('increases y downward', () => {
        // The whole of the ramp's correctness, in one assertion. Sampled against all 3,122
        // reference points this way round the ramp is 13.4 RGB units from each point's own
        // colour, and flipped it is 174.3 — so a projection that reads as the obvious fix
        // to an SVG-shaped bug would be the bug.
        const higher = projectPlacement({ x: 0, y: -1 }, SURFACE)
        const lower = projectPlacement({ x: 0, y: 1 }, SURFACE)

        expect(lower.y).toBeGreaterThan(higher.y)
    })

    it('does not clamp a placement outside the domain', () => {
        // Clamping would sit the dot on a colour that is not its own, which is exactly what
        // framing tight to the document was rejected for. The surface clips instead, and a
        // dot off the edge is a placement outside the reference cloud — which is a finding.
        const outside = projectPlacement({ x: RAMP_DOMAIN.x.min - RAMP_DOMAIN.x.max, y: 0 }, SURFACE)

        expect(outside.x).toBeLessThan(0)
    })

    it('scales with the surface it is given', () => {
        const wide = projectPlacement({ x: RAMP_DOMAIN.x.max, y: RAMP_DOMAIN.y.min }, { width: 512, height: 512 })

        expect(wide).toEqual({ x: 512, y: 0 })
    })
})
