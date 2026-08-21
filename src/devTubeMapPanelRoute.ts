/**
 * The dev-only host for the tube map *panel* — `dev/tubemap-panel.html`'s entry point.
 *
 * `dev/tubemap.html` mounts the viewer alone, deliberately, so the surface stays debuggable
 * on its own terms. This page is the other half: the same fixture inside the card
 * `mountTubeMapPanel` builds, which is where drag, the resize grip and fullscreen can be
 * exercised — and where "the map reframes on resize" is something to look at rather than
 * something to assert. Until the context menu lands (#92) there is no other way in, by
 * design: the panel has no navbar button, because without a node it would open empty.
 *
 * Reachable at `/dev/tubemap-panel.html` and `/dev/tubemap-app.html` under `npm run dev` and
 * nowhere else; the same reasoning as `devTubeMapRoute.ts`, which spells it out. The two pages
 * share this entry point on purpose — they differ in their `<link>` tags and in nothing else,
 * so the second is the first under the cascade `index.html` ships, Bootstrap's reset included.
 * That is #126's whole subject, and `scripts/verify_pclai_pad.mjs` is what it bought.
 */

import { mountTubeMapPanel } from './mountTubeMapPanel.ts'
import { mountTubeMapSurface } from './tubemap/tubeMapSurface.ts'
import type { SeqTubeMapTarget } from './pangenomeURL.ts'

/** Node 5519 captured to disk — the file the parser tests read, and what its header says. */
const FIXTURE_URL = '/src/tubemap/__tests__/fixtures/stm-chr1-25331046-25331646.svg'

const FIXTURE_TARGET: SeqTubeMapTarget = {
    chrom: 'chr1',
    start: 25331046,
    end: 25331646,
    minigraphnode: '5519',
}

/**
 * The harness parameters `devTubeMapRoute.ts` documents — `?pick`, `?floor=`, `?samples=` —
 * honoured here too, and for the same reason they exist there: none of them decides which URL,
 * they only make the surface say out loud what it is doing.
 *
 * They are here so that this page, and `dev/tubemap-app.html` above it, can host a
 * `scripts/verify_*.mjs` at all. Every one of those scripts drives `dev/tubemap.html`, which
 * loads no Bootstrap — so nothing we check runs under the cascade the app ships (#126). A
 * script whose subject is DOM layout belongs on the app-cascade page, and this is what makes
 * moving one a change of URL rather than a change of harness.
 *
 * Passed through `mountSurface` rather than through the panel: the panel's own options are
 * about the *card*, and instrumentation for the surface has no business widening them.
 */
const parameters = new URLSearchParams(window.location.search)
const requestedFloor = Number(parameters.get('floor'))
const requestedSamples = Number(parameters.get('samples'))

const panel = mountTubeMapPanel({
    mountSurface: container => mountTubeMapSurface(container, {
        pickReadout: parameters.has('pick'),
        strandFloorCssPx: parameters.has('floor') && Number.isFinite(requestedFloor)
            ? requestedFloor
            : undefined,
        pickSamples: parameters.has('samples') && Number.isInteger(requestedSamples) && requestedSamples > 0
            ? requestedSamples
            : undefined
    })
})

const opener = document.getElementById('open') as HTMLButtonElement
const field = document.getElementById('url') as HTMLInputElement

const initialUrl = parameters.get('url') ?? FIXTURE_URL
field.value = initialUrl

// A live URL names the node it is for; the fixture's header is the one it was captured
// from. Either way the header is written from the target, never from the URL.
opener.addEventListener('click', () => {
    panel.open(targetForUrl(field.value.trim()), field.value.trim())
})

panel.open(FIXTURE_TARGET, initialUrl)

function targetForUrl(url: string): SeqTubeMapTarget {
    const query = url.includes('?') ? new URLSearchParams(url.slice(url.indexOf('?') + 1)) : null
    const chrom = query?.get('chrom')
    const start = Number(query?.get('start'))
    const end = Number(query?.get('end'))
    const minigraphnode = query?.get('minigraphnode')

    if (!chrom || !minigraphnode || !Number.isFinite(start) || !Number.isFinite(end)) {
        return FIXTURE_TARGET
    }

    return { chrom, start, end, minigraphnode }
}
