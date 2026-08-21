// @vitest-environment jsdom
/**
 * The label is one string on one element and a wrong string is visible instantly — which is
 * why #111 gave it no tests. `spell` is the exception, and it is the exception for exactly
 * the reason this suite exists: the separation around a name's `#`s is margin on a span, and
 * an inserted thin space would draw the *same picture* while quietly changing the name.
 *
 * A researcher reads this label in order to type the name somewhere else. What is asserted
 * here is therefore the only claim the picture cannot make for itself: the characters on
 * screen are the document's own, and there are no others.
 *
 * `windowOnto` is the second exception, and it is one for the same reason. Once the label names a
 * *set* (#120) the cap has to hide names, and a cap that hid the strand actually lit on the
 * map would put a list on screen that does not contain the thing it is annotating. That
 * failure looks like a perfectly good label.
 */

import { describe, expect, it } from 'vitest'
import { createStrandLabel, spell, windowOnto } from '../strandLabel.ts'

/** What the element would read out — the text of the nodes, concatenated. */
function textOf(nodes: Node[]): string {
    return nodes.map(node => node.textContent ?? '').join('')
}

describe('spell', () => {

    it('adds no characters to a name', () => {
        for (const name of [
            'NA21309#2#CM092097.1',
            'NA21309#2#CM092102.1#0',
            'GRCh38#0#chr8',
            'CHM13#0#chr8#0'
        ]) {
            expect(textOf(spell(document, name))).toBe(name)
        }
    })

    it('wraps every separator and nothing else', () => {
        const nodes = spell(document, 'NA21309#2#CM092102.1#0')
        const wrapped = nodes.filter(node => node instanceof HTMLElement)

        expect(wrapped).toHaveLength(3)
        expect(wrapped.every(node => '#' === node.textContent)).toBe(true)
    })

    it('leaves a name with no separator as one piece', () => {
        // Nothing here counts the parts, so a shape no fixture has still comes through
        // whole rather than through a branch nobody wrote.
        const nodes = spell(document, 'chr8')

        expect(nodes).toHaveLength(1)
        expect(textOf(nodes)).toBe('chr8')
    })

    it('keeps a name that begins or ends with a separator intact', () => {
        // The empty pieces a leading or trailing separator splits out are dropped, and
        // dropping them must not drop the separator with them.
        expect(textOf(spell(document, '#HG00097#1#'))).toBe('#HG00097#1#')
    })
})

describe('windowOnto', () => {

    const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g']

    it('shows the whole set when it fits, hiding nothing', () => {
        expect(windowOnto(['a', 'b', 'c'], 1, 4)).toEqual({
            names: ['a', 'b', 'c'], emphasized: 1, above: 0, below: 0
        })
    })

    it('is byte-for-byte the single name when the set has collapsed to one', () => {
        // The zoom at which the picture stops being ambiguous. Nothing about the label may
        // betray that it can do more.
        expect(windowOnto(['only'], 0, 4)).toEqual({
            names: ['only'], emphasized: 0, above: 0, below: 0
        })
    })

    it('caps from the top when the lit strand is near the top', () => {
        expect(windowOnto(names, 0, 3)).toEqual({
            names: ['a', 'b', 'c'], emphasized: 0, above: 0, below: 4
        })
    })

    it('slides the window so the lit strand is always named', () => {
        const shown = windowOnto(names, 5, 3)

        expect(shown.names).toContain('f')
        expect(shown.names[shown.emphasized]).toBe('f')
        expect(shown.above + shown.names.length + shown.below).toBe(names.length)
    })

    it('keeps the set in its screen order, unbroken', () => {
        // A window, not a selection: what is drawn is a run of neighbours, so the order on
        // screen is still the order down the map.
        expect(windowOnto(names, 3, 3).names).toEqual(['c', 'd', 'e'])
    })

    it('clamps at the bottom rather than running off the end', () => {
        expect(windowOnto(names, 6, 3)).toEqual({
            names: ['e', 'f', 'g'], emphasized: 2, above: 4, below: 0
        })
    })

    it('always names the lit strand, wherever it is in the set', () => {
        for (let cap = 1; cap <= names.length + 2; cap += 1) {
            for (let at = 0; at < names.length; at += 1) {
                const shown = windowOnto(names, at, cap)

                expect(shown.names[shown.emphasized]).toBe(names[at])
                expect(shown.above + shown.names.length + shown.below).toBe(names.length)
            }
        }
    })
})

/**
 * The one claim #120 makes about the *rendered* label rather than about its arithmetic: at a
 * zoom where every band exceeds a pixel the set has one entry, and what is on screen must be
 * the label #111 shipped.
 *
 * `windowOnto` being byte-identical for a one-element set is asserted above and is not enough
 * — the names now go into their own row elements, which is a change to the DOM one layer below
 * where that criterion was written. What can be checked here is that the row is the emphasized
 * one, that it is the only element, and that the text is still exactly the document's name.
 * That it *looks* the same is the photograph's job:
 * `notes/sequence-tube-map/measurements/pick-set-5520-zoomed.png`.
 */
describe('a set of one', () => {

    const AT = { x: 200, y: 200 }
    const WITHIN = { width: 800, height: 600 }

    function label(names: string[], emphasized = 0): HTMLElement {
        const root = document.createElement('div')

        document.body.append(root)
        createStrandLabel(root).show(names, emphasized, AT, WITHIN)

        return root.querySelector('.stm-strand-label') as HTMLElement
    }

    it('reads out exactly the name and nothing else', () => {
        expect(label(['NA21309#2#CM092097.1']).textContent).toBe('NA21309#2#CM092097.1')
    })

    it('draws one row, and that row is the emphasized one', () => {
        const element = label(['NA21309#2#CM092097.1'])

        expect(element.querySelectorAll('.stm-strand-name')).toHaveLength(1)
        expect(element.querySelectorAll('.stm-strand-count')).toHaveLength(0)
        expect(element.querySelector('.stm-strand-name')?.classList.contains('is-emphasized'))
            .toBe(true)
    })

    it('marks exactly one row of a set, wherever the lit strand is', () => {
        const element = label(['a', 'b', 'c'], 2)
        const marked = [...element.querySelectorAll('.stm-strand-name.is-emphasized')]

        expect(marked).toHaveLength(1)
        expect(marked[0].textContent).toBe('c')
    })

    it('says how many the cap hid, and on which side', () => {
        // Six names, a cap of five, the lit one in the middle: one falls off the bottom.
        const element = label(['a', 'b', 'c', 'd', 'e', 'f'], 2)

        expect([...element.querySelectorAll('.stm-strand-count')].map(row => row.textContent))
            .toEqual(['+1 below'])
    })
})
