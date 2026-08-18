/**
 * The dev-only host for the sequence tube map viewer — `dev/tubemap.html`'s entry point.
 *
 * It is a *host*, which is why it lives here and not in `src/tubemap/`. The viewer's entire
 * input surface is `open(url)` (`docs/adr/0001-sequence-tube-map-panel.md`); deciding
 * *which* URL is the host's job, and this one decides it the crudest way there is — a query
 * parameter and a text field. `mountTubeMapPanel` (#91) is the real host and makes the same
 * call; the context menu (#92) is what will finally build the URL from a clicked node.
 * The panel has a dev page of its own — `dev/tubemap-panel.html` — because the card, its
 * resize grip and its fullscreen button are a different thing to look at than the surface;
 * this page stays the one that mounts the viewer alone.
 *
 * Reachable at `/dev/tubemap.html` under `npm run dev` and nowhere else. The dev server
 * serves every HTML file under the project root; the build starts from its inputs, and
 * `vite.config.js` declares none, so it takes Vite's default of `index.html` alone. Nothing
 * the app ships imports this module, so neither the page nor the viewer reaches `dist/` —
 * verified by building and looking. If a `rollupOptions.input` list is ever added to
 * `vite.config.js`, leaving this page out of it is what keeps that true.
 *
 * Two things it is deliberately *not* a copy of. The spike's harness carried a node picker
 * driven by a catalogue of every eligible minigraph node, and an FPS meter. The catalogue
 * becomes `tubeMapTargetForNode` on real dataset nodes (#90), and the FPS meter answered a
 * question the spike closed. Both stayed behind.
 */

import { mountTubeMapSurface } from './tubemap/tubeMapSurface.ts'

/**
 * The committed test corpus, and the default when no `?url=` is given. It is node 5519
 * captured to disk — literally the file the parser tests read, served by the dev server
 * from where it sits rather than copied into `public/`, which would ship it in every
 * production build for the sake of a page that is not in one.
 */
const FIXTURE_URL = '/src/tubemap/__tests__/fixtures/stm-chr1-25331046-25331646.svg'

const container = document.getElementById('viewer') as HTMLElement
const picker = document.getElementById('picker') as HTMLFormElement
const field = document.getElementById('url') as HTMLInputElement

const initialUrl = new URLSearchParams(window.location.search).get('url') ?? FIXTURE_URL

const viewer = mountTubeMapSurface(container)

// The field is filled in rather than left blank, so what is on screen is always something
// the reader can see, edit and paste elsewhere.
field.value = initialUrl

picker.addEventListener('submit', event => {
    event.preventDefault()
    void viewer.open(field.value.trim())
})

void viewer.open(initialUrl)
