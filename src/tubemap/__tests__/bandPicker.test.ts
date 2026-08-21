/**
 * The pick pass answers in bytes, and the two ways to read those bytes wrongly are both
 * silent: a swapped byte order names a plausible wrong haplotype, and treating black as
 * empty space loses strand 0 — which is `CHM13#0#chr1` on every document we have, a
 * reference and one of the strands a researcher reaches for first.
 *
 * The pass itself needs a GPU and is judged by looking. This is the half that does not.
 */

import { describe, expect, it } from 'vitest'
import { decodeStrandId, readStrandColumn } from '../bandPicker.ts'

/** What the shader writes: low byte in red, high byte in green, alpha 1 for a hit. */
function hit(id: number): Uint8Array {
    return new Uint8Array([id % 256, Math.floor(id / 256), 0, 255])
}

describe('decodeStrandId', () => {

    it('reads the low byte from red and the high byte from green', () => {
        expect(decodeStrandId(hit(0))).toBe(0)
        expect(decodeStrandId(hit(1))).toBe(1)
        expect(decodeStrandId(hit(255))).toBe(255)
        expect(decodeStrandId(hit(256))).toBe(256)
        expect(decodeStrandId(hit(368))).toBe(368)
    })

    it('round-trips every id the parser will admit', () => {
        // MAX_STRAND_ID is 65535 precisely because two bytes is what this encoding has.
        for (let id = 0; id <= 65535; id += 1) {
            expect(decodeStrandId(hit(id))).toBe(id)
        }
    })

    it('does not confuse the byte order', () => {
        // 258 = 0x0102. Low first is red 2, green 1; the other way round reads 513.
        expect(decodeStrandId(new Uint8Array([2, 1, 0, 255]))).toBe(258)
    })

    it('reports empty space rather than a strand', () => {
        expect(decodeStrandId(new Uint8Array([0, 0, 0, 0]))).toBeNull()
    })

    it('keeps strand 0 distinguishable from empty space', () => {
        // Both are black. Only alpha separates them, which is the whole reason the pick
        // target is cleared transparent instead of to some reserved colour.
        expect(decodeStrandId(hit(0))).toBe(0)
        expect(decodeStrandId(new Uint8Array([0, 0, 0, 0]))).toBeNull()
    })
})

/**
 * The column, bottom-to-top as `readRenderTargetPixels` hands it over: row 0 is the bottom
 * of the pick window, which is the *lowest* point on screen. Every expectation below is
 * written in screen order — top first — so the reversal is being asserted, not assumed.
 */
function column(...rows: (number | null)[]): Uint8Array {
    const bytes = new Uint8Array(rows.length * 4)

    rows.forEach((id, row) => {
        if (null === id) {
            return
        }

        bytes.set(hit(id), row * 4)
    })

    return bytes
}

describe('readStrandColumn', () => {

    it('reads the column top to bottom, not the way the GPU hands it over', () => {
        // Bottom-to-top the rows are 7, 7, 3, 3 — so on screen, 3 is above 7.
        expect(readStrandColumn(column(7, 7, 3, 3)).strandIds).toEqual([3, 7])
    })

    it('names every strand under the cursor, not the last one drawn', () => {
        expect(readStrandColumn(column(4, 3, 2, 1, 0)).strandIds).toEqual([0, 1, 2, 3, 4])
    })

    it('says each strand once, keeping where it first appears', () => {
        // A band lapping back over one it already crossed must not be named twice, and
        // must not be moved down the list by the second crossing.
        expect(readStrandColumn(column(9, 5, 9, 9, 2)).strandIds).toEqual([2, 9, 5])
    })

    it('skips the rows that hold no band', () => {
        expect(readStrandColumn(column(null, 6, null, 1, null)).strandIds).toEqual([1, 6])
    })

    it('answers with nothing over empty space', () => {
        expect(readStrandColumn(column(null, null, null, null)).strandIds).toEqual([])
    })

    it('keeps strand 0 in the list rather than reading it as a gap', () => {
        expect(readStrandColumn(column(null, 0, null)).strandIds).toEqual([0])
    })

    it('collapses to a single name where one band owns the whole window', () => {
        // The self-annulling property, in the decoder: magnified far enough that one band
        // covers every sample, the answer is the one name the label showed before #120.
        expect(readStrandColumn(column(11, 11, 11, 11, 11, 11)).strandIds).toEqual([11])
    })

    it('reads a one-sample column exactly as the 1x1 target did', () => {
        expect(readStrandColumn(column(42)).strandIds).toEqual([42])
        expect(readStrandColumn(column(null)).strandIds).toEqual([])
    })
})

/** The strand the column says the cursor is on, by name rather than by index — which is what
 *  every expectation below is actually about. `null` when nothing is under the cursor. */
function lit(bytes: Uint8Array): number | null {
    const { strandIds, nearest } = readStrandColumn(bytes)

    return strandIds[nearest] ?? null
}

describe('readStrandColumn · which one the cursor is on', () => {

    it('takes the strand whose sample lies closest to the cursor', () => {
        // Five rows: the cursor is the middle one, row 2 counting from the bottom.
        expect(lit(column(9, 8, 7, 6, 5))).toBe(7)
    })

    it('reaches outward when the middle rows are empty', () => {
        expect(lit(column(9, null, null, null, 5))).toBe(5)
    })

    it('resolves a tie upward, the way the list is ordered', () => {
        // Four rows: rows 1 and 2 are equally close to the middle. Row 2 is the upper one,
        // and is the one the list names first.
        const ids = column(9, 8, 7, 6)

        expect(lit(ids)).toBe(7)
        expect(readStrandColumn(ids).strandIds).toEqual([6, 7, 8, 9])
    })

    it('is null over empty space', () => {
        expect(lit(column(null, null, null))).toBeNull()
    })

    it('is always one of the strands the column names', () => {
        const ids = column(4, null, 3, 3, null, 8)

        expect(readStrandColumn(ids).strandIds).toContain(lit(ids))

        // And structurally, not just here: `nearest` indexes the list rather than repeating
        // an id beside it, so the two cannot come apart.
        const { strandIds, nearest } = readStrandColumn(ids)

        expect(strandIds[nearest]).toBe(lit(ids))
    })
})
