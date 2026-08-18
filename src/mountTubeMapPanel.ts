/**
 * mountTubeMapPanel — the tube map viewer's card, and PGB's only host for it.
 *
 * Modelled on `src/widgets/mountPclaiChart.js`: it builds its own card DOM, owns its own
 * `Draggable`, holds its own unsubscribes and returns a handle with `destroy()`. What it
 * adds is the one thing this panel cannot do without — the body it hands
 * `mountTubeMapSurface` is **resizable**. The viewer frames its camera in device pixels
 * and recomputes fit-to-width and the `[fit, 200 × fit]` zoom clamp from the viewport on
 * every resize; a fixed-size container leaves all of that inert, showing one framing of a
 * 14:1 strip forever. The card carries `resize: both` and a fullscreen button, and the
 * viewer's own `ResizeObserver` on its root is what turns either into a reframe. Nothing
 * else is needed, and nothing here reaches into the viewer to do it.
 *
 * The panel is **not a Look** — `docs/adr/0001-sequence-tube-map-panel.md` is where that
 * is argued, and `CLAUDE.md` states it as the rule's boundary. Consequences visible here:
 * the viewer keeps its own render loop (never `App`'s `setAnimationLoop`, which stops
 * during dataset loads and PNG export), and the panel's whole conversation with the bus is
 * one `datasetLoaded` subscription that destroys it.
 *
 * **Destroyed on `datasetLoaded`, deliberately.** Minigraph node ids do not survive a locus
 * change, so the header — a claim about a node the app no longer has — would go on naming
 * one while the map underneath it belonged to somewhere else entirely. A stale map under a
 * valid-looking header is precisely the failure the viewer's eligibility gate exists to
 * prevent (ADR 0001, cost 5), and it is not worth reintroducing through the chrome.
 *
 * **Known and accepted:** a floating card occludes the graph it is supposed to correspond
 * to. A docked strip below the graph is the better home for a 14:1 map and is the intended
 * next step; it is out of scope here because it means touching this app's only resize path.
 * Recorded in ADR 0001.
 *
 * There is no navbar button. Unlike the PCLAI chart the panel is meaningless without a
 * node, so a button that opened it empty would be a dead affordance — the context menu
 * (#92) is the way in, and `open()` is what it calls. It is also the way *back* in, which
 * is what makes `close()` safe to offer: a card with no dismissal would sit over the graph
 * until the locus changed, and closing costs nothing that re-opening does not restore,
 * because the surface stays mounted.
 *
 * The card is appended to `document.body` and its ancestors are styled by nothing, which is
 * what keeps fullscreen honest — a transformed or `contain`-ed ancestor would make the
 * fullscreen element paint inside that ancestor's box. The viewer's own `contain: layout
 * paint` sits on `.stm-root`, a *descendant*, and constrains nothing above it.
 */

import eventBus from './utils/eventBus.ts'
import { Draggable } from './utils/draggable.js'
import { buildSeqTubeMapURL, type SeqTubeMapTarget } from './pangenomeURL.ts'
import { mountTubeMapSurface, type TubeMapSurfaceHandle } from './tubemap/tubeMapSurface.ts'

const CONTAINER_ID = 'tube-map-panel-container'

/** The app surface the panel is sized against: PGB's 3D view, not the whole window. */
const HOST_SELECTOR = '#pgb-three-container'

/**
 * How much of the host the card covers when it first opens — **by area**, which is the
 * quantity that reads as "most of the app" to someone looking at it. Each axis therefore
 * gets `sqrt(0.85)` ≈ 92%, not 85%: taking 85% of both axes would leave 72% of the area.
 *
 * Large on purpose. The map is a 14:1-to-28:1 strip carrying up to ~460 strands, so height
 * is what separates them and width is what makes a band more than a hairline; the 896×256
 * opening size this replaces was legible but spent most of a right-click on a card the user
 * then had to resize. The grip and fullscreen are still there for the rest.
 */
