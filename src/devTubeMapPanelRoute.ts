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
import { FIXTURE_URL, targetForUrl } from './devTubeMapTarget.ts'
import { tubeMapEncodingOf } from './tubemap/tubeMapEncoding.ts'

/**
 * `?pick`, honoured here as `devTubeMapRoute.ts` honours it, and for the same reason it exists
 * there: it does not decide which URL, it reads the pass that has already run.
 *
 * It is here because one named script needs it. `scripts/verify_segment_boxes.mjs` is the one
 * `verify_*.mjs` whose subject is genuinely DOM layout, so it is the one that belongs on
 * `dev/tubemap-app.html` under the cascade the app ships (#126) — and its §5 drives `?pick` to
 * reach the strand under a segment box. It moved here in #128, and because this was already
 * threaded through, moving it was a change of URL rather than of harness.
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

// The header is written from the target and the map from the url, so the two are worked out
// from the same string — `?url=` and the picker alike. Opening with a fixed target regardless
// of the url is what had this page captioning `5514+` as `5519` (#128).
//
// The encoding is worked out from that same string, and for the same reason: this page does
// not *build* its URL, so it cannot read the format off the flag the way the app does. A
// `format=bands` request or a `.bands` fixture is a payload; anything else is a document.
// Per `open` rather than once at mount, so pasting a payload URL over a document one is a
// click rather than a reload.
const openUrl = (url: string): void => panel.open(targetForUrl(url), url, tubeMapEncodingOf(url))

opener.addEventListener('click', () => openUrl(field.value.trim()))

openUrl(initialUrl)
