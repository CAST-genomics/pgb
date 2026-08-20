/**
 * The appearance table is the one part of highlighting that can be silently wrong.
 *
 * Everything else about feeler mode is judged by looking — a highlight that fails to read is
 * visible immediately. These are not: a table indexed by the wrong row width emphasizes a
 * different haplotype than the cursor is on, and both pictures look like working
 * highlighting; a table sized from a constant works on every document with fewer strands than
 * the constant and truncates the rest; an emphasis column that forgets to restore leaves a
 * map permanently receded with the feeler away; and a focus that fails to *un*-emphasize the
 * strand it moved off is the trail-behind-the-cursor bug this file exists to keep dead.
 */

import { describe, expect, it } from 'vitest'
import {
    APPEARANCE_ROW,
    FLOOR_STEPS_PER_PX,
    FLOOR_CSS_PX,
    NO_FLOOR,
    PLAIN,
    RECEDED,
    createStrandAppearance,
    type StrandAppearance
} from '../strandAppearance.ts'

/** A document of `strandCount` strands, strand `i` coloured `rgb(i, 2i, 3i)`. */
function document(strandCount: number): { strandColors: Uint8Array, strandCount: number } {
    const strandColors = new Uint8Array(strandCount * 3)

    for (let id = 0; id < strandCount; id += 1) {
        strandColors[id * 3] = id % 256
        strandColors[id * 3 + 1] = (id * 2) % 256
        strandColors[id * 3 + 2] = (id * 3) % 256
    }

    return { strandColors, strandCount }
}

/** The table itself. `image.data` is typed as a bare view; every byte in it is a texel byte. */
function bytes(appearance: StrandAppearance): Uint8Array {
    return appearance.texture.image.data as Uint8Array
}

/** The four bytes the shader will fetch for `strandId`, addressed the way it addresses them. */
function texel(appearance: StrandAppearance, strandId: number): number[] {
    const data = bytes(appearance)
    const at = ((strandId / APPEARANCE_ROW | 0) * appearance.width + strandId % APPEARANCE_ROW) * 4

    return Array.from(data.subarray(at, at + 4))
}

/**
 * The four modifier bytes for `strandId`, addressed the way the shader addresses them: the
 * same column, `planeRows` rows further down. Byte 0 is the thickness floor.
 */
function modifier(appearance: StrandAppearance, strandId: number): number[] {
    const data = bytes(appearance)
    const row = (strandId / APPEARANCE_ROW | 0) + appearance.planeRows
    const at = (row * appearance.width + strandId % APPEARANCE_ROW) * 4

    return Array.from(data.subarray(at, at + 4))
}

/** The thickness floor the shader will read for `strandId`, in raw bytes. */
function floorByte(appearance: StrandAppearance, strandId: number): number {
    return modifier(appearance, strandId)[0]
}

/** The byte a floored strand carries at the shipped floor. */
const FLOORED = Math.round(FLOOR_CSS_PX * FLOOR_STEPS_PER_PX)

/** True when no strand in the document carries a floor. */
function nothingFloored(appearance: StrandAppearance, strandCount: number): boolean {
    for (let id = 0; id < strandCount; id += 1) {
        if (NO_FLOOR !== floorByte(appearance, id)) {
            return false
        }
    }

    return true
}

/** Every strand drawn as the document drew it, which is what the feeler away looks like. */
function nothingReceded(appearance: StrandAppearance, strandCount: number): boolean {
    for (let id = 0; id < strandCount; id += 1) {
        if (PLAIN !== texel(appearance, id)[3]) {
            return false
        }
    }

    return true
}

