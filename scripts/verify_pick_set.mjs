/**
 * How finely to photograph the cursor's css pixel, measured rather than guessed (#120).
 *
 * The pick pass frames one css pixel of map and reads it back. Into a single texel it
 * answered with whichever band was drawn last — at fit on `5520+` six haplotypes are inside
 * that pixel and five of the answers were discarded. Into a `1 x N` column it answers
 * with the set, in the vertical order they appear on screen. The window is identical in both
 * cases; only its resolution moves, and **N is the number this script exists to choose.**
 *
 * Three things are produced.
 *
 * - **The sweep.** The same vertical run of cursor positions felt at every candidate N, at
 *   fit. The count of strands named rises with N and then stops rising, because there are
 *   only so many strands inside a pixel; the plateau is the true answer and the smallest N
 *   that reaches it is the one to ship. Each arm is also checked against the finest for
 *   *agreement* — the same set at the same position, not merely the same size — and for
 *   containment, which is what says a coarse arm never invents a strand.
 *
 *   Agreement is reported twice, and the second one is the one that decides. The full set
 *   never quite stops changing: there is always a band whose sliver inside the pixel is
 *   thinner than a cell, so a finer arm always finds one more. What the researcher can see is
 *   the label, which draws `NAME_CAP` names and a count — so the second column asks whether
 *   the two arms would draw the **same label**, and that is a question with a plateau in it.
 *   Cost is printed beside both, because an arm that agrees for twice the milliseconds is a
 *   different trade than one that agrees for free.
 * - **The collapse.** One cursor position, magnified step by step. The count must fall and
 *   never grow, and must reach exactly one: that is the self-annulling property the whole
 *   design rests on, and at that zoom the label is what it was before #120.
 * - **The label.** Two photographs at the shipped N — the set at fit, and the one name it
 *   has collapsed to when magnified. The counts above say the pass answers with a set; only
 *   a picture says the label reads as one thing a researcher can act on.
 * - **The window is unchanged.** `samples=1` must answer with exactly one strand at every
 *   position it answers at all — the arm that reproduces the 1 x 1 target — and its answer
 *   must be a member of the finest arm's set. A pad left at a whole css pixel instead of the
 *   sample cell shows up here as sets that keep growing with N long past the plateau.
 *
 * Same two rules as `verify_floor.mjs`, for the same reasons:
 *
 * - **Headed, so it runs on the real GPU.** Headless chromium falls back to SwiftShader,
 *   where the readback is software rasterization and the numbers say nothing about this.
 * - **Nothing is predicted that can be read.** Every set below comes out of the surface's own
 *   readout, which prints what the pass returned.
 *
 * **Host: `dev/tubemap.html`**, the bare page — a choice now rather than the only option
 * (#126). This chooses a sampling resolution for a readback, off the surface's own readout;
 * the cascade cannot reach a texel.
 *
 *     node scripts/verify_pick_set.mjs                 # the committed 600 bp fixture
 *     node scripts/verify_pick_set.mjs '<url>'         # 5520 is the record: 464 strands
 */

import { chromium } from 'playwright'

const DOCUMENT = process.argv[2] ?? '/src/tubemap/__tests__/fixtures/stm-chr1-25331046-25331646.svg'
/** The candidates. 1 is the control arm: the single-texel target the pass used before #120. */
const SAMPLES = [1, 2, 4, 8, 16, 32, 64, 128]
/** The label's cap, restated here: `NAME_CAP` in `src/tubemap/strandLabel.ts`. */
const NAME_CAP = 5
/** Cursor rows felt in each arm, centred on the middle of the canvas — enough of the bundle
 *  to average over, few enough that eight arms finish in a couple of minutes. */
const SWEEP_ROWS = 60
/** Wheel notches per step of the collapse, and how many steps. 140 notches reaches the
 *  camera's ceiling of 200x fit, so 14 steps of 10 walk the whole range. */
const NOTCHES = 10
const STEPS = 14
const SHOTS = 'notes/sequence-tube-map/measurements'
/** Screenshots are named for the document, so two runs do not overwrite each other. */
const LABEL = /stm-node-(\d+)/.exec(DOCUMENT)?.[1]
    ?? /minigraphnode=(\d+)/.exec(DOCUMENT)?.[1]
    ?? 'fixture'

const url = samples => 'http://localhost:5173/dev/tubemap.html'
    + `?pick&samples=${samples}&url=${encodeURIComponent(DOCUMENT)}`

const browser = await chromium.launch({ headless: false })
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })

/** Open one arm and wait until the map is on screen, fitted, and answering the cursor. */
async function open(samples) {
    await page.goto(url(samples), { waitUntil: 'networkidle' })
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
    // is written from it, so two frames is the earliest an answer can appear and not the
    // latest. Read too soon and the set recorded belongs to a row the cursor has left.
    await page.evaluate(() => new Promise(done => {
        const wait = left => left > 0
            ? requestAnimationFrame(() => wait(left - 1))
            : done()

        wait(4)
    }))
}

