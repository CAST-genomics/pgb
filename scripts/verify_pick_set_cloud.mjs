/**
 * The pick set in the ancestry cloud, judged the only way it can be — by looking (#120).
 *
 * At fit six haplotypes share the cursor's css pixel. The map lights one of them, the label
 * names all six, and until now the PCLAI inset marked one dot and gave no sign the other five
 * were under the cursor — the complaint #120 is about, surviving in the last panel that had
 * not heard it. The cloud now draws three tiers: the lit strand ringed at `FOCUS_SIZE`, the
 * rest of the set enlarged to `SET_SIZE` at full opacity, and the crowd receded behind them.
 *
 * Every marked dot is the same size; only the ring says which one the map has lit. What this
 * script checks is the part that cannot be read off the picture at a glance:
 *
 * - **The cloud draws the set it was given** — every mark is a member, and the shortfall
 *   against the label is exactly the strands the document does not place.
 * - **Releasing the feeler clears every tier**, so no dot is left claiming a haplotype nobody
 *   is pointing at.
 * - **How far apart a set actually is in the cloud**, which is the measurement that says
 *   whether marking the set is worth anything at all. If the strands sharing a css pixel of
 *   map share a placement too, the marks land on top of each other and the tier shows nothing.
 *
 * Same two rules as `verify_floor.mjs`, for the same reasons:
 *
 * - **Headed, so it runs on the real GPU.** Headless chromium falls back to SwiftShader, and
 *   a picture of a software rasterizer says nothing about this one.
 * - **Nothing is predicted that can be read.** Which strand the feeler is on, and how many
 *   are under it, come out of the surface's own readout; how many dots the cloud marked is
 *   counted off the DOM the surface built.
 *
 *     node scripts/verify_pick_set_cloud.mjs             # the committed 600 bp fixture
 *     node scripts/verify_pick_set_cloud.mjs '<url>'     # 5520 is the record: 464 strands
 */

import { chromium } from 'playwright'

const DOCUMENT = process.argv[2] ?? '/src/tubemap/__tests__/fixtures/stm-chr1-25331046-25331646.svg'
/** The inset's own numbers, restated: `DOT_SIZE` and `PLOT_SIZE` in `src/tubemap/pclaiInset.ts`. */
const DOT_SIZE = 8
const PLOT_SIZE = 216
/** Cursor rows swept to find a strand to park on. */
const SWEEP_ROWS = 260
const SHOTS = 'notes/sequence-tube-map/measurements'
const LABEL = /stm-node-(\d+)/.exec(DOCUMENT)?.[1]
    ?? /minigraphnode=(\d+)/.exec(DOCUMENT)?.[1]
    ?? 'fixture'

const url = () => 'http://localhost:5173/dev/tubemap.html'
    + `?pick&url=${encodeURIComponent(DOCUMENT)}`

const browser = await chromium.launch({ headless: false })
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })

