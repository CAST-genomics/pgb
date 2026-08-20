/**
 * `beside` is the arithmetic two things that follow the same cursor agree on — the segment
 * tooltip and the strand name label — and it is the kind that can be wrong without looking
 * wrong. A version that clamped instead of flipping puts the label under the pointer at the
 * right edge, which is a picture of a working label taken half a second before the thing it
 * names goes under it; a sign error puts it on the wrong side everywhere, which reads as a
 * style choice. Neither shows up as an exception.
 */

import { describe, expect, it } from 'vitest'
import { beside } from '../geometry.ts'

describe('beside', () => {

    it('sits past the cursor by the offset when there is room', () => {
        expect(beside(100, 80, 500, 14)).toBe(114)
    })

    it('flips to the near side rather than pinning against the far edge', () => {
        // 460 + 14 + 80 overruns 500, so the label goes to the *left* of the cursor. Pinned
        // instead — at 500 - 80 = 420 — it would cover the cursor at 460.
        const left = beside(460, 80, 500, 14)

        expect(left).toBe(366)
        expect(left + 80).toBeLessThan(460)
    })

    it('pins to zero when it fits on neither side', () => {
        // Wider than the surface: there is no honest answer, and the near edge is the one
        // that keeps the start of the text readable.
        expect(beside(60, 600, 500, 14)).toBe(0)
    })

    it('takes the far side at the exact boundary', () => {
        // at + offset + extent === within is still inside a half-open surface, so it does
        // not flip. One pixel further does.
        expect(beside(406, 80, 500, 14)).toBe(420)
        expect(beside(407, 80, 500, 14)).toBe(313)
    })
})
