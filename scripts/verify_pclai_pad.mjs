/**
 * The PCLAI pad pads outward — measured under the cascade the app actually ships (#126).
 *
 * `PLOT_PAD` is breathing room *inside* the coordinate frame, put on as a transparent border
 * outside `.stm-pclai-plot`'s content box: `resizePlot` writes the content box, `plotCloud`
 * projects the ramp's domain over exactly that box, and the border is what keeps a haplotype
 * at the domain's extreme clear of the widget's edge and its resize grip.
 *
 * That only holds under `content-box`. PGB's `index.html` loads Bootstrap, whose reset is
 * `*,::after,::before{box-sizing:border-box}`, and under it the pad eats **inward**: the frame
 * collapses to `size - 2 * PLOT_PAD` while the projection still spans `size`, so the cloud
 * overhangs the bottom-right by a whole pad and the widget's `overflow: hidden` shaves the
 * lobes into half dots and half rings. That is the bug #123 shipped and #125 fixed, and it was
 * invisible to every check we had, because every check drives `dev/tubemap.html` — which loads
 * no Bootstrap, and where the bug therefore cannot occur.
 *
 * So this script's host is the point of it. `dev/tubemap-app.html` is `dev/tubemap-panel.html`
 * with `index.html`'s `<link>` tags and nothing else changed; check 1 below refuses to go on
 * unless the reset is actually in force, so the harness cannot quietly stop being the thing it
 * exists to be.
 *
 * Two measurements, because they fail in different ways:
 *
 * - **The frame is the box the projection spans.** `resizePlot`'s intent is `style.width`;
 *   what exists is the used content width. Under the reset without `content-box` those differ
 *   by `2 * PLOT_PAD` — the whole bug, stated as one comparison, before any dot is looked at.
 * - **No dot's ink leaves the plot.** The consequence, read off the rendered boxes: every dot
 *   rect against the plot's border box, and against the widget that clips it.
 *
 * **Headless, unlike the rest of `scripts/verify_*.mjs`.** Those read the pick pass, which
 * headless chromium rasterizes in software; this reads *layout* of DOM elements, which is the
 * same in both and wants to be cheap enough to run on every change.
 *
 * The viewport is large enough that `MAX_PLOT_SIZE` binds before the panel does, so "the cap"
 * is the cap the constant names — the size the overhang was measured at in #125.
 *
 *     node scripts/verify_pclai_pad.mjs   # with `npm run dev` already up
 */

import { chromium } from 'playwright'

const URL = 'http://localhost:5173/dev/tubemap-app.html'

/** The inset's own numbers, restated: `pclaiInset.ts`. */
const PLOT_PAD = 16
const MAX_PLOT_SIZE = 900

/** Big enough that `fitPlotSize`'s ceiling binds before the panel's own size does. */
const VIEWPORT = { width: 1600, height: 1400 }
const SHOT = 'notes/sequence-tube-map/measurements/pclai-pad-app-cascade.png'

const results = []
const check = (name, passed, detail) => {
    results.push({ name, passed })
    console.log(`${true === passed ? '  ok  ' : '  FAIL'}  ${name}${undefined === detail ? '' : ` — ${detail}`}`)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: VIEWPORT })

await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForFunction(() => document.querySelector('.stm-status')?.hidden === true)
await page.waitForSelector('.stm-pclai-dot')
// The panel sizes itself to its host and the surface re-fits; the widget is laid out again
// behind that, and the numbers below are only worth reading once it has stopped moving.
await page.waitForTimeout(600)

/**
 * What the plot is, right now — intent against reality.
 *
 * `style.width` is what `resizePlot` asked for and what `plotCloud` projected over. `frame` is
 * the content box that actually exists, and `content-box` is what keeps the two the same
 * number. It is read as `clientWidth` — the padding box, which with no padding is the content
 * box — rather than from `getComputedStyle`, whose `width` resolves to whichever box
 * `box-sizing` names and so reports the *asked-for* number in exactly the case that is broken.
 */
const plot = () => page.evaluate(() => {
    const element = document.querySelector('.stm-pclai-plot')
    const style = getComputedStyle(element)

    return {
        sizing: style.boxSizing,
        padding: parseFloat(style.paddingLeft),
        wanted: parseFloat(element.style.width),
        frame: element.clientWidth,
        border: element.offsetWidth,
        borderTop: parseFloat(style.borderTopWidth)
    }
})

