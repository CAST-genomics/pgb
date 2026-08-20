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
 */

import { describe, expect, it } from 'vitest'
import { spell } from '../strandLabel.ts'

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
