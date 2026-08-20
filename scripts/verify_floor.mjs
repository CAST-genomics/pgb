/**
 * The thickness floor, judged the only way it can be — by looking (#112).
 *
 * At fit on a wide document a band is 0.19 css pixels tall and 2.6 strands share every device
 * pixel row. Feeler mode recedes the crowd correctly and the focused strand still cannot be
 * picked out, because receding does not change how much of a row the focused band owns. The
 * floor gives that one band a minimum screen-space thickness, grown symmetrically about its
 * centreline. Whether it works is a photograph, not an argument, and **how thick** is a
 * judgement made off a sweep of candidates.
 *
 * Two things are produced:
 *
 * - **The sweep.** One photograph per candidate floor, all at fit, all with the feeler parked
 *   on the same strand at the same cursor position, so the pictures differ in one thing only.
 *   `floor=0` is the control: the map exactly as it is today.
 * - **The inertness check.** At a zoom where the band is already thicker than the floor, the
 *   canvas with the floor on and the canvas with it off are compared byte for byte. The claim
 *   the floor is defensible on is that above it the clamp does nothing at all, and that claim
 *   is checkable rather than assertable.
 *
 * Same two rules as `verify_highlight.mjs`, for the same reasons:
 *
 * - **Headed, so it runs on the real GPU.** Headless chromium falls back to SwiftShader,
 *   where the rasterization is software and a picture of it says nothing about this one.
 * - **Nothing is predicted that can be read.** Which strand the feeler is on comes out of the
 *   surface's own readout.
 *
 *     node scripts/verify_floor.mjs                 # the committed 600 bp fixture
 *     node scripts/verify_floor.mjs '<url>'         # 5520 is the record: 464 strands, 14 MB
 */

import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'

const DOCUMENT = process.argv[2] ?? '/src/tubemap/__tests__/fixtures/stm-chr1-25331046-25331646.svg'
/** The candidates. Zero is the control arm: the floor switched off. */
const FLOORS = [0, 1, 1.5, 2, 3]
/**
 * Wheel notches for the inertness check. More than enough to reach the camera's ceiling of
 * 200x fit, where a band on `5520+` is 38 css px tall — an order of magnitude above the
 * tallest floor in the sweep, and a zoom the camera clamps to, so both arms stop in the
 * same place without either being told a number.
 */
const ZOOM_STEPS = 140
const SWEEP_STEPS = 260
const SHOTS = 'notes/sequence-tube-map/measurements'
/** Screenshots are named for the document, so two runs do not overwrite each other. */
const LABEL = /stm-node-(\d+)/.exec(DOCUMENT)?.[1]
    ?? /minigraphnode=(\d+)/.exec(DOCUMENT)?.[1]
    ?? 'fixture'

const url = (floor, pick) => 'http://localhost:5173/dev/tubemap.html'
    + `?${pick ? 'pick&' : ''}floor=${floor}&url=${encodeURIComponent(DOCUMENT)}`

const browser = await chromium.launch({ headless: false })
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })

/**
 * Open one arm of the sweep and wait until the map is on screen, fitted, and answering the
 * cursor.
 *
 * The last of those has to be waited for rather than assumed: the first pointer move after a
 * load is regularly swallowed — the readout still says `strand —` a second later — and a
 * sweep that starts from a lost move records a y with nothing under it. So the cursor is
 * jiggled until the readout has an answer in it, and only then does the run begin.
 */
async function open(floor, pick) {
    await page.goto(url(floor, pick), { waitUntil: 'networkidle' })
    await page.bringToFront()
    await page.waitForFunction(() => document.querySelector('.stm-status')?.hidden === true)
    await settle()

    const box = await page.locator('canvas.stm-canvas').boundingBox()

    for (let i = 0; i < 20; i += 1) {
        await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5 + i % 2)
        await settle()

        if (true === await answered()) {
            return box
        }
    }

    throw new Error('the surface never answered the cursor: no pick in 20 moves')
}

