import { describe, it, expect } from 'vitest'
import { parseLocusString } from '../search/geneSearch.js'

describe('parseLocusString', () => {

    it('parses chr:start-end format', () => {
        const result = parseLocusString('chr7:55,086,724-55,275,031')
        expect(result).toEqual({
            chr: 'chr7',
            start: 55086723,  // 1-based to 0-based
            end: 55275031,
        })
    })

    it('parses chr:position (single position) with padding', () => {
        const result = parseLocusString('chr1:1000')
        expect(result).toEqual({
            chr: 'chr1',
            start: 979,   // 999 - 20
            end: 1020,     // 1000 + 20
        })
    })

    it('parses tab-delimited locus (BED-like)', () => {
        const result = parseLocusString('chr7\t55086724\t55275031')
        expect(result).toEqual({
            chr: 'chr7',
            start: 55086723,  // 1-based to 0-based
            end: 55275031,
        })
    })

    it('returns chr only when no range given', () => {
        const result = parseLocusString('chr1')
        expect(result).toEqual({ chr: 'chr1' })
    })

    it('returns undefined for invalid range format', () => {
        const result = parseLocusString('chr1:abc-def')
        expect(result).toBeUndefined()
    })

    it('returns undefined for triple-dash format without softclip', () => {
        // e.g. chr1:100-200-300 is ambiguous
        const result = parseLocusString('chr1:100-200-300')
        expect(result).toBeUndefined()
    })

    it('handles negative coordinates with softclip', () => {
        const result = parseLocusString('chr1:-100-200', true)
        expect(result).toEqual({
            chr: 'chr1',
            start: -101,  // -100 in 1-based → -101 in 0-based
            end: 200,
        })
    })
})
