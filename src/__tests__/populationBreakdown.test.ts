// @vitest-environment jsdom
/**
 * The population breakdown panel (#174, CONTEXT.md "population breakdown"): one node's
 * count and frequency in every population, standing on its own above the graph.
 *
 * What HeatmapLook decides (which node, when) is tested in heatmapLookBreakdown.test.ts;
 * this file covers what the panel itself shows and how it holds its place.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { PopulationBreakdown, type PopulationBreakdownRow } from '../populationBreakdown.ts'

const ROWS: PopulationBreakdownRow[] = [
    { acronym: 'YRI', name: 'Yoruba in Ibadan, Nigeria', count: 12, frequency: '40%' },
    { acronym: 'CHS', name: 'Southern Han Chinese', count: 3, frequency: '10%' },
    { acronym: 'PEL', name: 'Peruvian in Lima, Peru', count: 0, frequency: 'none' },
]

let panel: PopulationBreakdown | null = null

function makePanel(): PopulationBreakdown {
    panel = new PopulationBreakdown({ defaultPosition: () => ({ left: 700, top: 120 }) })
    return panel
}

afterEach(() => {
    panel?.destroy()
    panel = null
    document.body.innerHTML = ''
})

const rowTexts = (p: PopulationBreakdown) =>
    [...p.element.querySelectorAll('.population-breakdown__row')].map(row => row.textContent)

const boldRows = (p: PopulationBreakdown) =>
    [...p.element.querySelectorAll('.population-breakdown__row--selected')].map(row => row.textContent)

describe('PopulationBreakdown', () => {

    it('is closed until shown', () => {
        const p = makePanel()
        expect(p.isOpen).toBe(false)
        expect(p.element.style.display).toBe('none')
    })

    it('shows a header naming the node and one row per population', () => {
        const p = makePanel()
        p.show('5519+', ROWS, null)

        expect(p.isOpen).toBe(true)
        expect(p.nodeName).toBe('5519+')
        expect(p.element.querySelector('.population-breakdown__header')!.textContent).toContain('Node 5519+')
        expect(rowTexts(p)).toEqual([
            'Yoruba in Ibadan, Nigeria1240%',
            'Southern Han Chinese310%',
            'Peruvian in Lima, Peru0none',
        ])
    })

    it('bolds the selected population and moves the bold when the selection changes', () => {
        const p = makePanel()
        p.show('5519+', ROWS, 'CHS')
        expect(boldRows(p)).toEqual(['Southern Han Chinese310%'])

        p.setSelectedPopulation('YRI')
        expect(boldRows(p)).toEqual(['Yoruba in Ibadan, Nigeria1240%'])

        p.setSelectedPopulation(null)
        expect(boldRows(p)).toEqual([])
    })

    it('showing another node replaces the one shown: there is only ever one', () => {
        const p = makePanel()
        p.show('5519+', ROWS, null)
        p.show('42-', ROWS.slice(0, 1), null)

        expect(document.querySelectorAll('.population-breakdown')).toHaveLength(1)
        expect(p.nodeName).toBe('42-')
        expect(p.element.querySelector('.population-breakdown__header')!.textContent).toContain('Node 42-')
        expect(rowTexts(p)).toHaveLength(1)
    })

    it('opens at the default position', () => {
        const p = makePanel()
        p.show('5519+', ROWS, null)
        expect(p.element.style.left).toBe('700px')
        expect(p.element.style.top).toBe('120px')
    })

    it('the close button closes it and reports the close', () => {
        let closes = 0
        panel = new PopulationBreakdown({
            defaultPosition: () => ({ left: 0, top: 0 }),
            onClose: () => { closes++ },
        })
        panel.show('5519+', ROWS, null)

        ;(panel.element.querySelector('.population-breakdown__close') as HTMLElement).click()

        expect(panel.isOpen).toBe(false)
        expect(panel.nodeName).toBeNull()
        expect(panel.element.style.display).toBe('none')
        expect(closes).toBe(1)
    })

    it('reopens where it was dragged to', () => {
        const p = makePanel()
        p.show('5519+', ROWS, null)

        const header = p.element.querySelector('.population-breakdown__header') as HTMLElement
        header.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 710, clientY: 130 }))
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: 910, clientY: 330 }))
        document.dispatchEvent(new MouseEvent('mouseup', {}))
        const dragged = { left: p.element.style.left, top: p.element.style.top }
        expect(dragged).not.toEqual({ left: '700px', top: '120px' })

        p.close()
        p.show('42-', ROWS, null)

        expect({ left: p.element.style.left, top: p.element.style.top }).toEqual(dragged)
    })

    it('on a short viewport its height is capped to the room below its top, so the rows scroll', () => {
        const innerHeight = window.innerHeight
        Object.defineProperty(window, 'innerHeight', { value: 400, configurable: true })
        try {
            const p = makePanel()
            p.show('5519+', ROWS, null)
            expect(p.element.style.maxHeight).toBe(`${400 - 120 - PopulationBreakdown.VIEWPORT_MARGIN_PX}px`)
        } finally {
            Object.defineProperty(window, 'innerHeight', { value: innerHeight, configurable: true })
        }
    })

    it('a press on the header that does not move it keeps the default position for later opens', () => {
        let left = 700
        panel = new PopulationBreakdown({ defaultPosition: () => ({ left, top: 120 }) })
        panel.show('5519+', ROWS, null)

        const header = panel.element.querySelector('.population-breakdown__header') as HTMLElement
        header.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 710, clientY: 130 }))
        document.dispatchEvent(new MouseEvent('mouseup', {}))
        panel.close()

        left = 500 // e.g. the window was resized while closed
        panel.show('42-', ROWS, null)
        expect(panel.element.style.left).toBe('500px')
    })

    it('a remembered position that is now off screen is brought back into the viewport', () => {
        const p = makePanel()
        p.show('5519+', ROWS, null)
        const header = p.element.querySelector('.population-breakdown__header') as HTMLElement
        header.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 0, clientY: 0 }))
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: 5000, clientY: 5000 }))
        document.dispatchEvent(new MouseEvent('mouseup', {}))
        p.close()

        p.show('42-', ROWS, null)

        expect(parseFloat(p.element.style.left)).toBeLessThan(window.innerWidth)
        expect(parseFloat(p.element.style.top)).toBeLessThan(window.innerHeight)
        expect(parseFloat(p.element.style.left)).toBeGreaterThanOrEqual(0)
        expect(parseFloat(p.element.style.top)).toBeGreaterThanOrEqual(0)
    })

    it('a press on the close button does not start a drag', () => {
        const p = makePanel()
        p.show('5519+', ROWS, null)

        const close = p.element.querySelector('.population-breakdown__close') as HTMLElement
        close.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 710, clientY: 130 }))
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: 410, clientY: 330 }))
        document.dispatchEvent(new MouseEvent('mouseup', {}))

        expect({ left: p.element.style.left, top: p.element.style.top }).toEqual({ left: '700px', top: '120px' })
    })
})
