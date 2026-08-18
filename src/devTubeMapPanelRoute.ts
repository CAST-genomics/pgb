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
 * Reachable at `/dev/tubemap-panel.html` under `npm run dev` and nowhere else; the same
 * reasoning as `devTubeMapRoute.ts`, which spells it out.
 */

import { mountTubeMapPanel } from './mountTubeMapPanel.ts'
import type { SeqTubeMapTarget } from './pangenomeURL.ts'

/** Node 5519 captured to disk — the file the parser tests read, and what its header says. */
const FIXTURE_URL = '/src/tubemap/__tests__/fixtures/stm-chr1-25331046-25331646.svg'

const FIXTURE_TARGET: SeqTubeMapTarget = {
    chrom: 'chr1',
    start: 25331046,
    end: 25331646,
    minigraphnode: '5519',
}

const panel = mountTubeMapPanel()

const opener = document.getElementById('open') as HTMLButtonElement
const field = document.getElementById('url') as HTMLInputElement

const initialUrl = new URLSearchParams(window.location.search).get('url') ?? FIXTURE_URL
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
