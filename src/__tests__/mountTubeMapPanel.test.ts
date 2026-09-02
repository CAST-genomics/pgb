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
import { mountTubeMapPanel, formatPanelTitle, panelGeometryForHost, clampIntoView, HOST_AREA_FRACTION } from '../mountTubeMapPanel.ts'
import type { TubeMapSurfaceHandle } from '../tubemap/tubeMapSurface.ts'
import { TUBE_MAP_ENCODING, type TubeMapEncoding } from '../tubemap/tubeMapEncoding.ts'

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
    const encodings: Array<TubeMapEncoding | undefined> = []
    const destroy = vi.fn()

    const mountSurface = (container: HTMLElement): TubeMapSurfaceHandle => {
        containers.push(container)
        return {
            open: async (url: string, encoding?: TubeMapEncoding) => {
                opened.push(url)
                encodings.push(encoding)
            },
            destroy,
        }
    }

    return { mountSurface, containers, opened, encodings, destroy }
}

function card(): HTMLElement | null {
    return document.querySelector('.tube-map-panel__card')
}

let panel: { destroy(): void } | null = null

/**
 * Put `element` in fullscreen as far as this file is concerned, and hand back the spy
 * standing in for `exitFullscreen`. jsdom implements neither, and both are the whole
 * subject of the tests below — a card that hides without leaving fullscreen takes the app
 * with it.
 */
function enterFullscreen(element: HTMLElement | null): ReturnType<typeof vi.fn> {
    const exit = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => element })
    Object.defineProperty(document, 'exitFullscreen', { configurable: true, writable: true, value: exit })
    return exit
}

function clearFullscreen(): void {
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => null })
}

beforeEach(() => {
    document.body.replaceChildren()
})