/** Whether the readout carries a pick at all, which it does not until the first one runs. */
async function answered() {
    return await page.evaluate(
        () => true === document.querySelector('.stm-pick')?.textContent.includes(' ms'))
}

async function settle() {
    // Four frames rather than two. A pick is coalesced to an animation frame and the readout
    // is written from it, so two frames is the *earliest* an answer can appear and not the
    // latest: read too soon and the y recorded here belongs to a strand the cursor has
    // already left, which is how a sweep ends up parked over empty space.
    await page.evaluate(() => new Promise(done => {
        const wait = left => left > 0
            ? requestAnimationFrame(() => wait(left - 1))
            : done()

        wait(4)
    }))
}

/** Put the feeler at `y` down the middle of the map and say what it is on. Shift must be held. */
async function feel(y) {
    await page.mouse.move(middle.x, y)
    await settle()

    return await focused()
}

/** The focused strand, off the surface's own readout. Null when the feeler is over a gap. */
async function focused() {
    const text = await page.locator('.stm-pick').textContent()
    const focus = /focus (\S+)/.exec(text)

    return null === focus || '—' === focus[1] ? null : Number(focus[1])
}

// ── Choose a strand to photograph, and a cursor position that reaches it ────────────
// Every arm of the sweep must feel the same haplotype, or the pictures differ in two things.
// The pick pass ignores the floor — see PICK_FRAGMENT — so a position found here answers the
// same strand at every floor, and each arm confirms that rather than assuming it.
//
// Which strand is not arbitrary. The first hit of a downward sweep is on the top edge of the
// bundle, and on `5520+` it is `HG00133#2`, whose PCLAI colour is the grey that means *no
// placement* — a photograph of a floored strand nobody can see the colour of, taken where
// there was no crowd to find it in. So the run collects every strand the sweep touches and
// takes the most saturated one in the middle third of the bundle: a coloured strand, buried.
const canvas = await open(0, true)
const middle = { x: canvas.x + canvas.width * 0.5, y: canvas.y + canvas.height * 0.5 }

const colors = await page.evaluate(async source => {
    const { parseBands } = await import('/src/tubemap/parseBands.ts')
    const parsed = parseBands(await (await fetch(source)).text())

    return Array.from(parsed.strandColors)
}, DOCUMENT)

/** How much colour a strand has. Zero is grey, which on this document means unplaced. */
const saturation = strand => {
    const rgb = colors.slice(strand * 3, strand * 3 + 3)

    return Math.max(...rgb) - Math.min(...rgb)
}

await page.keyboard.down('Shift')

const hits = []

for (let i = 0; i < SWEEP_STEPS; i += 1) {
    const y = middle.y - SWEEP_STEPS * 0.5 + i
    const strand = await feel(y)

    if (null !== strand) {
        hits.push({ y, strand })
    }
}

if (0 === hits.length) {
    throw new Error('no strand found under a vertical sweep of the map centre')
}

const top = hits[0].y
const bottom = hits[hits.length - 1].y
const third = (bottom - top) / 3
const buried = hits.filter(hit => hit.y > top + third && hit.y < bottom - third)

const parked = (buried.length > 0 ? buried : hits)
    .reduce((best, hit) => saturation(hit.strand) > saturation(best.strand) ? hit : best)

// Confirmed by leaving and coming back: a stale readout is the one way this picks a y with
// nothing under it, and the answer has to survive the cursor being somewhere else in between.
//
// Retried rather than trusted once. A dropped pointer move leaves the readout describing where
// the cursor *was*, which is a false negative here — the run only fails if the y never answers
// with its strand.
let confirmed = null

for (let attempt = 0; attempt < 4 && confirmed !== parked.strand; attempt += 1) {
    await feel(middle.y)

    confirmed = await feel(parked.y)
}

await page.keyboard.up('Shift')

if (confirmed !== parked.strand) {
    throw new Error(`the parked strand does not hold still: ${parked.strand} then ${confirmed}`)
}

