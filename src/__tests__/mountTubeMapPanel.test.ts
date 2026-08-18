// @vitest-environment jsdom
/**
 * The panel around the viewer, tested at the seam the viewer is behind.
 *
 * `mountTubeMapSurface` is injected rather than imported here: it builds a WebGL renderer
 * on mount, which jsdom has no answer for. What is asserted is therefore everything the
 * panel itself owns — the card, the header text, when `open` is forwarded, and above all
 * that a locus change takes the whole thing away and leaves no subscription behind. That
 * last one is the failure ADR 0001 names: a stale map under a valid-looking header.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import eventBus from '../utils/eventBus.ts'
import { buildSeqTubeMapURL, type SeqTubeMapTarget } from '../pangenomeURL.ts'
import { mountTubeMapPanel, formatPanelTitle } from '../mountTubeMapPanel.ts'
import type { TubeMapSurfaceHandle } from '../tubemap/tubeMapSurface.ts'

const TARGET: SeqTubeMapTarget = {
    chrom: 'chr1',
    start: 25331046,
    end: 25331646,
    minigraphnode: '5519',
}

const FIXTURE_URL = '/src/tubemap/__tests__/fixtures/stm-chr1-25331046-25331646.svg'

/** One stub surface per mount, recorded so the test can see what the panel asked of it. */
function surfaceSpy() {
    const containers: HTMLElement[] = []
    const opened: string[] = []
    const destroy = vi.fn()

    const mountSurface = (container: HTMLElement): TubeMapSurfaceHandle => {
        containers.push(container)
        return {
            open: async (url: string) => { opened.push(url) },
            destroy,
        }
    }

    return { mountSurface, containers, opened, destroy }
}

function card(): HTMLElement | null {
    return document.querySelector('.tube-map-panel__card')
}

let panel: { destroy(): void } | null = null

beforeEach(() => {
    document.body.replaceChildren()
})

afterEach(() => {
    panel?.destroy()
    panel = null
    eventBus.clearEvent('datasetLoaded')
})

describe('formatPanelTitle', () => {

    it('names the node and its reference interval, grouped for reading', () => {
        expect(formatPanelTitle(TARGET)).toBe('5519 · chr1:25,331,046-25,331,646')
    })

    it('is the bare minigraph node id, never PGB’s oriented name', () => {
        expect(formatPanelTitle({ ...TARGET, minigraphnode: '5520' })).toMatch(/^5520 /)
    })
})

describe('mountTubeMapPanel', () => {

    it('builds its own card and hands the viewer the body, not the card', () => {
        const spy = surfaceSpy()
        panel = mountTubeMapPanel({ mountSurface: spy.mountSurface })

        const element = card()
        expect(element).not.toBeNull()
        expect(element!.querySelector('.card-header')).not.toBeNull()

        const body = element!.querySelector('.card-body')
        expect(spy.containers).toEqual([body])
    })

    it('stays out of the way until a node asks for it', () => {
        const spy = surfaceSpy()
        panel = mountTubeMapPanel({ mountSurface: spy.mountSurface })

        expect(card()!.hidden).toBe(true)
        expect(spy.opened).toEqual([])
    })

    it('shows the card, titles it and opens the node’s URL', () => {
        const spy = surfaceSpy()
        const handle = mountTubeMapPanel({ mountSurface: spy.mountSurface })
        panel = handle

        handle.open(TARGET)

        expect(card()!.hidden).toBe(false)
        expect(card()!.querySelector('.card-title')!.textContent).toBe('5519 · chr1:25,331,046-25,331,646')
        expect(spy.opened).toEqual([buildSeqTubeMapURL(TARGET)])
    })

    it('takes an explicit URL, so a fixture can be opened against the real chrome', () => {
        const spy = surfaceSpy()
        const handle = mountTubeMapPanel({ mountSurface: spy.mountSurface })
        panel = handle

        handle.open(TARGET, FIXTURE_URL)

        expect(spy.opened).toEqual([FIXTURE_URL])
    })

    it('is one panel: a second node re-opens the surface it already mounted', () => {
        const spy = surfaceSpy()
        const handle = mountTubeMapPanel({ mountSurface: spy.mountSurface })
        panel = handle

        handle.open(TARGET)
        handle.open({ ...TARGET, minigraphnode: '5520' })

        expect(spy.containers).toHaveLength(1)
        expect(spy.opened).toHaveLength(2)
        expect(card()!.querySelector('.card-title')!.textContent).toMatch(/^5520 /)
    })

    it('closes without destroying, and re-opens into the same surface', () => {
        const spy = surfaceSpy()
        const handle = mountTubeMapPanel({ mountSurface: spy.mountSurface })
        panel = handle

        handle.open(TARGET)
        card()!.querySelector<HTMLButtonElement>('.tube-map-panel__close')!.click()

        expect(card()!.hidden).toBe(true)
        expect(spy.destroy).not.toHaveBeenCalled()

        handle.open(TARGET)
        expect(card()!.hidden).toBe(false)
        expect(spy.containers).toHaveLength(1)
    })

    it('asks the card — not the body — for fullscreen, so the header comes along', () => {
        const spy = surfaceSpy()
        const handle = mountTubeMapPanel({ mountSurface: spy.mountSurface })
        panel = handle

        const element = card()!
        const request = vi.fn().mockResolvedValue(undefined)
        ;(element as any).requestFullscreen = request

        element.querySelector<HTMLButtonElement>('.tube-map-panel__fullscreen')!.click()

        expect(request).toHaveBeenCalledTimes(1)
    })

    it('is destroyed by a locus change: node ids do not survive one', () => {
        const spy = surfaceSpy()
        const handle = mountTubeMapPanel({ mountSurface: spy.mountSurface })
        panel = handle

        handle.open(TARGET)
        eventBus.publish('datasetLoaded', { dataset: {} as never })

        expect(card()).toBeNull()
        expect(spy.destroy).toHaveBeenCalledTimes(1)
    })

    it('leaves no subscription behind: a second locus change reaches nothing', () => {
        const spy = surfaceSpy()
        const handle = mountTubeMapPanel({ mountSurface: spy.mountSurface })
        panel = handle

        eventBus.publish('datasetLoaded', { dataset: {} as never })
        eventBus.publish('datasetLoaded', { dataset: {} as never })

        expect(spy.destroy).toHaveBeenCalledTimes(1)
    })

    it('survives being destroyed twice, because the bus and the caller both do it', () => {
        const spy = surfaceSpy()
        const handle = mountTubeMapPanel({ mountSurface: spy.mountSurface })
        panel = handle

        handle.destroy()
        handle.destroy()

        expect(spy.destroy).toHaveBeenCalledTimes(1)
        expect(card()).toBeNull()
    })
})
