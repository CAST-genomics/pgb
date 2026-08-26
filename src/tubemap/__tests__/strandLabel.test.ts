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
import { createStrandLabel, spell, windowOnto, type LabelledStrand } from '../strandLabel.ts'

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

/** A set as the label takes it. The colours are the part `windowOnto` never looks at, so they
 *  are distinct here only to prove the window carries each name's own one along with it. */
function set(...names: string[]): LabelledStrand[] {
    return names.map((name, at) => ({ name, color: `rgb(${at}, 0, 0)`, direction: null }))
}

/** The names a listing would draw, which is what every expectation below is about. */
function spelled(listing: { names: LabelledStrand[] }): string[] {
    return listing.names.map(strand => strand.name)
}

describe('windowOnto', () => {

    const names = set('a', 'b', 'c', 'd', 'e', 'f', 'g')

    it('shows the whole set when it fits, hiding nothing', () => {
        const shown = windowOnto(set('a', 'b', 'c'), 1, 4)

        expect(spelled(shown)).toEqual(['a', 'b', 'c'])
        expect(shown).toMatchObject({ emphasized: 1, above: 0, below: 0 })
    })

    it('is byte-for-byte the single name when the set has collapsed to one', () => {
        // The zoom at which the picture stops being ambiguous. Nothing about the label may
        // betray that it can do more.
        const shown = windowOnto(set('only'), 0, 4)

        expect(spelled(shown)).toEqual(['only'])
        expect(shown).toMatchObject({ emphasized: 0, above: 0, below: 0 })
    })

    it('carries each name\'s own colour into the window', () => {
        // The swatch is the whole point of the colour being here, and a window that shifted
        // the colours by one would paint every name with its neighbour's mark.
        expect(windowOnto(names, 5, 3).names).toEqual([
            { name: 'e', color: 'rgb(4, 0, 0)', direction: null },
            { name: 'f', color: 'rgb(5, 0, 0)', direction: null },
            { name: 'g', color: 'rgb(6, 0, 0)', direction: null }
        ])
    })

    it('caps from the top when the lit strand is near the top', () => {
        const shown = windowOnto(names, 0, 3)

        expect(spelled(shown)).toEqual(['a', 'b', 'c'])
        expect(shown).toMatchObject({ emphasized: 0, above: 0, below: 4 })
    })

    it('slides the window so the lit strand is always named', () => {
        const shown = windowOnto(names, 5, 3)

        expect(spelled(shown)).toContain('f')
        expect(shown.names[shown.emphasized].name).toBe('f')
        expect(shown.above + shown.names.length + shown.below).toBe(names.length)
    })

    it('keeps the set in its screen order, unbroken', () => {
        // A window, not a selection: what is drawn is a run of neighbours, so the order on
        // screen is still the order down the map.
        expect(spelled(windowOnto(names, 3, 3))).toEqual(['c', 'd', 'e'])
    })

    it('clamps at the bottom rather than running off the end', () => {
        const shown = windowOnto(names, 6, 3)

        expect(spelled(shown)).toEqual(['e', 'f', 'g'])
        expect(shown).toMatchObject({ emphasized: 2, above: 4, below: 0 })
    })

    it('always names the lit strand, wherever it is in the set', () => {
        for (let cap = 1; cap <= names.length + 2; cap += 1) {
            for (let at = 0; at < names.length; at += 1) {
                const shown = windowOnto(names, at, cap)

                expect(shown.names[shown.emphasized]).toEqual(names[at])
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
        createStrandLabel(root).show(set(...names), emphasized, AT, WITHIN)

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

    it('gives every row the strand\'s own colour, and spends none of it on the text', () => {
        // The swatch is the cloud's dot, moved next to the name. The measurement behind that
        // is in `strandLabel.ts`: no strand colour in either fixture reaches 3:1 against this
        // card, so a coloured *name* is one nobody could read.
        const element = label(['a', 'b', 'c'], 1)
        const swatches = [...element.querySelectorAll('.stm-strand-swatch')] as HTMLElement[]

        expect(swatches.map(swatch => swatch.style.background))
            .toEqual(['rgb(0, 0, 0)', 'rgb(1, 0, 0)', 'rgb(2, 0, 0)'])

        for (const row of element.querySelectorAll('.stm-strand-name')) {
            expect((row as HTMLElement).style.color).toBe('')
        }
    })

    it('leaves the name exactly the document\'s, swatch and all', () => {
        // The swatch is an empty element, so it adds no characters — the claim `spell` exists
        // to protect, now that something else shares the row with the name.
        expect(label(['NA21309#2#CM092102.1#0']).textContent).toBe('NA21309#2#CM092102.1#0')
    })

    it('says how many the cap hid, and on which side', () => {
        // Six names, a cap of five, the lit one in the middle: one falls off the bottom.
        const element = label(['a', 'b', 'c', 'd', 'e', 'f'], 2)

        expect([...element.querySelectorAll('.stm-strand-count')].map(row => row.textContent))
            .toEqual(['+1 below'])
    })
})

/**
 * The direction beside a name (#132).
 *
 * Two things can be silently wrong here and neither is visible in a screenshot. The first is
 * the name: the tag shares the row with it, and a researcher reads this label in order to
 * type the name somewhere else — so the element holding the name has to stay the document's
 * own characters, tag or no tag. The second is the silence: a document with nothing to say
 * about direction must draw the label #120 shipped, byte for byte, rather than a row with an
 * empty span on the end of it.
 */
describe('the direction beside a name', () => {

    const AT = { x: 200, y: 200 }
    const WITHIN = { width: 800, height: 600 }

    function label(strands: LabelledStrand[], emphasized = 0): HTMLElement {
        const root = document.createElement('div')

        document.body.append(root)
        createStrandLabel(root).show(strands, emphasized, AT, WITHIN)

        return root.querySelector('.stm-strand-label') as HTMLElement
    }

    it('says it on the row it is about, and only on those rows', () => {
        const element = label([
            { name: 'GRCh38#0#chr8', color: 'rgb(0, 0, 0)', direction: 'not inverted' },
            { name: 'HG002#1#chr8', color: 'rgb(1, 0, 0)', direction: 'inverted' },
            { name: 'HG005#1#chr8', color: 'rgb(2, 0, 0)', direction: null }
        ])

        expect([...element.querySelectorAll('.stm-strand-name')]
            .map(row => row.querySelector('.stm-strand-direction')?.textContent ?? null))
            .toEqual(['not inverted', 'inverted', null])
    })

    it('leaves the name the document\'s own, with the tag beside it', () => {
        // The claim `spell` exists to protect, now that a word shares the row: the name is
        // in its own element and that element holds nothing else.
        const element = label([
            { name: 'NA21309#2#CM092102.1#0', color: 'rgb(0, 0, 0)', direction: 'inverted' }
        ])

        expect(element.querySelector('.stm-strand-name-text')?.textContent)
            .toBe('NA21309#2#CM092102.1#0')
    })

    it('draws no tag at all where there is nothing to say', () => {
        // Four of the five documents in the corpus. An empty span would still take its
        // margin, and the label would be a shape nobody chose.
        const element = label([
            { name: 'NA21309#2#CM092097.1', color: 'rgb(0, 0, 0)', direction: null }
        ])

        expect(element.querySelectorAll('.stm-strand-direction')).toHaveLength(0)
        expect(element.textContent).toBe('NA21309#2#CM092097.1')
    })

    it('redraws when only the direction changed', () => {
        // The label keys on what is written on it, so a sweep does not rewrite the DOM 60
        // times a second. The same names with a different reading is a different label, and
        // a key that missed it would leave the previous haplotype's word beside this one.
        const root = document.createElement('div')
        const strandLabel = createStrandLabel(root)

        document.body.append(root)
        strandLabel.show([{ name: 'a', color: 'rgb(0, 0, 0)', direction: 'inverted' }], 0, AT, WITHIN)
        strandLabel.show([{ name: 'a', color: 'rgb(0, 0, 0)', direction: 'not inverted' }], 0, AT, WITHIN)

        expect(root.querySelector('.stm-strand-direction')?.textContent).toBe('not inverted')
    })
})
