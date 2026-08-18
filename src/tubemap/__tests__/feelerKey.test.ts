// @vitest-environment jsdom
/**
 * Who owns `Shift`.
 *
 * The listeners are on the window, because a key has no position and the mode has to end
 * when the window loses focus. But *entering* the mode is a claim on a key the rest of PGB
 * also uses, and the panel is one card floating over an app that is still there. Holding
 * `Shift` with the cursor on the 3D graph — or in a screen-capture shortcut — used to arm
 * the feeler and put its badge on screen.
 *
 * So the mode is entered only while the pointer is over the surface, and leaving with the
 * key still down ends it. The key coming up ends it from anywhere, which is not a
 * symmetry to fix: a mode that could only be left where it was entered would strand the
 * surface in it.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { watchFeelerKey, type FeelerKey } from '../feelerKey.ts'

let feeler: FeelerKey | null = null
let root: HTMLElement

function shift(type: 'keydown' | 'keyup'): void {
    window.dispatchEvent(new KeyboardEvent(type, { key: 'Shift', bubbles: true }))
}

function pointer(type: string, target: HTMLElement = root): void {
    target.dispatchEvent(new Event(type, { bubbles: type === 'pointermove' }))
}

beforeEach(() => {
    document.body.replaceChildren()
    root = document.createElement('div')
    document.body.append(root)
})

afterEach(() => {
    feeler?.destroy()
    feeler = null
})

describe('watchFeelerKey', () => {

    it('ignores Shift while the pointer is elsewhere in the app', () => {
        const onEnter = vi.fn()
        feeler = watchFeelerKey({ root, onEnter, onLeave: () => {} })

        shift('keydown')

        expect(onEnter).not.toHaveBeenCalled()
        expect(feeler.active()).toBe(false)
        expect(root.classList.contains('is-feeling')).toBe(false)
    })

    it('enters when the pointer is over the surface', () => {
        const onEnter = vi.fn()
        feeler = watchFeelerKey({ root, onEnter, onLeave: () => {} })

        pointer('pointerenter')
        shift('keydown')

        expect(onEnter).toHaveBeenCalledOnce()
        expect(feeler.active()).toBe(true)
    })

    it('counts a move over the surface as being on it, for a card mounted under the cursor', () => {
        feeler = watchFeelerKey({ root, onEnter: () => {}, onLeave: () => {} })

        pointer('pointermove')
        shift('keydown')

        expect(feeler.active()).toBe(true)
    })

    it('leaves when the pointer goes, even with the key still down', () => {
        const onLeave = vi.fn()
        feeler = watchFeelerKey({ root, onEnter: () => {}, onLeave })

        pointer('pointerenter')
        shift('keydown')
        pointer('pointerleave')

        expect(onLeave).toHaveBeenCalledOnce()
        expect(feeler.active()).toBe(false)
    })

    it('does not re-arm on a repeat keydown after the pointer has left', () => {
        feeler = watchFeelerKey({ root, onEnter: () => {}, onLeave: () => {} })

        pointer('pointerenter')
        shift('keydown')
        pointer('pointerleave')
        shift('keydown')

        expect(feeler.active()).toBe(false)
    })

    it('still leaves on key-up from anywhere, and on the window losing focus', () => {
        feeler = watchFeelerKey({ root, onEnter: () => {}, onLeave: () => {} })

        pointer('pointerenter')
        shift('keydown')
        shift('keyup')
        expect(feeler.active()).toBe(false)

        shift('keydown')
        expect(feeler.active()).toBe(true)
        window.dispatchEvent(new Event('blur'))
        expect(feeler.active()).toBe(false)
    })
})