export const HOST_AREA_FRACTION = 0.75

export interface TubeMapPanelOptions {
    /**
     * The surface the card is sized and centred against. Defaults to PGB's 3D container,
     * falling back to the document element when it is absent — a dev route, or a test.
     */
    host?: HTMLElement | null

    /**
     * How the surface gets mounted. Injected only so the panel's own behaviour can be
     * tested without a WebGL context; PGB always takes the default.
     */
    mountSurface?: (container: HTMLElement) => TubeMapSurfaceHandle
}

export interface TubeMapPanelHandle {
    /**
     * Show the panel and load `target`'s map, replacing whatever it was showing.
     *
     * `url` defaults to `buildSeqTubeMapURL(target)` and is passed explicitly only to open
     * a captured document — the committed fixture — against the real chrome. The header is
     * written from `target` either way, so the two can never disagree about which node is
     * on screen.
     */
    open(target: SeqTubeMapTarget, url?: string): void
    /** Hide the card, keeping the mounted surface and whatever it is showing. */
    close(): void
    /** Release every listener and remove every node this mount created. Safe to call twice. */
    destroy(): void
}

/**
 * `5519 · chr1:25,331,046-25,331,646` — the node, and where it sits on the reference.
 *
 * Not the strand count, which would be the other thing worth saying: it is not known until
 * the document parses, so a header carrying it would be written twice and would pop in
 * after the map. Coordinates are grouped because a nine-digit run is unreadable, and the
 * id is the bare `minigraphnode` the API takes rather than PGB's oriented `5519+`, so the
 * header names what was actually asked for.
 *
 * Written here rather than reused: #91 asked for the viewer's `formatLocus`/`formatLength`,
 * and neither exists — in the viewer or anywhere else in PGB. What exists is
 * `prettyPrint` in `src/utils/utils.js`, which groups one number and is not a locus, and
 * `formatBases` in `src/tubemap/segmentOverlay.ts`, which is a segment's length in a
 * tooltip. If a locus formatter is ever wanted in more than one place, this is the one to
 * lift.
 */
export function formatPanelTitle({ minigraphnode, chrom, start, end }: SeqTubeMapTarget): string {
    return `${minigraphnode} · ${chrom}:${formatCoordinate(start)}-${formatCoordinate(end)}`
}

function formatCoordinate(coordinate: number): string {
    return coordinate.toLocaleString('en-US')
}

/**
 * The card's opening geometry over a host of this size: `HOST_AREA_FRACTION` of its area,
 * centred on it, in the page coordinates the card's `position: absolute` is resolved in.
 *
 * Returns `null` for a host with no area — an unlaid-out container, or jsdom — where the
 * stylesheet's fixed opening size is the better answer than a zero-sized card.
 */
export function panelGeometryForHost(host: DOMRect, scroll = { x: window.scrollX, y: window.scrollY }): { width: number; height: number; left: number; top: number } | null {

    if (host.width <= 0 || host.height <= 0) return null

    const axis = Math.sqrt(HOST_AREA_FRACTION)
    const width = Math.round(host.width * axis)
    const height = Math.round(host.height * axis)

    return {
        width,
        height,
        left: Math.round(host.left + scroll.x + (host.width - width) / 2),
        top: Math.round(host.top + scroll.y + (host.height - height) / 2),
    }
}