async function open() {
    await page.goto(url(), { waitUntil: 'networkidle' })
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

async function answered() {
    return await page.evaluate(
        () => true === document.querySelector('.stm-pick')?.textContent.includes(' ms'))
}

async function settle() {
    // Four frames rather than two: a pick is coalesced to an animation frame and the readout
    // is written from it, so two is the earliest an answer can appear and not the latest.
    await page.evaluate(() => new Promise(done => {
        const wait = left => left > 0
            ? requestAnimationFrame(() => wait(left - 1))
            : done()

        wait(4)
    }))
}

/** What the surface says is under the cursor: the pick set, and which of it is lit. */
async function reading() {
    const text = await page.locator('.stm-pick').textContent()
    const ids = /^strand ([^·]*)·/.exec(text)?.[1].trim() ?? '—'
    const focus = /· focus (\S+)/.exec(text)?.[1] ?? '—'

    return {
        set: '—' === ids ? [] : ids.split(' ').map(Number),
        lit: '—' === focus ? null : Number(focus)
    }
}

/** What the cloud actually drew, counted off the DOM rather than predicted. */
async function cloud() {
    return await page.evaluate(() => ({
        receded: null !== document.querySelector('.stm-pclai-plot.is-feeling'),
        ringed: document.querySelectorAll('.stm-pclai-dot.is-ringed').length,
        inSet: document.querySelectorAll('.stm-pclai-dot.is-in-set').length,
        // Read back off the marks themselves, so "all one size" is a reading rather than a
        // claim: every marked dot's width, deduped. One entry, or the tier is not one tier.
        width: [...new Set([...document.querySelectorAll(
            '.stm-pclai-dot.is-ringed, .stm-pclai-dot.is-in-set')].map(dot => dot.style.width))].join(' / ')
    }))
}

/** Feel one row down the middle of the map. Shift must be held. */
async function feel(y) {
    await page.mouse.move(middle.x, y)
    await settle()

    return await reading()
}

// ── Choose a row to photograph, and a cursor position that reaches it ───────────────
// Every arm must feel the same haplotypes, or the pictures differ in two things. The set size
// does not touch the pick, so a position found here answers the same set at every candidate,
// and each arm confirms that rather than assuming it.
//
// **Which row is the whole argument, so it is chosen on the thing the tier is for.** The first
// version of this took the row with the most *placed* strands, and that selects exactly
// backwards: the rows where every member is placed are the ancestry-coherent ones, whose dots
// land on top of each other under the ring. The photograph was of the one case where the tier
// has nothing to show. So the row is now the one whose set is most *spread out* in the cloud —
// the case the measurement below says is the common one — with a placed lit strand, so the
// ring is in the picture too.
const canvas = await open()
const middle = { x: canvas.x + canvas.width * 0.5, y: canvas.y + canvas.height * 0.5 }

// Plain hover, and no DOM reading. `?pick` runs the pass on a hover, so the set is available
// without the feeler — and the sweep is 260 rows long, over which a held `Shift` is a thing
// that can quietly be dropped. It was: the first version read the cloud's marks per row and
// recorded zero for a row the photograph pass then marked six times. What the sweep needs is
// the set; how many of those are placed comes from the document, below, which cannot drop.
const hits = []

for (let i = 0; i < SWEEP_ROWS; i += 1) {
    const y = middle.y - SWEEP_ROWS * 0.5 + i
    const seen = await feel(y)

    if (seen.set.length > 0) {
        hits.push({ y, ...seen })
    }
}

if (0 === hits.length) {
    throw new Error('no strand found under a vertical sweep of the map centre')
}

// ── How far apart is a pick set, in the cloud? ───────────────────────────────────────
// The question the whole tier is for. If the strands sharing a css pixel of map also share a
// placement, the cloud has nothing to add: the marks land on top of each other and under the
// ring. If they scatter, the cloud is saying something the map cannot — *these six are
// indistinguishable here and came from different ancestries*.
//
// Measured over every row the sweep touched, as the widest gap between any two of the set's
// placements, in plot pixels, against a plot whose dots are DOT_SIZE across.
const spreads = await page.evaluate(async ({ source, rows, plot }) => {
    const { parseBands } = await import('/src/tubemap/parseBands.ts')
    const { projectPlacement } = await import('/src/tubemap/strandCoordinates.ts')
    const parsed = parseBands(await (await fetch(source)).text())
    const surface = { width: plot, height: plot }

    return rows.map(set => {
        const at = set
            .map(id => parsed.strandPlacements[id])
            .filter(placement => null !== placement)
            .map(placement => projectPlacement(placement, surface))

        let widest = 0

        for (let i = 0; i < at.length; i += 1) {
            for (let j = i + 1; j < at.length; j += 1) {
                widest = Math.max(widest, Math.hypot(at[i].x - at[j].x, at[i].y - at[j].y))
            }
        }

        return { placed: at.length, widest }
    })
}, { source: DOCUMENT, rows: hits.map(hit => hit.set), plot: PLOT_SIZE })

hits.forEach((hit, i) => {
    hit.widest = spreads[i].widest
    hit.placed = spreads[i].placed
})

const several = spreads.filter(spread => spread.placed > 1)
const sorted = [...several].map(spread => spread.widest).sort((a, b) => a - b)
const median = sorted[Math.floor(sorted.length / 2)] ?? 0
const stacked = several.filter(spread => spread.widest < DOT_SIZE).length
const scattered = several.filter(spread => spread.widest > PLOT_SIZE * 0.25).length

// The scattered case, which is the common one, and among those the widest — a picture of what
// the tier is for rather than of a set the ring already covers.
const showable = hits.filter(hit => hit.placed >= 3)
const parked = (showable.length > 0 ? showable : hits)
    .reduce((best, hit) => hit.widest > best.widest ? hit : best)

console.log(`document:  ${DOCUMENT}`)
console.log(`viewport:  ${canvas.width} x ${canvas.height} css px`)
console.log(`bundle:    ${hits.length} of ${SWEEP_ROWS} rows on a strand`)
console.log(`parked on: y ${parked.y.toFixed(0)} · set ${parked.set.join(' ')}`
    + ` · ${parked.placed} of ${parked.set.length} placed`
    + ` · widest gap ${parked.widest.toFixed(0)} px\n`)
console.log(`how far apart a pick set is, in the cloud · ${several.length} rows placing two or more`)
console.log(`  widest gap · median ${median.toFixed(1)} px `
    + `· p90 ${(sorted[Math.floor(sorted.length * 0.9)] ?? 0).toFixed(1)} px `
    + `· max ${(sorted[sorted.length - 1] ?? 0).toFixed(1)} px  (plot is ${PLOT_SIZE} px, a dot is ${DOT_SIZE})`)
console.log(`  one blob, gap under a dot's width: ${stacked}/${several.length}`)
console.log(`  scattered, gap over a quarter of the plot: ${scattered}/${several.length}\n`)
// The photograph, on that row. One picture rather than a sweep: there is one size left to
// look at, and what the picture has to show is the set standing clear of a drained crowd.
await open()
await page.keyboard.down('Shift')

let at = null

for (let step = 0; step <= 12 && null === at; step += 1) {
    for (const y of [parked.y + step, parked.y - step]) {
        const seen = await feel(y)

        if (seen.set.join(' ') === parked.set.join(' ')) {
            at = y
            break
        }
    }
}

const drawn = await cloud()
const shot = `${SHOTS}/cloud-set-${LABEL}.png`

await page.screenshot({ path: shot })

console.log(`the picture`)
console.log(`  ${null === at ? 'set not found ✗ — not the row measured above' : `row ${at}`}`
    + ` · crowd receded ${drawn.receded ? '✓' : '✗'}`
    + ` · ringed ${drawn.ringed} · in set ${drawn.inSet}, all at ${drawn.width}`)
console.log(`  ${shot}`)

// ── The cloud and the label report the same count ────────────────────────────────────
// The property this change exists for: the two readouts must not be two different answers to
// the question "what is under my cursor". They can differ by the strands the document does
// not place — that is honest and is what the label's names are for — so what is checked is
// that every marked dot is a member of the set, and that the shortfall is exactly the
// unplaced count.
const unplaced = await page.evaluate(async source => {
    const { parseBands } = await import('/src/tubemap/parseBands.ts')
    const parsed = parseBands(await (await fetch(source)).text())

    return Array.from(parsed.strandPlacements, placement => null === placement)
}, DOCUMENT)

const missing = parked.set.filter(id => unplaced[id]).length
const marks = drawn.ringed + drawn.inSet

console.log(`\nthe cloud and the label agree`)
console.log(`  label names ${parked.set.length} · cloud marks ${marks}`
    + ` · document places none of ${missing} of them`)
console.log(`  ${parked.set.length - missing === marks ? '✓' : '✗ the cloud is not drawing the set it was given'}`)
console.log(`  every mark the same size: ${drawn.width.includes('/') ? `✗ ${drawn.width}` : `✓ ${drawn.width}`}`)

// ── At rest, nothing is marked ───────────────────────────────────────────────────────
// Releasing the key must take every tier off at once. A dot left enlarged after the gesture
// ends is a claim about a haplotype nobody is pointing at.
await page.keyboard.up('Shift')
await settle()

const rest = await cloud()

console.log(`\nreleasing the feeler clears every tier`)
console.log(`  receded ${rest.receded ? '✗' : '✓'}`
    + ` · ringed ${0 === rest.ringed ? '✓' : `✗ ${rest.ringed}`}`
    + ` · in set ${0 === rest.inSet ? '✓' : `✗ ${rest.inSet}`}`)

await browser.close()
