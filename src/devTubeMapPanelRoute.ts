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
 * `?pick`, honoured here as `devTubeMapRoute.ts` honours it, and for the same reason it exists
 * there: it does not decide which URL, it reads the pass that has already run.
 *
 * It is here because one named script needs it. `scripts/verify_segment_boxes.mjs` is the one
 * `verify_*.mjs` whose subject is genuinely DOM layout, so it is the one that belongs on
 * `dev/tubemap-app.html` under the cascade the app ships (#126) — and its last section drives
 * `?pick` to reach the strand under a segment box. Without this, moving it would mean changing
 * the harness rather than the URL.
 *
 * `?floor=` and `?samples=` are deliberately **not** here. They belong to two scripts that
 * photograph the canvas, which is not a thing a stylesheet reaches, and whose headers now say
 * so; adding them would be capability for a migration nobody has a reason to make.
 *
 * Passed through `mountSurface` rather than through the panel: the panel's own options are
 * about the *card*, and instrumentation for the surface has no business widening them.
 */
const parameters = new URLSearchParams(window.location.search)

const panel = mountTubeMapPanel({
    mountSurface: container => mountTubeMapSurface(container, {
        pickReadout: parameters.has('pick')
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