/**
 * What the pass answered with, off the surface's own readout: the set, which of them the
 * feeler has lit, and what asking cost.
 *
 * `focus` is written from the appearance table, so it is only an answer while `Shift` is
 * down — which is why the sweep holds the key. Read rather than derived: the lit strand is
 * the one the label marks, and predicting it here would make the label column below a guess
 * about the label rather than a reading of it.
 */
async function named() {
    const text = await page.locator('.stm-pick').textContent()
    const ids = /^strand ([^·]*)·/.exec(text)?.[1].trim() ?? '—'
    const focus = /· focus (\S+)/.exec(text)?.[1] ?? '—'
    const set = '—' === ids ? [] : ids.split(' ').map(Number)

    set.milliseconds = Number(/· ([\d.]+) ms/.exec(text)?.[1] ?? NaN)
    set.lit = '—' === focus ? -1 : set.indexOf(Number(focus))

    return set
}

/**
 * What the label would draw from this set: `NAME_CAP` names and the count of what is hidden
 * on each side.
 *
 * This is `windowOnto` in `src/tubemap/strandLabel.ts`, restated for a script that cannot
 * import TypeScript. The lit strand it centres on is **read off the readout**, not assumed, so
 * the only thing duplicated here is arithmetic — six lines that the label's own tests pin
 * exactly. If those two ever disagree, this column is the one that is wrong.
 */
function labelled(set, cap) {
    const start = Math.max(0, Math.min(set.lit - Math.floor((cap - 1) / 2), set.length - cap))

    return {
        names: set.slice(start, start + cap),
        above: Math.max(0, start),
        below: Math.max(0, set.length - start - cap)
    }
}

/** Feel one row down the middle of the map and say what is under it. `Shift` is held for the
 *  whole sweep, so the readout's `focus` field carries the lit strand and `labelled` can read
 *  it instead of predicting it. */
async function feel(y) {
    await page.mouse.move(middle.x, y)
    await settle()

    return await named()
}

const canvas = await open(SAMPLES[SAMPLES.length - 1])
const middle = { x: canvas.x + canvas.width * 0.5, y: canvas.y + canvas.height * 0.5 }
const rows = Array.from({ length: SWEEP_ROWS }, (_, i) => middle.y - SWEEP_ROWS * 0.5 + i)

console.log(`document:  ${DOCUMENT}`)
console.log(`viewport:  ${canvas.width} x ${canvas.height} css px`)
console.log(`sweep:     ${SWEEP_ROWS} cursor rows through the middle of the canvas, at fit\n`)

// ── The sweep ────────────────────────────────────────────────────────────────────────
const arms = new Map()

for (const samples of SAMPLES) {
    await open(samples)
    await page.keyboard.down('Shift')

    const sets = []

    for (const y of rows) {
        sets.push(await feel(y))
    }

    await page.keyboard.up('Shift')
    arms.set(samples, sets)
}

const unlit = [...arms.values()].flat().filter(set => set.length > 0 && set.lit < 0).length

if (unlit > 0) {
    throw new Error(`${unlit} rows answered with a set but no lit strand: the feeler was not`
        + ' held, and the label column would be a prediction rather than a reading')
}

const finest = arms.get(SAMPLES[SAMPLES.length - 1])
const same = (a, b) => a.length === b.length && a.every((id, i) => id === b[i])

const finestLabel = finest.map(set => labelled(set, NAME_CAP))

console.log(`samples  named/row  most  same set  same label  inside  ms/pick  worst`)

for (const samples of SAMPLES) {
    const sets = arms.get(samples)
    const hit = sets.filter(set => set.length > 0)
    const mean = hit.reduce((n, set) => n + set.length, 0) / Math.max(1, hit.length)
    const most = Math.max(0, ...sets.map(set => set.length))
    // A readout caught mid-update carries no timing; those rows are dropped rather than
    // poisoning the mean, and the set they came with is still counted.
    const cost = sets.map(set => set.milliseconds).filter(Number.isFinite)

    // Agreement is the same set in the same order, not the same count: two arms naming five
    // strands each is not two arms naming the same five.
    const agrees = sets.filter((set, i) => same(set, finest[i])).length
    // The same label: the names the cap lets through, and both counts. This is the column
    // that decides, because it is the only one the researcher can see.
    const reads = sets.filter((set, i) => {
        const shown = labelled(set, NAME_CAP)

        return same(shown.names, finestLabel[i].names)
            && shown.above === finestLabel[i].above
            && shown.below === finestLabel[i].below
    }).length
    // Containment is the claim about the pad. A coarser arm may miss a strand the finer one
    // found; it must never report one the finer one did not, because both frame the same
    // css pixel and the finer one looked harder inside it.
    const inside = sets.filter((set, i) => set.every(id => finest[i].includes(id))).length

    console.log(`${String(samples).padEnd(8)} ${mean.toFixed(2).padEnd(10)} ${String(most).padEnd(5)}`
        + ` ${`${agrees}/${sets.length}`.padEnd(9)} ${`${reads}/${sets.length}`.padEnd(11)}`
        + ` ${`${inside}/${sets.length}`.padEnd(7)}`
        + ` ${(cost.reduce((a, b) => a + b, 0) / Math.max(1, cost.length)).toFixed(2).padEnd(8)}`
        + ` ${Math.max(0, ...cost).toFixed(2)}`
        + (inside === sets.length ? '' : '  ✗ names a strand the finer arm did not'))
}

