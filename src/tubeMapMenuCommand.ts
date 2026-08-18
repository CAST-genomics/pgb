/**
 * The "Sequence Tube Map" context-menu item: whether it is offered, what it reads, and the
 * panel it opens. `src/contextMenuService.js` is the only caller; everything it would
 * otherwise have to hold — the eligibility gate, the disabled wording, the one panel's
 * lifetime — lives here so it can be tested without booting the app.
 *
 * The item is **right-click only**, consistent with the two items already in that menu.
 * `registerClickHandler` on the raycast service is the menu's own hook; left-click stays
 * unclaimed rather than being spent on this.
 *
 * An ineligible node gets the item **disabled with the reason**, never hidden. Fifteen of
 * the forty-five nodes in `public/datasets/api-v3/cici.json` have no GRCh38 placement, and
 * an item that vanishes for a third of the graph is indistinguishable from a mis-click.
 * Why an ineligible node must be stopped here rather than by the server:
 * `docs/adr/0001-sequence-tube-map-panel.md` §5 — the API answers an unknown
 * `minigraphnode` with 200 and a plausible-looking map of different data.
 */

import eventBus from './utils/eventBus.ts'
import type { NodeModel } from './datasetModel.ts'
import { tubeMapTargetForNode, type SeqTubeMapTarget } from './pangenomeURL.ts'
import { mountTubeMapPanel, type TubeMapPanelHandle } from './mountTubeMapPanel.ts'

export const TUBE_MAP_LABEL = 'Sequence Tube Map'

/**
 * The reason a node is ineligible, in the researcher's terms rather than the gate's.
 *
 * `tubeMapTargetForNode` returns `null` for two causes — no reference interval, or a name
 * that is not a minigraph node id — and this one wording covers both. The second cannot
 * arise from a parsed dataset, and if it ever does, "no GRCh38 placement" is still the
 * true consequence: there is no interval on the reference to ask the API for.
 */
export const NO_REFERENCE_PLACEMENT = 'no GRCh38 placement'

/**
 * There is no node to ask about. In practice this is a right-click on an **edge**: the
 * raycast returns an intersection carrying no `nodeName`, the menu is presented anyway
 * (as it was before this item existed — the two copy items bail with a console warning),
 * and "no node under the cursor" is the only honest thing to say about it.
 */
export const NO_NODE = 'no node under the cursor'

export type TubeMapMenuState =
    | { enabled: true; target: SeqTubeMapTarget }
    | { enabled: false; reason: string }

/** Whether this node has a tube map, and — when it does not — what to say instead. */
export function tubeMapMenuState(node: NodeModel | null | undefined): TubeMapMenuState {

    if (!node) {
        return { enabled: false, reason: NO_NODE }
    }

    const target = tubeMapTargetForNode(node)
    if (!target) {
        return { enabled: false, reason: NO_REFERENCE_PLACEMENT }
    }

    return { enabled: true, target }
}

/**
 * Write `state` onto the menu's `<li>`, which is reused across right-clicks and so has to
 * be restored as well as disabled.
 *
 * The reason goes in the item's own text — `Sequence Tube Map — no GRCh38 placement` — not
 * only in a `title`, because a tooltip that has to be waited for answers nobody who has
 * already clicked. `aria-disabled` rather than the `disabled` attribute: this is an `<li>`,
 * which has none, and it is what the menu's hover and mousedown handlers read.
 */
export function applyTubeMapMenuItem(item: HTMLElement, state: TubeMapMenuState): void {

    item.setAttribute('aria-disabled', state.enabled ? 'false' : 'true')

    if (state.enabled) {
        item.textContent = TUBE_MAP_LABEL
        item.removeAttribute('title')
        item.style.cursor = 'pointer'
        item.style.color = ''
        return
    }

    item.textContent = `${TUBE_MAP_LABEL} — ${state.reason}`
    item.title = state.reason
    item.style.cursor = 'default'
    item.style.color = '#999'
}

/**
 * Whether a menu item has been disabled — the read half of what `applyTubeMapMenuItem`
 * writes. The attribute and its sentinel are the whole disabled-state protocol, so both
 * halves live here rather than having the menu re-derive the meaning of `'true'`.
 *
 * Takes any of the menu's items, not just this one: the menu's hover and mousedown
 * handlers run over all of them, and an item nothing has disabled is enabled.
 */
export function isMenuItemDisabled(item: HTMLElement): boolean {
    return item.getAttribute('aria-disabled') === 'true'
}

// ── The one panel ───────────────────────────────────────────────────

export interface ShowTubeMapPanelOptions {
    /** How the panel gets mounted. Injected for tests; PGB always takes the default. */
    mount?: () => TubeMapPanelHandle
}

let panel: TubeMapPanelHandle | null = null
let panelUnsub: (() => void) | null = null

/**
 * Show `target` in the tube map panel, mounting it the first time and reusing it after.
 *
 * The panel destroys itself on `datasetLoaded` — a minigraph node id does not survive a
 * locus change (see `mountTubeMapPanel`) — so the handle held here is dropped on the same
 * event. Without that, the next right-click would call `open` on a card that is no longer
 * in the document and nothing would appear.
 */
export function showTubeMapPanel(target: SeqTubeMapTarget, options: ShowTubeMapPanelOptions = {}): void {

    const { mount = mountTubeMapPanel } = options

    if (!panel) {
        panel = mount()
        panelUnsub = eventBus.subscribe('datasetLoaded', () => releaseTubeMapPanel())
    }

    panel.open(target)
}

/**
 * Let go of the panel without destroying it — the panel's own `datasetLoaded` subscription
 * has already done that by the time this runs. Exported for tests, which have no locus
 * change to publish between cases.
 */
export function releaseTubeMapPanel(): void {
    panelUnsub?.()
    panelUnsub = null
    panel = null
}
