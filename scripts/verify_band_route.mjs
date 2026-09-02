/**
 * #146's acceptance, run rather than argued: that the flag reaches all the way to a drawn
 * picture, and that the two encodings of one region draw the same map.
 *
 * What the unit tests cannot say is exactly what this ticket is about. `parseBandPayload`'s
 * pairing tests hold the two readings to each other number by number, and `readTubeMap`'s
 * hold the right reader to the right bytes — but a flag that spelled the URL and left the
 * body decoded as UTF-8 would pass every one of them and draw nothing, because the failure
 * is between the fetch and the parser rather than inside either. So this drives the mounted
 * panel, twice, and looks at what arrives.
 *
 * **Two runs, one region.** The `.bands` fixture and the `.svg` beside it are *different
 * renders* — the payload format is on the API's `main` and the committed documents came
 * from `release` (ADR `0005`) — so the band and strand counts differ and nothing here
 * compares them. What is compared is the shape of the outcome: a map on the screen, no
 * error state, and the one difference the ADR predicts, which is that the band route draws
 * no segment boxes until their #66 replaces the outline strings.
 *
 * **The acceptance criterion this does not discharge** is the last one: a real server
 * carrying the format, over a node large enough to have failed before, with the timing
 * recorded. That is gated on deployment — the live server follows `release`. When it lands,
 * this is the script to point at it:
 *
 *     node scripts/verify_band_route.mjs --live 5520   # once `format=bands` is deployed
 *
 * which builds the URL the app builds, asks for the payload, and prints what it cost.
 *
 * **Host: `dev/tubemap-panel.html`**, because the panel is what reads the flag: it spells
 * the URL and tells the viewer how to read the response from one value, and this is the
 * seam where those two could come apart.
 *
 *     node scripts/verify_band_route.mjs   # with `npm run dev` already up
 */

import { chromium } from 'playwright'

const ORIGIN = 'http://localhost:5173/dev/tubemap-panel.html'

/** The inversion, and the fixture the band route most needs to be checked on: 2,334 of its
 *  bands are leftward curves, which is where the payload's un-normalized ends are live
 *  production data rather than a hypothetical (ADR `0005` §4). */
const STEM = '/src/tubemap/__tests__/fixtures/stm-chr8-10079054-10080461'

/** The live URL builder's own parameters, spelled here so the script can be pointed at a
 *  deployed server without the app. Node 5520 is `chr1:25,331,646-25,335,796` — 44,795
 *  bands, a 12.58 MB document against a 1.40 MB payload, and one of the nodes the whole
 *  effort is about. */
const LIVE = {
    5520: 'chrom=chr1&start=25331646&end=25335796&version=v2&pathnumoption=normal&nodewidthoption=compressed&minigraphnode=5520',
    5514: 'chrom=chr1&start=25301271&end=25309238&version=v2&pathnumoption=normal&nodewidthoption=compressed&minigraphnode=5514'
}

const results = []
const check = (name, passed, detail) => {
    results.push({ name, passed })
    console.log(`${true === passed ? '  ok  ' : '  FAIL'}  ${name}${undefined === detail ? '' : ` — ${detail}`}`)
}

/** Open `url` in the panel and report what the surface made of it, with what it cost. */
async function open(page, url) {
    const started = Date.now()

    await page.goto(`${ORIGIN}?url=${encodeURIComponent(url)}`, { waitUntil: 'load' })

    // The status region covers the root while the fetch is out and carries the error state
    // afterwards, so "hidden" is the surface saying it drew something.
    await page.waitForFunction(() => document.querySelector('.stm-status')?.hidden === true, null, { timeout: 180_000 })
        .catch(() => {})

    const state = await page.evaluate(() => {
        const status = document.querySelector('.stm-status')
        return {
            drew: true === status?.hidden,
            heading: status?.querySelector('.stm-status-heading')?.textContent ?? null,
            reason: status?.querySelector('.stm-status-reason')?.textContent ?? null,
            boxes: document.querySelectorAll('.stm-segment').length,
            caption: document.querySelector('.stm-inversion')?.textContent ?? null,
            canvas: (() => {
                const canvas = document.querySelector('.stm-root canvas')
                return null === canvas ? null : { width: canvas.width, height: canvas.height }
            })()
        }
    })

    return { ...state, seconds: (Date.now() - started) / 1000, url }
}

const live = process.argv.includes('--live') ? process.argv[process.argv.indexOf('--live') + 1] : null

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } })

page.on('pageerror', error => check('no page error', false, String(error)))

if (null === live) {
    const document_ = await open(page, `${STEM}.svg`)
    const payload = await open(page, `${STEM}.bands`)

    console.log(JSON.stringify({ document: document_, payload }, null, 1))

    check('the document route draws', document_.drew, `${document_.seconds.toFixed(1)} s`)
    check('the band route draws', payload.drew, `${payload.seconds.toFixed(1)} s`)
    check('the document route draws its segment boxes', document_.boxes > 0, `${document_.boxes}`)
    // It changed here, on the day it changed. ADR `0005` rejected reading the payload's
    // outline strings and this asserted zero boxes; their #66 replaced those strings with
    // the five numbers a box is, #151 read them, and the two routes now draw the same
    // boxes from the same render — which is the stronger statement, so it is the one made.
    check('the band route draws its segment boxes too', payload.boxes > 0, `${payload.boxes}`)
    check('both routes draw the same boxes', document_.boxes === payload.boxes,
        `${document_.boxes} vs ${payload.boxes}`)
    check('neither route shows an error', null === document_.heading && null === payload.heading)

    await page.screenshot({ path: '/tmp/stm-band-route.png' })
    console.log('\n  /tmp/stm-band-route.png')
} else {
    const query = LIVE[live]

    if (undefined === query) {
        console.error(`No live parameters for node ${live}; known: ${Object.keys(LIVE).join(', ')}`)
        process.exit(2)
    }

    const base = `https://pangenome-api.ucsd.edu:8000/seqtubemap?${query}`

    // The document first, so the comparison is against this node's own cost on the day
    // rather than against a number in a table. It is allowed to fail: the nodes worth
    // checking are the ones that already do, and that is the point of the exercise.
    const document_ = await open(page, base)
    const payload = await open(page, `${base}&format=bands`)

    console.log(JSON.stringify({ node: live, document: document_, payload }, null, 1))

    check(`node ${live} draws from the band payload`, payload.drew, `${payload.seconds.toFixed(1)} s`)
    check(`node ${live} draws the same segment boxes either way`, document_.boxes === payload.boxes,
        `${document_.boxes} vs ${payload.boxes}`)

    await page.screenshot({ path: `/tmp/stm-band-route-live-${live}.png` })
    console.log(`\n  /tmp/stm-band-route-live-${live}.png`)
}

await browser.close()

process.exit(results.every(result => result.passed) ? 0 : 1)