// ── The collapse ─────────────────────────────────────────────────────────────────────
// One cursor position, magnified. `zoomToCursor` keeps the same point of the map under the
// pointer, so what is being watched is one place on the map getting more room, which is
// exactly what the self-annulling claim is about.
const shipped = 32

console.log(`\ncollapse · samples=${shipped}, one cursor position, ${NOTCHES} notches per step`)

// Plain hover here, where the sweep held `Shift`. Feeler mode switches the controls off —
// `CONTEXT.md` #13, `Shift` arbitrates pointer ownership — so a wheel notch with the key down
// does nothing at all and the "collapse" would be fourteen readings of the same zoom. `?pick`
// runs the pass on a plain hover, which is what makes this measurable; and the count is all
// this section reads, so it needs no lit strand.
await open(shipped)
await page.mouse.move(middle.x, middle.y)
await settle()

const counts = []

for (let step = 0; step <= STEPS; step += 1) {
    if (step > 0) {
        for (let i = 0; i < NOTCHES; i += 1) {
            await page.mouse.wheel(0, -120)
        }

        await settle()
        // The wheel moved the camera, not the pointer, so nothing has asked for a pick at
        // the new zoom. A one-pixel jiggle is what makes the surface answer again.
        await page.mouse.move(middle.x, middle.y + (step % 2))
        await settle()
    }

    const set = await named()

    counts.push(set.length)
    console.log(`  step ${String(step).padStart(2)} · ${set.length} strand${1 === set.length ? '' : 's'}`
        + `${0 === set.length ? '' : ` · ${set.slice(0, 6).join(' ')}${set.length > 6 ? ' …' : ''}`}`)
}

const seen = counts.filter(n => n > 0)
const grew = seen.findIndex((n, i) => i > 0 && n > seen[i - 1])

console.log(`  falls monotonically: ${grew < 0 ? '✓' : `✗ grew at step ${grew}`}`)
console.log(`  reaches exactly one: ${1 === seen[seen.length - 1] ? '✓' : `✗ ends at ${seen[seen.length - 1]}`}`)

// ── The label ────────────────────────────────────────────────────────────────────────
// The feeler, not a plain hover: the label is gated on `Shift`, so the photographs have to
// be taken with it down. Two of them, at the two ends of the same claim — the set at fit,
// and the single name it has become when the picture stops being ambiguous.
async function labelShot(name, magnify) {
    await open(shipped)
    await page.mouse.move(middle.x, middle.y)
    await settle()

    if (magnify) {
        for (let i = 0; i < NOTCHES * 3; i += 1) {
            await page.mouse.wheel(0, -120)
        }

        await settle()
    }

    await page.keyboard.down('Shift')
    await page.mouse.move(middle.x, middle.y + 1)
    await settle()

    const path = `${SHOTS}/pick-set-${LABEL}-${name}.png`

    // Unclipped. A `clip` makes Playwright override the page's device metrics, and the
    // resize that follows takes the pointer off the canvas — the shutter then catches a
    // surface that has just been told the cursor left, with nothing lit and nothing named.
    await page.screenshot({ path })

    const set = await named()

    await page.keyboard.up('Shift')

    console.log(`  ${name.padEnd(8)} · ${set.length} named · ${path}`)

    return set
}

console.log(`\nthe label · samples=${shipped}, feeler held`)

const wide = await labelShot('at-fit', false)
const close = await labelShot('zoomed', true)

console.log(`  a set at fit and one name magnified: `
    + `${wide.length > 1 && 1 === close.length ? '✓' : '✗'}`)

// ── The window did not grow ──────────────────────────────────────────────────────────
// samples=1 is the 1 x 1 target reproduced exactly, so it must answer with one strand or
// none, never a set. If it ever answers with two, the column is being read where a single
// texel is meant to be, and every number above is about a different window.
const control = arms.get(1)
const singular = control.every(set => set.length <= 1)

console.log(`\nthe window is the same one css pixel`)
console.log(`  samples=1 answers with at most one strand: ${singular ? '✓' : '✗'}`)
console.log(`  and always one the finest arm also found: `
    + `${control.every((set, i) => set.every(id => finest[i].includes(id))) ? '✓' : '✗'}`)

await browser.close()
