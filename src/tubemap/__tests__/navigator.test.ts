// @vitest-environment jsdom
/**
 * The navigator's size, which is the only thing about it that a picture cannot settle.
 *
 * It was bounded in width alone, and its height was whatever the map's aspect made of that
 * width. Every document the widget was tuned against was a wide strip — the committed
 * fixture is 35562 × 6325 — so nothing revealed that the rule has no ceiling. Node `141457`
 * of `il7.json` is 4717 × 7115, **taller than it is wide**: 464 strands over a 90 bp span.
 * At width 720 that is a 1086 px thumbnail, which covered most of the panel it is supposed
 * to be a thumbnail of.
 *
 * So the widget is now fitted inside a box bounded on both axes, and the cases below are
 * the two shapes: a strip, which must be unchanged, and a tall map, which must fit.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { createNavigator, type NavigatorHandle } from '../navigator.ts'

/** A host of a known size; jsdom lays nothing out, so both are defined here. */
function host(width: number, height: number): HTMLElement {
    const element = document.createElement('div')
    Object.defineProperty(element, 'clientWidth', { value: width, configurable: true })
    Object.defineProperty(element, 'clientHeight', { value: height, configurable: true })
    document.body.append(element)
    return element
}

function widget(parent: HTMLElement): HTMLElement {
    return parent.querySelector('.stm-navigator') as HTMLElement
}

const paintNothing = () => {}

let navigator: NavigatorHandle | null = null

beforeEach(() => {
    document.body.replaceChildren()
})

afterEach(() => {
    navigator?.destroy()
    navigator = null
})

describe('navigator layout', () => {

    it('draws a wide strip at the tuned width, as it always did', async () => {
        const parent = host(1400, 700)
        navigator = createNavigator(parent, { onNavigate: () => {} })

        // The committed fixture's content size — 5.6:1.
        await navigator.setMap({ width: 35562, height: 6325 }, paintNothing)

        expect(widget(parent).style.width).toBe('624px')
        expect(widget(parent).style.height).toBe('111px')
    })

    it('fits a map taller than it is wide inside the host, rather than filling it', async () => {
        const parent = host(1400, 700)
        navigator = createNavigator(parent, { onNavigate: () => {} })

        // il7 node 141457: 464 strands over 90 bp, so the map is taller than it is wide.
        await navigator.setMap({ width: 4717, height: 7115 }, paintNothing)

        const size = widget(parent)
        const width = Number.parseFloat(size.style.width)
        const height = Number.parseFloat(size.style.height)

        expect(height).toBeLessThanOrEqual(700 * 0.29)
        expect(width).toBeLessThan(624)
        // Still the map's own aspect — a thumbnail of a different shape is a lie.
        expect(width / height).toBeCloseTo(4717 / 7115, 2)
    })

    it('shrinks with a short host, so the widget never outgrows what it sits in', async () => {
        const parent = host(1400, 300)
        navigator = createNavigator(parent, { onNavigate: () => {} })

        await navigator.setMap({ width: 4717, height: 7115 }, paintNothing)

        expect(Number.parseFloat(widget(parent).style.height)).toBeLessThanOrEqual(300 * 0.29)
    })

    it('keeps a strip inside a narrow host, which was already true', async () => {
        const parent = host(400, 700)
        navigator = createNavigator(parent, { onNavigate: () => {} })

        await navigator.setMap({ width: 35562, height: 6325 }, paintNothing)

        expect(Number.parseFloat(widget(parent).style.width)).toBeLessThanOrEqual(400)
    })
})
