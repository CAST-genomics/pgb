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

/** The four inline properties that say where a floating card is and how big it is. */
interface FloatingGeometry {
    width: string
    height: string
    left: string
    top: string
}

/**
 * `geometry`'s position, moved the least it takes to put the card inside the window.
 *
 * Exists because the card's `left`/`top` are page coordinates written once — at mount, by
 * `Draggable`, or by the resize grip — and nothing re-checks them against a window that has
 * since changed size. Restoring them after fullscreen is the moment that matters: a card
 * put back at coordinates the viewport no longer contains has, from the researcher's side
 * of the screen, simply vanished.
 *
 * Measured from the card's own box, so a card larger than the window is pinned to the
 * top-left rather than pushed off the other way. Left alone when the position is not a
 * pixel value — a stylesheet-placed card is the stylesheet's business.
 */
export function clampIntoView(
    card: HTMLElement,
    geometry: FloatingGeometry,
    viewport = { width: window.innerWidth, height: window.innerHeight },
    scroll = { x: window.scrollX, y: window.scrollY }
): { left: string; top: string } {

    const left = parsePixels(geometry.left)
    const top = parsePixels(geometry.top)

    if (null === left || null === top) return { left: geometry.left, top: geometry.top }

    const { width, height } = card.getBoundingClientRect()

    return {
        left: `${clamp(left, scroll.x, scroll.x + Math.max(0, viewport.width - width))}px`,
        top: `${clamp(top, scroll.y, scroll.y + Math.max(0, viewport.height - height))}px`,
    }
}

function clamp(value: number, low: number, high: number): number {
    return Math.min(Math.max(value, low), Math.max(low, high))
}

function parsePixels(value: string): number | null {
    if (!value.endsWith('px')) return null
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : null
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

    /**
     * The card's inline geometry as it was the moment before fullscreen took it, or `null`
     * when the card is not on its way through fullscreen. `close` clears it: a panel
     * dismissed from fullscreen is not owed its old size back on the way out, and putting
     * it back would fight the hide.
     */
    let floatingGeometry: FloatingGeometry | null = null

    function open(target: SeqTubeMapTarget, url: string = buildSeqTubeMapURL(target)): void {
        title.textContent = formatPanelTitle(target)
        card.hidden = false
        void surface.open(url)
    }

    // Leaving fullscreen is part of going away, not a separate thing the user has to
    // remember to do first. Hiding the card while it is the fullscreen element does not
    // end fullscreen — the document stays in it with nothing painted, which is a black
    // screen the app cannot be driven out of: no graph to right-click, so no way to open
    // the panel that would restore it. The two adjacent header buttons make that one
    // mis-click away, so `close` owns the exit.
    function close(): void {
        floatingGeometry = null
        leaveFullscreen()
        card.hidden = true
    }

    /** True while this card — not some other element, and not nothing — is fullscreen. */
    function isFullscreen(): boolean {
        return card.ownerDocument.fullscreenElement === card
    }

    /**
     * Leave fullscreen if this card is in it, and say nothing when it is not.
     *
     * The rejection is swallowed deliberately: `exitFullscreen` rejects when the document
     * left fullscreen between the check and the call — Esc, a tab switch, the UA's own
     * control — and in every one of those cases the state asked for has already arrived.
     */
    function leaveFullscreen(): void {
        if (!isFullscreen()) return
        void card.ownerDocument.exitFullscreen?.().catch(() => {})
    }

    // The card is what goes fullscreen, not the body: the header is the only thing saying
    // which node this map is of, and a fullscreen map of an unnamed node is a map of
    // nothing in particular. The viewer's ResizeObserver does the rest — entering and
    // leaving are both just a resize of its root.
    function toggleFullscreen(): void {
        if (isFullscreen()) {
            leaveFullscreen()
            return
        }

        floatingGeometry = readGeometry()

        // Rejected when the browser refuses the request — a gesture it did not count as
        // one, a permissions policy. The card stays where it is, which is the honest
        // outcome; an unhandled rejection in the console is not.
        void card.requestFullscreen().catch(() => { floatingGeometry = null })
    }

    /**
     * What every exit from fullscreen does, whichever one it was: the button, Esc, the UA's
     * own control, or another element taking fullscreen away.
     *
     * The card is **put back explicitly** rather than left to the UA. Its floating geometry
     * is four inline properties — `Draggable` writes `left`/`top`, the resize grip writes
     * `width`/`height` — and going fullscreen means a stylesheet rule overriding all four
     * with `!important`. Whether unwinding that leaves the card where it was is a question
     * about a UA's top-layer bookkeeping, and this panel's whole job on exit is that the
     * researcher gets back the card they had. So it is restored from a value read on the
     * way in, and clamped into the viewport on the way out — a card restored to coordinates
     * the window no longer contains is gone as surely as a hidden one.
     */
    function restoreFloatingGeometry(): void {
        if (isFullscreen() || null === floatingGeometry) return

        const geometry = floatingGeometry
        floatingGeometry = null

        card.style.width = geometry.width
        card.style.height = geometry.height

        const { left, top } = clampIntoView(card, geometry)
        card.style.left = left
        card.style.top = top
    }

    /**
     * The card's floating geometry as four inline values, kept as strings so an empty one —
     * a card never dragged or sized, placed by the stylesheet's margins — is restored as
     * empty rather than frozen at whatever it computed to.
     */
    function readGeometry(): FloatingGeometry {
        return {
            width: card.style.width,
            height: card.style.height,
            left: card.style.left,
            top: card.style.top,
        }
    }

    /**
     * Keep the button describing the way out rather than the way in, for every way in and
     * out there is: the button, Esc, and the UA's own fullscreen control all arrive here.
     */
    function syncFullscreenButton(): void {
        const label = isFullscreen() ? 'Exit fullscreen' : 'Fullscreen'
        fullscreenButton.title = label
        fullscreenButton.setAttribute('aria-label', label)
        fullscreenButton.setAttribute('aria-pressed', String(isFullscreen()))
    }

    function onFullscreenChange(): void {
        restoreFloatingGeometry()
        syncFullscreenButton()
    }

    closeButton.addEventListener('click', close)
    fullscreenButton.addEventListener('click', toggleFullscreen)
    card.ownerDocument.addEventListener('fullscreenchange', onFullscreenChange)

    const datasetUnsub = eventBus.subscribe('datasetLoaded', () => destroy())

    function destroy(): void {
        if (destroyed) return
        destroyed = true

        datasetUnsub()
        // Before the card leaves the document: a fullscreen element that is removed does
        // end fullscreen, but only once the removal happens, and `destroy` runs on a
        // locus change the user did not connect to the panel at all.
        floatingGeometry = null
        leaveFullscreen()
        closeButton.removeEventListener('click', close)
        fullscreenButton.removeEventListener('click', toggleFullscreen)
        card.ownerDocument.removeEventListener('fullscreenchange', onFullscreenChange)
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