export function mountTubeMapPanel(options: TubeMapPanelOptions = {}): TubeMapPanelHandle {

    const { mountSurface = mountTubeMapSurface, host = document.querySelector<HTMLElement>(HOST_SELECTOR) } = options

    const { card, header, title, fullscreenButton, closeButton, body } = createCardDOM()

    const surface = mountSurface(body)
    // The header, and only the header. The card carries `resize: both`, and the browser
    // paints that grip inside the card's own box — so a `Draggable` grabbing the whole
    // card claims the grip's mousedown and defaults it away, and the corner drags the
    // panel instead of resizing it.
    const draggable = new Draggable(card, { handle: header })

    sizeToHost(card, host)

    let destroyed = false

    function open(target: SeqTubeMapTarget, url: string = buildSeqTubeMapURL(target)): void {
        title.textContent = formatPanelTitle(target)
        card.hidden = false
        void surface.open(url)
    }

    function close(): void {
        card.hidden = true
    }

    // The card is what goes fullscreen, not the body: the header is the only thing saying
    // which node this map is of, and a fullscreen map of an unnamed node is a map of
    // nothing in particular. The viewer's ResizeObserver does the rest — entering and
    // leaving are both just a resize of its root.
    function toggleFullscreen(): void {
        if (card.ownerDocument.fullscreenElement === card) {
            void card.ownerDocument.exitFullscreen()
            return
        }
        void card.requestFullscreen()
    }

    closeButton.addEventListener('click', close)
    fullscreenButton.addEventListener('click', toggleFullscreen)

    const datasetUnsub = eventBus.subscribe('datasetLoaded', () => destroy())

    function destroy(): void {
        if (destroyed) return
        destroyed = true

        datasetUnsub()
        closeButton.removeEventListener('click', close)
        fullscreenButton.removeEventListener('click', toggleFullscreen)
        draggable.destroy()
        surface.destroy()
        card.remove()
    }

    return { open, close, destroy }
}

/**
 * Write the opening geometry onto the card, once, at mount.
 *
 * Inline, because that is the only thing that wins: the stylesheet's margins place the
 * card, and both `Draggable` and the resize grip write inline `left`/`top`/`width`/`height`
 * of their own. Zeroing the margins here keeps `Draggable`'s margin arithmetic reading the
 * same values this wrote.
 *
 * Not re-applied on window resize. Once the card has been dragged or sized it is the user's,
 * and a window resize that moved it back under the cursor would be the app taking it away.
 */
function sizeToHost(card: HTMLElement, host: HTMLElement | null): void {

    const geometry = panelGeometryForHost((host ?? document.documentElement).getBoundingClientRect())
    if (!geometry) return

    card.style.margin = '0'
    card.style.width = `${geometry.width}px`
    card.style.height = `${geometry.height}px`
    card.style.left = `${geometry.left}px`
    card.style.top = `${geometry.top}px`
}

// ── DOM construction ────────────────────────────────────────────────

interface CardDOM {
    card: HTMLElement
    header: HTMLElement
    title: HTMLElement
    fullscreenButton: HTMLButtonElement
    closeButton: HTMLButtonElement
    body: HTMLElement
}

/**
 * The card, built here rather than in `index.html`, because it is created on a click and
 * destroyed on a locus change — markup that spends most of the session absent.
 */
function createCardDOM(): CardDOM {
    const card = document.createElement('div')
    card.id = CONTAINER_ID
    // Positioned by `_tubeMapPanel.scss`, which is where the card's geometry lives; a
    // Bootstrap positioning class here would be a second place to look for it.
    card.className = 'tube-map-panel__card card'
    card.hidden = true

    const header = document.createElement('div')
    header.className = 'card-header tube-map-panel__header'

    const title = document.createElement('h5')
    title.className = 'card-title mb-0 tube-map-panel__title'

    const actions = document.createElement('div')
    actions.className = 'tube-map-panel__actions'

    const fullscreenButton = iconButton('tube-map-panel__fullscreen', '⛶', 'Fullscreen')
    const closeButton = iconButton('tube-map-panel__close', '✕', 'Close')

    actions.append(fullscreenButton, closeButton)
    header.append(title, actions)

    const body = document.createElement('div')
    body.className = 'card-body tube-map-panel__body'

    card.append(header, body)
    document.body.append(card)

    return { card, header, title, fullscreenButton, closeButton, body }
}

function iconButton(className: string, glyph: string, label: string): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `tube-map-panel__action ${className}`
    button.textContent = glyph
    button.title = label
    button.setAttribute('aria-label', label)
    return button
}