afterEach(() => {
    panel?.destroy()
    panel = null
    clearFullscreen()
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

/** A host of a known size, since jsdom lays nothing out. */
function hostRect(width: number, height: number, left = 0, top = 0): DOMRect {
    return { width, height, left, top, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) } as DOMRect
}

describe('panelGeometryForHost', () => {

    it('covers HOST_AREA_FRACTION of the host by area, on both axes alike', () => {
        const geometry = panelGeometryForHost(hostRect(1000, 1000), { x: 0, y: 0 })!

        // Asserted against the constant rather than a pinned pixel count: the fraction is
        // a matter of taste and gets tuned by looking at it, and a test that has to be
        // edited to change it says nothing about whether the arithmetic is right.
        expect(geometry.width).toBe(geometry.height)
        expect((geometry.width * geometry.height) / (1000 * 1000)).toBeCloseTo(HOST_AREA_FRACTION, 2)
    })

    it('centres the card on the host, in page coordinates', () => {
        const geometry = panelGeometryForHost(hostRect(1000, 800, 200, 100), { x: 0, y: 0 })!

        expect(geometry.left).toBe(200 + Math.round((1000 - geometry.width) / 2))
        expect(geometry.top).toBe(100 + Math.round((800 - geometry.height) / 2))
    })

    it('adds the page scroll, because the card is positioned in the document', () => {
        const geometry = panelGeometryForHost(hostRect(1000, 800, 0, 0), { x: 40, y: 60 })!

        expect(geometry.left).toBe(40 + Math.round((1000 - geometry.width) / 2))
        expect(geometry.top).toBe(60 + Math.round((800 - geometry.height) / 2))
    })

    it('declines to size against a host with no area, leaving the stylesheet to answer', () => {
        expect(panelGeometryForHost(hostRect(0, 0), { x: 0, y: 0 })).toBeNull()
    })
})

describe('mountTubeMapPanel', () => {

    it('opens at the host\'s size, not the stylesheet\'s', () => {
        const spy = surfaceSpy()
        const host = document.createElement('div')
        host.getBoundingClientRect = () => hostRect(1200, 900, 0, 0)
        document.body.append(host)

        panel = mountTubeMapPanel({ mountSurface: spy.mountSurface, host })

        const styled = card()!.style
        const expected = panelGeometryForHost(hostRect(1200, 900, 0, 0), { x: 0, y: 0 })!
        expect(styled.width).toBe(`${expected.width}px`)
        expect(styled.height).toBe(`${expected.height}px`)
        // The margins that placed the card are gone, or they would offset what was just set.
        expect(styled.margin).toBe('0px')
    })


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
        expect(spy.opened).toEqual([buildSeqTubeMapURL(TARGET, TUBE_MAP_ENCODING)])
    })

    /**
     * The request and the parse come from one value, which is the whole of what a flag buys
     * over a probe: there is no state in which the URL asks for a payload and the viewer
     * reads a document. Both spellings are exercised, because the one that is not the
     * default today is the one that will be tomorrow.
     */
    it('spells the URL and reads the response in one encoding', () => {
        for (const encoding of ['document', 'bands'] as const) {
            const spy = surfaceSpy()
            const handle = mountTubeMapPanel({ mountSurface: spy.mountSurface, encoding })
            handle.open(TARGET)

            expect(spy.opened).toEqual([buildSeqTubeMapURL(TARGET, encoding)])
            expect(spy.encodings).toEqual([encoding])

            handle.destroy()
        }
    })

    // The flag was flipped to 'bands' on 2026-09-02, when the format reached the deployed
    // server. Which way it points is a deliberate act (#146), not something a refactor
    // should be able to change by accident, so it is pinned in both directions: the default
    // is the payload, and the panel asks for what the flag says.
    it('asks for the band payload, which is what the flag says', () => {
        const spy = surfaceSpy()
        const handle = mountTubeMapPanel({ mountSurface: spy.mountSurface })
        panel = handle

        handle.open(TARGET)

        expect(TUBE_MAP_ENCODING).toBe('bands')
        expect(spy.encodings).toEqual([TUBE_MAP_ENCODING])
    })

    it('takes an explicit URL and the encoding it is in, together', () => {
        const spy = surfaceSpy()
        const handle = mountTubeMapPanel({ mountSurface: spy.mountSurface })
        panel = handle

        handle.open(TARGET, '/fixtures/stm.bands', 'bands')

        expect(spy.opened).toEqual(['/fixtures/stm.bands'])
        expect(spy.encodings).toEqual(['bands'])
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

    it('toggling off exits fullscreen rather than asking for it twice', () => {
        const spy = surfaceSpy()
        const handle = mountTubeMapPanel({ mountSurface: spy.mountSurface })
        panel = handle

        const element = card()!
        const request = vi.fn().mockResolvedValue(undefined)
        ;(element as any).requestFullscreen = request
        const exit = enterFullscreen(element)

        element.querySelector<HTMLButtonElement>('.tube-map-panel__fullscreen')!.click()

        expect(exit).toHaveBeenCalledTimes(1)
        expect(request).not.toHaveBeenCalled()
    })

    it('closing while fullscreen leaves fullscreen: a hidden fullscreen card is a black screen', () => {
        const spy = surfaceSpy()
        const handle = mountTubeMapPanel({ mountSurface: spy.mountSurface })
        panel = handle

        handle.open(TARGET)
        const element = card()!
        const exit = enterFullscreen(element)

        element.querySelector<HTMLButtonElement>('.tube-map-panel__close')!.click()

        expect(exit).toHaveBeenCalledTimes(1)
        expect(element.hidden).toBe(true)
    })

    it('leaves fullscreen when nothing is in it, quietly', () => {
        const spy = surfaceSpy()
        const handle = mountTubeMapPanel({ mountSurface: spy.mountSurface })
        panel = handle

        const exit = enterFullscreen(null)

        card()!.querySelector<HTMLButtonElement>('.tube-map-panel__close')!.click()

        expect(exit).not.toHaveBeenCalled()
    })

    it('a locus change leaves fullscreen as well as taking the card away', () => {
        const spy = surfaceSpy()
        const handle = mountTubeMapPanel({ mountSurface: spy.mountSurface })
        panel = handle

        handle.open(TARGET)
        const exit = enterFullscreen(card()!)

        eventBus.publish('datasetLoaded', { dataset: {} as never })

        expect(exit).toHaveBeenCalledTimes(1)
        expect(card()).toBeNull()
    })

    it('labels the button with the way out while fullscreen, however it was entered', () => {
        const spy = surfaceSpy()
        const handle = mountTubeMapPanel({ mountSurface: spy.mountSurface })
        panel = handle

        const button = card()!.querySelector<HTMLButtonElement>('.tube-map-panel__fullscreen')!
        expect(button.title).toBe('Fullscreen')

        enterFullscreen(card()!)
        document.dispatchEvent(new Event('fullscreenchange'))
        expect(button.title).toBe('Exit fullscreen')
        expect(button.getAttribute('aria-pressed')).toBe('true')

        enterFullscreen(null)
        document.dispatchEvent(new Event('fullscreenchange'))
        expect(button.title).toBe('Fullscreen')
        expect(button.getAttribute('aria-pressed')).toBe('false')
    })

    it('puts the card back at the size and place fullscreen took it from', () => {
        const spy = surfaceSpy()
        const handle = mountTubeMapPanel({ mountSurface: spy.mountSurface })
        panel = handle

        handle.open(TARGET)
        const element = card()!
        // What a drag and a grip-resize leave behind: four inline values, and the only
        // record of the size the researcher chose.
        element.style.width = '640px'
        element.style.height = '300px'
        element.style.left = '120px'
        element.style.top = '80px'

        ;(element as any).requestFullscreen = vi.fn().mockResolvedValue(undefined)
        const button = element.querySelector<HTMLButtonElement>('.tube-map-panel__fullscreen')!

        button.click()
        enterFullscreen(element)
        document.dispatchEvent(new Event('fullscreenchange'))

        // The UA is entitled to leave the card anywhere on the way out; the panel is not
        // entitled to hand back anything but what it was given.
        element.style.width = '100%'
        element.style.height = '100%'
        element.style.left = '0px'
        element.style.top = '0px'

        enterFullscreen(null)
        document.dispatchEvent(new Event('fullscreenchange'))

        expect(element.style.width).toBe('640px')
        expect(element.style.height).toBe('300px')
        expect(element.style.left).toBe('120px')
        expect(element.style.top).toBe('80px')
        expect(element.hidden).toBe(false)
    })

    it('restores nothing when the card was closed from fullscreen: the hide stands', () => {
        const spy = surfaceSpy()
        const handle = mountTubeMapPanel({ mountSurface: spy.mountSurface })
        panel = handle

        handle.open(TARGET)
        const element = card()!
        ;(element as any).requestFullscreen = vi.fn().mockResolvedValue(undefined)

        element.querySelector<HTMLButtonElement>('.tube-map-panel__fullscreen')!.click()
        enterFullscreen(element)
        document.dispatchEvent(new Event('fullscreenchange'))

        element.querySelector<HTMLButtonElement>('.tube-map-panel__close')!.click()
        enterFullscreen(null)
        document.dispatchEvent(new Event('fullscreenchange'))

        expect(element.hidden).toBe(true)
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


describe('clampIntoView', () => {

    /** A card of a known size, since jsdom lays nothing out. */
    function sized(width: number, height: number): HTMLElement {
        const element = document.createElement('div')
        element.getBoundingClientRect = () => hostRect(width, height)
        return element
    }

    const viewport = { width: 1000, height: 800 }
    const scroll = { x: 0, y: 0 }

    it('leaves a card that is already inside the window alone', () => {
        const geometry = { width: '400px', height: '300px', left: '120px', top: '80px' }
        expect(clampIntoView(sized(400, 300), geometry, viewport, scroll)).toEqual({ left: '120px', top: '80px' })
    })

    it('pulls a card back when the window no longer reaches it', () => {
        const geometry = { width: '400px', height: '300px', left: '1400px', top: '900px' }
        expect(clampIntoView(sized(400, 300), geometry, viewport, scroll)).toEqual({ left: '600px', top: '500px' })
    })

    it('pins a card larger than the window to the top-left rather than off the other edge', () => {
        const geometry = { width: '2000px', height: '1600px', left: '-300px', top: '-200px' }
        expect(clampIntoView(sized(2000, 1600), geometry, viewport, scroll)).toEqual({ left: '0px', top: '0px' })
    })

    it('is measured in page coordinates, which is what the card is positioned in', () => {
        const geometry = { width: '400px', height: '300px', left: '10px', top: '10px' }
        expect(clampIntoView(sized(400, 300), geometry, viewport, { x: 200, y: 100 })).toEqual({ left: '200px', top: '100px' })
    })

    it('leaves a stylesheet-placed card to the stylesheet', () => {
        const geometry = { width: '', height: '', left: '', top: '' }
        expect(clampIntoView(sized(400, 300), geometry, viewport, scroll)).toEqual({ left: '', top: '' })
    })
})
