// @vitest-environment jsdom
/**
 * `Draggable`, and specifically the one thing that is not visible in it: a card with a
 * CSS `resize` grip cannot also be draggable by its whole surface.
 *
 * The browser's resize grip is painted inside the element's own box, so a mousedown on it
 * arrives with `event.target === element` — indistinguishable, to a listener, from a grab
 * of the card itself. Whoever calls `preventDefault()` on that event wins, and `Draggable`
 * called it, so the tube map panel's grip moved the card instead of resizing it.
 *
 * jsdom has no resize grip to drive, so what is asserted is the two things the native
 * behaviour needs from us: the drag must not start, and the event must not be defaulted.
 * That is the whole contract — the browser does the rest.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { Draggable } from '../utils/draggable.js'

interface Fixture {
    card: HTMLElement
    header: HTMLElement
    body: HTMLElement
}

let draggable: { destroy(): void } | null = null

function fixture(): Fixture {
    const card = document.createElement('div')
    card.style.left = '0px'
    card.style.top = '0px'

    const header = document.createElement('div')
    header.className = 'card-header'

    const body = document.createElement('div')

    card.append(header, body)
    document.body.append(card)

    return { card, header, body }
}

/** A press, a move and a release — the whole gesture, as the document sees it. */
function drag(target: HTMLElement, from: [number, number], to: [number, number]): MouseEvent {
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: from[0], clientY: from[1] })
    target.dispatchEvent(down)
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: to[0], clientY: to[1] }))
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    return down
}

afterEach(() => {
    draggable?.destroy()
    draggable = null
    document.body.replaceChildren()
})

describe('Draggable with a handle', () => {

    it('leaves a press on the card itself to the browser, so a resize grip works', () => {
        const { card } = fixture()
        const header = card.querySelector('.card-header') as HTMLElement
        draggable = new Draggable(card, { handle: header })

        const down = drag(card, [500, 300], [560, 340])

        expect(card.style.left).toBe('0px')
        expect(card.style.top).toBe('0px')
        expect(down.defaultPrevented).toBe(false)
    })

    it('still drags from the handle', () => {
        const { card, header } = fixture()
        draggable = new Draggable(card, { handle: header })

        drag(header, [100, 100], [140, 130])

        expect(card.style.left).toBe('40px')
        expect(card.style.top).toBe('30px')
    })

    it('drags from a control inside the handle, as the header buttons are', () => {
        const { card, header } = fixture()
        const button = document.createElement('button')
        header.append(button)
        draggable = new Draggable(card, { handle: header })

        drag(button, [100, 100], [110, 100])

        expect(card.style.left).toBe('10px')
    })
})

describe('Draggable without a handle', () => {

    it('keeps grabbing the whole card — the widgets that predate the option', () => {
        const { card } = fixture()
        draggable = new Draggable(card)

        const down = drag(card, [200, 200], [230, 250])

        expect(card.style.left).toBe('30px')
        expect(card.style.top).toBe('50px')
        expect(down.defaultPrevented).toBe(true)
    })

    it('and its header', () => {
        const { card, header } = fixture()
        draggable = new Draggable(card)

        drag(header, [0, 0], [25, 0])

        expect(card.style.left).toBe('25px')
    })

    it('ignores a press on anything else inside it', () => {
        const { card, body } = fixture()
        draggable = new Draggable(card)

        drag(body, [0, 0], [25, 25])

        expect(card.style.left).toBe('0px')
    })
})