/** How far the cloud's ink reaches past the boxes that are supposed to contain it. */
const overhang = () => page.evaluate(() => {
    const past = (dot, box) => Math.max(
        box.left - dot.left, box.top - dot.top, dot.right - box.right, dot.bottom - box.bottom)

    const frame = document.querySelector('.stm-pclai-plot').getBoundingClientRect()
    const widget = document.querySelector('.stm-pclai-inset').getBoundingClientRect()
    const dots = [...document.querySelectorAll('.stm-pclai-dot')]
        .map(dot => dot.getBoundingClientRect())

    return {
        dots: dots.length,
        // Negative is clearance: how far the outermost dot still sits inside the box.
        plot: dots.reduce((worst, dot) => Math.max(worst, past(dot, frame)), -Infinity),
        widget: dots.reduce((worst, dot) => Math.max(worst, past(dot, widget)), -Infinity)
    }
})

/** Pull the grip down and right until the plot stops growing. */
async function stretchToCap() {
    const grip = await page.locator('.stm-pclai-grip').boundingBox()
    const from = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }

    await page.mouse.move(from.x, from.y)
    await page.mouse.down()

    for (let step = 1; step <= 20; step += 1) {
        await page.mouse.move(from.x + step * 60, from.y + step * 60)
    }

    await page.mouse.up()
    await page.waitForTimeout(300)
}

// ── 1. The harness is the harness ──────────────────────────────────────────────────────
//
// Everything below is a statement about PGB's cascade, and is worth nothing if the page has
// stopped carrying it. Bootstrap's reset is the specific thing #123 died on, so the specific
// thing to confirm is that `*` really is `border-box` here.
const reset = await page.evaluate(() => ({
    body: getComputedStyle(document.body).boxSizing,
    // A bare element with no rule of its own: whatever the universal selector says.
    bare: (() => {
        const probe = document.createElement('div')
        document.body.append(probe)
        const sizing = getComputedStyle(probe).boxSizing
        probe.remove()

        return sizing
    })()
}))

check('the page carries the app\'s reset', 'border-box' === reset.bare, `an unstyled div is ${reset.bare}`)

if ('border-box' !== reset.bare) {
    console.log('\n  the host page is not the app cascade — nothing below is a test of anything')
    await browser.close()
    process.exit(1)
}

// ── 2. At the opening size, the frame is the box the projection spans ──────────────────
//
// Not `PLOT_SIZE`, and deliberately not asserted to be: inside the panel the widget opens at
// `MIN_PLOT_SIZE`, because `resizePlot(PLOT_SIZE)` runs at mount — when the card has not yet
// been sized to its host, so `fitPlotSize` has nothing to fit into — and nothing re-runs it
// afterwards. Reproduces identically on `dev/tubemap-panel.html`, so it is not the cascade's
// doing and not this script's business; the frame is read rather than predicted, and the two
// sizes measured here are whatever the widget actually opens and stretches to.
const opened = await plot()

check('the plot states its own box-sizing', 'content-box' === opened.sizing, opened.sizing)
check('the pad is on as a border', PLOT_PAD === opened.borderTop && 0 === opened.padding,
    `border ${opened.borderTop}px, padding ${opened.padding}px`)
check('the frame is what resizePlot asked for', opened.wanted === opened.frame,
    `asked ${opened.wanted}, frame ${opened.frame}`)
check('and the pad is added outward', opened.border === opened.wanted + 2 * PLOT_PAD,
    `asked ${opened.wanted} + 2 x ${PLOT_PAD} = ${opened.border} on screen`)

const atRest = await overhang()

check('no dot\'s ink leaves the plot at the opening size', atRest.plot <= 0,
    `${atRest.dots} dots, worst reach ${atRest.plot.toFixed(2)} px past the border box`)

// ── 3. The cap, where the overhang was largest ─────────────────────────────────────────
//
// #125 measured the failing case here: at 900 the extreme dot's ink sat 15.95 px outside the
// plot's border box — a whole pad — and 12.88 px inside it once `content-box` was stated.
await stretchToCap()

const capped = await plot()

check('the grip reaches the cap', MAX_PLOT_SIZE === capped.frame,
    `${opened.frame} → ${capped.frame} (ceiling is ${MAX_PLOT_SIZE})`)
check('the frame is still what resizePlot asked for', capped.wanted === capped.frame,
    `asked ${capped.wanted}, frame ${capped.frame}`)

const stretched = await overhang()

check('no dot\'s ink leaves the plot at the cap', stretched.plot <= 0,
    `worst reach ${stretched.plot.toFixed(2)} px past the border box`
    + ` (clearance ${(-stretched.plot).toFixed(2)} px)`)
check('and nothing is up against the widget\'s clip', stretched.widget <= 0,
    `worst reach ${stretched.widget.toFixed(2)} px past the widget`)

await page.screenshot({ path: SHOT })

await browser.close()

const failed = results.filter(result => false === result.passed)

console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
console.log(`screenshot: ${SHOT}`)
process.exit(0 === failed.length ? 0 : 1)