console.log(`document:  ${DOCUMENT}`)
console.log(`viewport:  ${canvas.width} x ${canvas.height} css px`)
console.log(`bundle:    y ${top.toFixed(0)} to ${bottom.toFixed(0)}, ${hits.length} of ${SWEEP_STEPS} rows on a strand`)
console.log(`parked on: strand ${parked.strand} at y ${parked.y.toFixed(0)}, `
    + `rgb(${colors.slice(parked.strand * 3, parked.strand * 3 + 3).join(', ')})\n`)
console.log(`sweep at fit · one photograph per candidate, feeler on strand ${parked.strand}`)

for (const floor of FLOORS) {
    await open(floor, true)
    await page.keyboard.down('Shift')

    // The same haplotype in every arm, found rather than assumed: a fresh load lands the
    // bundle within a pixel or two of where the last one did, and a photograph of a different
    // strand is not a comparison.
    let at = null

    for (let step = 0; step <= 12 && null === at; step += 1) {
        for (const y of [parked.y + step, parked.y - step]) {
            if (parked.strand === await feel(y)) {
                at = y
                break
            }
        }
    }

    const shot = `${SHOTS}/floor-${LABEL}-at-fit-${floor}.png`

    await page.screenshot({ path: shot })
    await page.keyboard.up('Shift')

    console.log(`  floor ${String(floor).padEnd(3)} css px · `
        + `${null === at ? `strand ${parked.strand} not found ✗ — not comparable` : `strand ${parked.strand} at y ${at}`}`
        + ` · ${shot}`)
}

// ── Above the floor the clamp is inert ───────────────────────────────────────────────
// The claim the floor is defensible on: where the band is already thicker than the floor, the
// clamp does nothing whatever, so the map a researcher studies at working zoom is exactly as
// honest as it was. Two runs, one floored and one not, compared byte for byte.
//
// The dev page's own chrome is hidden before the shutter. The readout, because it is also
// what says a strand is under the feeler at all and it prints millisecond timings that two
// runs drawing the same pixels do not agree on; the hint line, because it names the floor the
// page was opened with, which is the one thing the two arms are supposed to differ in.
const tallest = FLOORS[FLOORS.length - 1]

async function zoomedShot(floor) {
    const box = await open(floor, true)
    const at = { x: box.x + box.width * 0.5, y: box.y + box.height * 0.5 }

    await page.mouse.move(at.x, at.y)

    for (let i = 0; i < ZOOM_STEPS; i += 1) {
        await page.mouse.wheel(0, -120)
    }

    await settle()
    await page.keyboard.down('Shift')
    await page.mouse.move(at.x, at.y + 1)
    await settle()

    const strand = await focused()
    const path = `${SHOTS}/floor-${LABEL}-zoomed-${floor}.png`

    await page.evaluate(() => {
        for (const chrome of document.querySelectorAll('.stm-pick, .dev-hint, .dev-picker')) {
            chrome.style.display = 'none'
        }
    })
    await settle()
    await page.screenshot({ path, clip: box })
    await page.keyboard.up('Shift')

    return { path, strand }
}

const control = await zoomedShot(0)
const floored = await zoomedShot(tallest)
const same = readFileSync(control.path).equals(readFileSync(floored.path))
const felt = null !== control.strand && control.strand === floored.strand

console.log(`\nabove the floor · zoomed to the camera's ceiling, feeler held on one strand`)
console.log(`  feeling strand ${control.strand} in both arms: ${felt ? '✓' : '✗ not comparable'}`)
console.log(`  floor 0 and floor ${tallest} css px are `
    + `${same ? 'byte-identical ✓' : 'different ✗ — the clamp is reaching a band it should not'}`)
console.log(`  ${control.path}\n  ${floored.path}`)

// And the same comparison at fit, which is the positive control: there the floor must very
// much *not* be inert, or the pictures above are a photograph of nothing.
const atFit = floor => readFileSync(`${SHOTS}/floor-${LABEL}-at-fit-${floor}.png`)

console.log(`  at fit, the same two floors differ: `
    + `${atFit(0).equals(atFit(tallest)) ? '✗ the floor did nothing' : '✓'}`)

await browser.close()