describe('createStrandAppearance', () => {

    it('sizes the table from the document, not from a constant', () => {
        // The three strand counts the survey actually found. None of them may be assumed.
        for (const strandCount of [369, 378, 464]) {
            const appearance = createStrandAppearance(document(strandCount))

            expect(appearance.width).toBe(APPEARANCE_ROW)
            expect(appearance.planeRows).toBe(Math.ceil(strandCount / APPEARANCE_ROW))

            // Two planes stacked: colour and emphasis, then the per-strand modifiers.
            expect(appearance.height).toBe(2 * appearance.planeRows)
            expect(bytes(appearance).length).toBe(appearance.width * appearance.height * 4)

            // Every strand has a texel of its own, including the last one.
            expect(texel(appearance, strandCount - 1).slice(0, 3))
                .toEqual([(strandCount - 1) % 256, (strandCount - 1) * 2 % 256, (strandCount - 1) * 3 % 256])
        }
    })

    it('is a few kilobytes at every real strand count', () => {
        // Two planes of two rows: 4 KB. The upload is still the whole table on the frame
        // that draws it, and still does not scale with the number of bands.
        for (const strandCount of [369, 378, 464]) {
            expect(bytes(createStrandAppearance(document(strandCount))).length).toBe(4096)
        }
    })

    it('carries the document colours, undimmed, with the feeler away', () => {
        const appearance = createStrandAppearance(document(464))

        expect(appearance.focused()).toBe(null)
        expect(texel(appearance, 0)).toEqual([0, 0, 0, PLAIN])
        expect(texel(appearance, 7)).toEqual([7, 14, 21, PLAIN])
        expect(texel(appearance, 463)).toEqual([463 % 256, 463 * 2 % 256, 463 * 3 % 256, PLAIN])
    })

    it('emphasizes one strand and recedes every other', () => {
        const appearance = createStrandAppearance(document(464))

        expect(appearance.focus(300)).toBe(true)
        expect(appearance.focused()).toBe(300)
        expect(texel(appearance, 300)[3]).toBe(PLAIN)
        expect(texel(appearance, 299)[3]).toBe(RECEDED)
        expect(texel(appearance, 301)[3]).toBe(RECEDED)
        expect(texel(appearance, 0)[3]).toBe(RECEDED)
        expect(texel(appearance, 463)[3]).toBe(RECEDED)
    })

    it('does not accumulate: the strand it moves off recedes with the rest', () => {
        // The behaviour this file was rewritten for. A sweep hands the emphasis along; it
        // does not leave a trail of lit strands behind the cursor.
        const appearance = createStrandAppearance(document(464))

        appearance.focus(300)
        expect(appearance.focus(301)).toBe(true)

        expect(appearance.focused()).toBe(301)
        expect(texel(appearance, 301)[3]).toBe(PLAIN)
        expect(texel(appearance, 300)[3]).toBe(RECEDED)

        // And across a whole sweep, exactly one strand is ever emphasized.
        for (let id = 0; id < 200; id += 1) {
            appearance.focus(id)

            let plain = 0

            for (let other = 0; other < 464; other += 1) {
                if (PLAIN === texel(appearance, other)[3]) {
                    plain += 1
                }
            }

            expect(plain).toBe(1)
        }
    })

    it('recedes the whole map over empty space, rather than springing back', () => {
        // A sweep crosses gaps between bands constantly. Restoring full colour in each of
        // them would strobe, and would also read as the mode switching itself off.
        const appearance = createStrandAppearance(document(464))

        appearance.focus(300)

        expect(appearance.focus(null)).toBe(true)
        expect(appearance.focused()).toBe(null)
        expect(texel(appearance, 300)[3]).toBe(RECEDED)
        expect(texel(appearance, 0)[3]).toBe(RECEDED)
        expect(nothingReceded(appearance, 464)).toBe(false)
    })

    it('recedes on the key alone, before the cursor has touched anything', () => {
        const appearance = createStrandAppearance(document(369))

        expect(appearance.focus(null)).toBe(true)
        expect(texel(appearance, 0)[3]).toBe(RECEDED)
        expect(texel(appearance, 368)[3]).toBe(RECEDED)
    })

    it('leaves the colours themselves alone — PCLAI is the map primary channel', () => {
        const appearance = createStrandAppearance(document(464))

        appearance.focus(300)

        expect(texel(appearance, 300).slice(0, 3)).toEqual([300 % 256, 600 % 256, 900 % 256])
        expect(texel(appearance, 299).slice(0, 3)).toEqual([299 % 256, 598 % 256, 897 % 256])
    })

    it('reports an unchanged focus as no change, so nothing is uploaded for it', () => {
        const appearance = createStrandAppearance(document(464))

        expect(appearance.focus(12)).toBe(true)
        expect(appearance.focus(12)).toBe(false)
        expect(appearance.focus(null)).toBe(true)
        expect(appearance.focus(null)).toBe(false)
    })

    it('treats a strand the document does not have as empty space', () => {
        const appearance = createStrandAppearance(document(369))

        expect(appearance.focus(369)).toBe(true)
        expect(appearance.focused()).toBe(null)
        expect(texel(appearance, 0)[3]).toBe(RECEDED)

        expect(appearance.focus(-1)).toBe(false)
        expect(appearance.focused()).toBe(null)
    })

    it('restores the whole map when the feeler goes away', () => {
        const appearance = createStrandAppearance(document(464))

        appearance.focus(300)

        expect(appearance.release()).toBe(true)
        expect(appearance.focused()).toBe(null)
        expect(nothingReceded(appearance, 464)).toBe(true)

        expect(appearance.release()).toBe(false)
    })

    it('floors the focused strand and nothing else', () => {
        const appearance = createStrandAppearance(document(464))

        expect(nothingFloored(appearance, 464)).toBe(true)

        appearance.focus(300)

        expect(floorByte(appearance, 300)).toBe(FLOORED)
        expect(floorByte(appearance, 299)).toBe(NO_FLOOR)
        expect(floorByte(appearance, 301)).toBe(NO_FLOOR)
        expect(floorByte(appearance, 0)).toBe(NO_FLOOR)
        expect(floorByte(appearance, 463)).toBe(NO_FLOOR)
    })

    it('reads the floor from the texel the shader will fetch, past the row boundary', () => {
        // The one way this can be silently wrong. Strand 300 sits in the second row of each
        // plane, so a modifier plane addressed as "one row down" rather than "planeRows down"
        // would floor a strand the cursor is nowhere near, and both pictures look like a
        // working floor.
        const appearance = createStrandAppearance(document(464))
        const data = bytes(appearance)

        appearance.focus(300)

        // Written where the shader looks: column 44 of plane 1's second row.
        const at = ((appearance.planeRows + 1) * appearance.width + 44) * 4

        expect(data[at]).toBe(FLOORED)

        // And nowhere else in the table. A floor leaking into the colour plane would be a
        // haplotype quietly repainted.
        let floored = 0

        for (let id = 0; id < 464; id += 1) {
            if (NO_FLOOR !== floorByte(appearance, id)) {
                floored += 1
            }

            expect(texel(appearance, id).slice(0, 3))
                .toEqual([id % 256, id * 2 % 256, id * 3 % 256])
        }

        expect(floored).toBe(1)
    })

    it('addresses the modifier plane on a document that fits in one row', () => {
        // Both planes are one row tall here, so an offset of "one row" and an offset of
        // "planeRows" agree — which is exactly why this cannot be the only case tested, and
        // why it has to be tested too: the shipped documents have 369 to 464 strands, and a
        // smaller one must not read its floor out of its own colour.
        const appearance = createStrandAppearance(document(200))

        expect(appearance.planeRows).toBe(1)
        expect(appearance.height).toBe(2)

        appearance.focus(199)

        expect(floorByte(appearance, 199)).toBe(FLOORED)
        expect(texel(appearance, 199).slice(0, 3)).toEqual([199, 398 % 256, 597 % 256])
        expect(nothingFloored(appearance, 199)).toBe(true)
    })

    it('moves the floor with the emphasis, and never leaves one behind', () => {
        const appearance = createStrandAppearance(document(464))

        appearance.focus(300)
        appearance.focus(301)

        expect(floorByte(appearance, 300)).toBe(NO_FLOOR)
        expect(floorByte(appearance, 301)).toBe(FLOORED)

        // Across a sweep, exactly one strand carries a floor — the same one that is lit.
        for (let id = 0; id < 200; id += 1) {
            appearance.focus(id)

            let floored = 0

            for (let other = 0; other < 464; other += 1) {
                if (NO_FLOOR !== floorByte(appearance, other)) {
                    floored += 1
                }
            }

            expect(floored).toBe(1)
            expect(floorByte(appearance, id)).toBe(FLOORED)
        }
    })

    it('floors nothing over empty space, and nothing on the key alone', () => {
        const appearance = createStrandAppearance(document(464))

        appearance.focus(null)
        expect(nothingFloored(appearance, 464)).toBe(true)

        appearance.focus(300)
        appearance.focus(null)
        expect(nothingFloored(appearance, 464)).toBe(true)
    })

    it('releases the floor with the emphasis', () => {
        // Story 4: the strand deflates to its true hairline the instant the key comes up, so
        // a dilated band on screen always means the feeler is out.
        const appearance = createStrandAppearance(document(464))

        appearance.focus(300)
        appearance.release()

        expect(nothingFloored(appearance, 464)).toBe(true)
        expect(nothingReceded(appearance, 464)).toBe(true)
    })

    it('carries the floor the surface was built with, in 1/32 css pixel steps', () => {
        // The sweep's affordance: the value is a per-strand byte, so a different floor is a
        // different byte and not a different mechanism.
        for (const floorCssPx of [1, 1.5, 2, 3]) {
            const appearance = createStrandAppearance(document(369), { floorCssPx })

            appearance.focus(7)

            expect(floorByte(appearance, 7)).toBe(floorCssPx * FLOOR_STEPS_PER_PX)
        }

        // A floor of zero is the mechanism switched off: the table says "no floor", which is
        // what every unfocused strand says, so the shader clamps nothing anywhere.
        const off = createStrandAppearance(document(369), { floorCssPx: 0 })

        off.focus(7)

        expect(floorByte(off, 7)).toBe(NO_FLOOR)
        expect(texel(off, 7)[3]).toBe(PLAIN)
    })

    it('costs the same to move the focus as to set it, and nothing scales with the map', () => {
        // Not a timing test — the claim is structural. Each write touches one byte per strand
        // and nothing per band, so what it costs cannot depend on where the focus was, where
        // it is going, or how far the cursor moved. Timing lives in
        // `scripts/verify_highlight.mjs`, on a real GPU.
        const appearance = createStrandAppearance(document(464))
        const touched: number[] = []
        const data = bytes(appearance)

        for (let id = 0; id < 200; id += 1) {
            const before = Array.from(data)

            appearance.focus(id)

            let changed = 0

            for (let byte = 0; byte < data.length; byte += 1) {
                if (data[byte] !== before[byte]) {
                    changed += 1
                }
            }

            touched.push(changed)
        }

        // The first focus recedes 463 strands, leaves one alone, and floors that one. Every
        // move after it un-emphasizes one strand and emphasizes another, and moves the floor
        // between the same two: four bytes, forever.
        expect(touched[0]).toBe(464)
        expect(touched.slice(1)).toEqual(new Array(199).fill(4))
    })
})
