/**
 * The pad is a border, and a border only pads outward under `content-box`.
 *
 * `resizePlot` writes `.stm-pclai-plot`'s width as the *content* box — the coordinate frame
 * `plotCloud` projects the ramp's domain onto — and `PLOT_PAD` is a transparent border
 * outside it. PGB's `index.html` loads Bootstrap, whose reset is
 * `*,::after,::before{box-sizing:border-box}`, and under that the pad eats **inward**: the
 * frame becomes `size - 2 * PLOT_PAD` while the projection still spans `size`, so the cloud
 * overhangs by a whole pad and the widget's `overflow: hidden` shaves the bottom-right lobes
 * into half dots and half rings. That is what #123 shipped, and it is the exact symptom #123
 * set out to remove.
 *
 * It survived review because the two dev pages that mounted the viewer — `dev/tubemap.html`
 * and `dev/tubemap-panel.html` — load no Bootstrap, so the plot is `content-box` there by
 * the UA default and the picture is correct in the one place anybody looked at it.
 *
 * A shallow seam, and knowingly so: what is actually wrong in the failing case is a *layout*,
 * which needs a browser and the host page's cascade — jsdom computes neither. The failure was
 * measured end to end in Playwright, against a page carrying the reset: at the 900 px cap the
 * extreme dot's ink sat 15.95 px outside the plot's border box, and 12.88 px inside it once
 * this line was added. What is here is the one line whose deletion silently reinstates that,
 * and it is not a substitute for a browser harness that mounts the viewer under PGB's own
 * stylesheet. That harness now exists — `dev/tubemap-app.html`, driven by
 * `scripts/verify_pclai_pad.mjs` (#126) — and it is the one that measures the layout; this
 * stays as the cheap guard that runs in `npm test` and names the declaration.
 */

import { describe, expect, it } from 'vitest'
import { PLOT_PAD } from '../pclaiInset.ts'
import { SURFACE_STYLES } from '../surfaceStyles.ts'

/** The `.stm-pclai-plot` rule's body. */
function plotRule(): string {
    const body = /\.stm-pclai-plot\s*\{([^}]*)\}/.exec(SURFACE_STYLES)?.[1]

    expect(body, '.stm-pclai-plot has no rule in SURFACE_STYLES').toBeTruthy()

    return body as string
}

describe('the PCLAI plot sizes its content box', () => {

    it('states box-sizing rather than inheriting the host page\'s', () => {
        expect(plotRule()).toMatch(/box-sizing:\s*content-box/)
    })

    it('still puts the pad on as a border, which is what needs the content box', () => {
        expect(plotRule()).toMatch(new RegExp(`border:\\s*${PLOT_PAD}px solid transparent`))
    })
})
