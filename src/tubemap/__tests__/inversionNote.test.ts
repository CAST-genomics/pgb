// @vitest-environment jsdom

/**
 * The caption is judged by looking at it — where it sits over a 14:1 strip and whether it
 * reads as the map's own statement is not a thing a unit test can see.
 *
 * What is here is the part that can be silently wrong without looking wrong: that a document
 * with nothing to say leaves *nothing on screen* rather than an empty pill, and that opening
 * a second document cannot leave the first one's sentence over it. Both are about the
 * absence of an element, which is exactly what a picture of a map does not show.
 */

import { describe, expect, it } from 'vitest'
import { censusInversion } from '../inversion.ts'
import { createInversionNote } from '../inversionNote.ts'
import { directedDocument as document } from './directedDocument.ts'

/** The caption is handed a census rather than a document (#132): the surface takes it once
 *  and reads the same fold for the direction beside each haplotype's name. */
const census = censusInversion

const INVERTED = census(document([
    { name: 'GRCh38#0#chr8[10078919-10080674]', bands: '=<=<=' },
    { name: 'CHM13#0#chr8#0', bands: '=>=' },
    { name: 'HG002#1#chr8', bands: '=<=' }
]))

const UNIFORM = census(document([
    { name: 'GRCh38#0#chr1', bands: '=>=' },
    { name: 'HG002#1#chr1', bands: '=>=' }
]))

function note(): { root: HTMLElement, said: () => string | null } {
    const root = window.document.createElement('div')

    window.document.body.append(root)

    return {
        root,
        said(): string | null {
            const element = root.querySelector('.stm-inversion') as HTMLElement | null

            return null === element || element.hidden ? null : element.textContent
        }
    }
}

describe('createInversionNote', () => {

    it('states the count over a document that has one', () => {
        const { root, said } = note()

        createInversionNote(root).show(INVERTED)

        expect(said()).toBe('1 of 3 haplotypes inverted')
    })

    it('shows nothing at all over a document whose haplotypes all run one way', () => {
        const { root, said } = note()

        createInversionNote(root).show(UNIFORM)

        expect(said()).toBeNull()
        expect((root.querySelector('.stm-inversion') as HTMLElement).hidden).toBe(true)
    })

    it('does not leave one document’s sentence over the next', () => {
        // The failure this guards is a caption that is still true of the document before
        // last — the same class of error as a stale map under a valid header, and unlike a
        // stale map it looks entirely correct.
        const { root, said } = note()
        const shown = createInversionNote(root)

        shown.show(INVERTED)
        shown.show(UNIFORM)

        expect(said()).toBeNull()
    })

    it('takes the sentence off screen when the map goes', () => {
        const { root, said } = note()
        const shown = createInversionNote(root)

        shown.show(INVERTED)
        shown.clear()

        expect(said()).toBeNull()

        shown.clear()

        expect(said()).toBeNull()
    })

    it('leaves nothing behind when destroyed', () => {
        const { root } = note()
        const shown = createInversionNote(root)

        shown.show(INVERTED)
        shown.destroy()

        expect(root.querySelector('.stm-inversion')).toBeNull()
    })
})
