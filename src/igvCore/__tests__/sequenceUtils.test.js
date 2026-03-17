import { describe, it, expect } from 'vitest'
import { complementBase, complementSequence, reverseComplementSequence } from '../util/sequenceUtils.js'

describe('complementBase', () => {

    it('returns Watson-Crick complement for standard bases', () => {
        expect(complementBase('A')).toBe('T')
        expect(complementBase('T')).toBe('A')
        expect(complementBase('G')).toBe('C')
        expect(complementBase('C')).toBe('G')
    })

    it('handles lowercase bases', () => {
        expect(complementBase('a')).toBe('t')
        expect(complementBase('t')).toBe('a')
        expect(complementBase('g')).toBe('c')
        expect(complementBase('c')).toBe('g')
    })

    it('handles IUPAC ambiguity codes', () => {
        expect(complementBase('Y')).toBe('R')
        expect(complementBase('R')).toBe('Y')
        expect(complementBase('W')).toBe('S')
        expect(complementBase('S')).toBe('W')
        expect(complementBase('K')).toBe('M')
        expect(complementBase('M')).toBe('K')
        expect(complementBase('D')).toBe('H')
        expect(complementBase('B')).toBe('V')
    })

    it('returns unknown bases unchanged', () => {
        expect(complementBase('N')).toBe('N')
        expect(complementBase('X')).toBe('X')
    })
})

describe('complementSequence', () => {

    it('complements a DNA sequence', () => {
        expect(complementSequence('ATGC')).toBe('TACG')
    })

    it('handles mixed case', () => {
        expect(complementSequence('AtGc')).toBe('TaCg')
    })

    it('handles empty string', () => {
        expect(complementSequence('')).toBe('')
    })
})

describe('reverseComplementSequence', () => {

    it('returns reverse complement', () => {
        expect(reverseComplementSequence('ATGC')).toBe('GCAT')
    })

    it('is identity when applied twice', () => {
        const seq = 'AGTCGATCGA'
        expect(reverseComplementSequence(reverseComplementSequence(seq))).toBe(seq)
    })

    it('handles single base', () => {
        expect(reverseComplementSequence('A')).toBe('T')
    })
})
