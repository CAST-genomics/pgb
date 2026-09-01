/**
 * The frame is four numbers of arithmetic and it is exactly the kind that goes wrong
 * silently: a sign or a missing half puts the whole picture a fixed distance from where it
 * belongs, which looks like a picture. It is extracted so that two readers cannot disagree
 * about it (#144), and these are the tests the second reader inherits.
 */

import { describe, expect, it } from 'vitest'
import { documentFrame } from '../documentFrame.ts'

describe('documentFrame', () => {

    it('puts the centre of a viewBox at the origin half way along each extent', () => {
        expect(documentFrame(0, 0, 200, 80).centre).toEqual({ x: 100, y: 40 })
    })

    it('carries the viewBox min into the centre, so an offset document still centres', () => {
        expect(documentFrame(11, 5, 200, 80).centre).toEqual({ x: 111, y: 45 })
    })

    it('handles a negative min, which is a viewBox reaching left of its own origin', () => {
        expect(documentFrame(-40, -10, 200, 80).centre).toEqual({ x: 60, y: 30 })
    })

    it('reports the content as the viewBox extent, verbatim', () => {
        expect(documentFrame(11, 5, 108983, 5591).content).toEqual({ width: 108983, height: 5591 })
    })

    /**
     * The flip is applied at the call sites, not here, so what is checked is that the
     * centre this returns is the one that makes it come out right: the document's top
     * edge lands at +height/2 and its bottom edge at -height/2, which is what "y0 names
     * the band's upper edge and thickness extends in -y" rests on. Spelled out as the two
     * subtractions the callers perform, because a centre off by half an extent — or a
     * frame that centred on the min rather than the middle — passes every check above.
     */
    it('yields a centre that maps the document top above the origin and the bottom below', () => {
        const { centre } = documentFrame(11, 5, 200, 80)

        expect(centre.y - 5).toBe(40)
        expect(centre.y - 85).toBe(-40)
        expect(11 - centre.x).toBe(-100)
        expect(211 - centre.x).toBe(100)
    })
})
