// @vitest-environment jsdom
/**
 * The context menu's tube map item: what it says, and what selecting it does.
 *
 * Three things are checked here that looking at the app cannot settle. That an ineligible
 * node's item is **disabled and says why** rather than absent — ADR 0001 §5 is why the gate
 * exists at all, and a silently missing item is indistinguishable from a mis-click. That a
 * second node **reuses** the panel rather than stacking a second card over the graph. And
 * that a locus change is survived: the panel destroys itself on `datasetLoaded`, so the
 * host has to let go of its handle or the next selection would call `open` on a card that
 * is no longer in the document.
 *
 * `contextMenuService.js` is not imported — it reaches `globals` out of `main.js`, which
 * boots the whole app. What it owns is wiring; what is worth testing is here, behind the
 * two functions it calls.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import eventBus from '../utils/eventBus.ts'
import type { NodeModel } from '../datasetModel.ts'
import type { SeqTubeMapTarget } from '../pangenomeURL.ts'
import type { TubeMapPanelHandle } from '../mountTubeMapPanel.ts'
import {
    NO_REFERENCE_PLACEMENT,
    NO_NODE,
    TUBE_MAP_LABEL,
    applyTubeMapMenuItem,
    isMenuItemDisabled,
    showTubeMapPanel,
    releaseTubeMapPanel,
    tubeMapMenuState,
} from '../tubeMapMenuCommand.ts'

function nodeModel(overrides: Partial<NodeModel> = {}): NodeModel {
    return {
        name: '5519+',
        length: 600,
        assemblies: [{ assemblyName: 'GRCh38', haplotype: '0', sequenceId: 'chr1', start: 25331046, end: 25331646 }],
        duplicatedAssemblies: [],
        assemblyMetadata: null,
        pclaiCoordinatesBySystem: new Map(),
        ogdfCoordinates: [],
        defaultRange: null,
        ...overrides,
    } as NodeModel
}

const TARGET: SeqTubeMapTarget = {
    chrom: 'chr1',
    start: 25331046,
    end: 25331646,
    minigraphnode: '5519',
}

describe('tubeMapMenuState', () => {

    it('is enabled for a node with a GRCh38 placement, and carries the target', () => {
        const state = tubeMapMenuState(nodeModel())
        expect(state).toEqual({ enabled: true, target: TARGET })
    })

    it('is disabled with the reason when the node has no reference placement', () => {
        const state = tubeMapMenuState(nodeModel({ assemblies: [], defaultRange: null }))
        expect(state).toEqual({ enabled: false, reason: NO_REFERENCE_PLACEMENT })
    })

    it('is disabled when there is no node at all, rather than throwing', () => {
        expect(tubeMapMenuState(undefined)).toEqual({ enabled: false, reason: NO_NODE })
    })
})

describe('applyTubeMapMenuItem', () => {

    let item: HTMLLIElement

    beforeEach(() => {
        item = document.createElement('li')
    })

    it('writes the plain label and leaves the item selectable when eligible', () => {
        applyTubeMapMenuItem(item, tubeMapMenuState(nodeModel()))
        expect(item.textContent).toBe(TUBE_MAP_LABEL)
        expect(isMenuItemDisabled(item)).toBe(false)
    })

    it('says the reason in the item itself, not only in a tooltip', () => {
        applyTubeMapMenuItem(item, tubeMapMenuState(nodeModel({ assemblies: [] })))
        expect(item.textContent).toContain(TUBE_MAP_LABEL)
        expect(item.textContent).toContain(NO_REFERENCE_PLACEMENT)
        expect(isMenuItemDisabled(item)).toBe(true)
    })

    it('restores an item that was disabled by a previous right-click', () => {
        applyTubeMapMenuItem(item, tubeMapMenuState(nodeModel({ assemblies: [] })))
        applyTubeMapMenuItem(item, tubeMapMenuState(nodeModel()))
        expect(item.textContent).toBe(TUBE_MAP_LABEL)
        expect(isMenuItemDisabled(item)).toBe(false)
    })

    it('reads as enabled when nothing has touched it — the menu’s other items', () => {
        expect(isMenuItemDisabled(document.createElement('li'))).toBe(false)
    })
})

describe('showTubeMapPanel', () => {

    function panelSpy() {
        const opened: SeqTubeMapTarget[] = []
        const destroy = vi.fn()
        const mounts: TubeMapPanelHandle[] = []

        const mount = () => {
            const handle: TubeMapPanelHandle = {
                open: (target: SeqTubeMapTarget) => { opened.push(target) },
                close: () => {},
                destroy,
            }
            mounts.push(handle)
            return handle
        }

        return { mount, mounts, opened, destroy }
    }

    afterEach(() => {
        releaseTubeMapPanel()
        eventBus.clearEvent('datasetLoaded')
    })

    it('mounts on first selection and opens the target', () => {
        const spy = panelSpy()
        showTubeMapPanel(TARGET, { mount: spy.mount })

        expect(spy.mounts).toHaveLength(1)
        expect(spy.opened).toEqual([TARGET])
    })

    it('reuses the one panel for a second node', () => {
        const spy = panelSpy()
        const second = { ...TARGET, minigraphnode: '5520' }

        showTubeMapPanel(TARGET, { mount: spy.mount })
        showTubeMapPanel(second, { mount: spy.mount })

        expect(spy.mounts).toHaveLength(1)
        expect(spy.opened).toEqual([TARGET, second])
    })

    it('lets go of the panel a locus change destroyed, and mounts a fresh one', () => {
        const spy = panelSpy()
        showTubeMapPanel(TARGET, { mount: spy.mount })

        eventBus.publish('datasetLoaded', {} as never)
        showTubeMapPanel(TARGET, { mount: spy.mount })

        expect(spy.mounts).toHaveLength(2)
    })
})
