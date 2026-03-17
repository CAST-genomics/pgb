import { describe, it, expect } from 'vitest'
import {
    aminoAcidSequenceRenderThreshold,
    calculateFeatureCoordinates,
    getFeatureLabelY,
    translationDict
} from '../rendering/featureRendererUtils.js'

describe('calculateFeatureCoordinates', () => {

    it('converts genomic coordinates to pixel coordinates', () => {
        const feature = { start: 1000, end: 2000 }
        const bpStart = 0
        const xScale = 10 // 10 bp per pixel

        const { px, px1, pw } = calculateFeatureCoordinates(feature, bpStart, xScale)

        expect(px).toBe(100)   // 1000 / 10
        expect(px1).toBe(200)  // 2000 / 10
        expect(pw).toBe(100)   // 200 - 100
    })

    it('enforces minimum width of 3px for tiny features', () => {
        const feature = { start: 1000, end: 1001 }
        const bpStart = 0
        const xScale = 10

        const { px, px1, pw } = calculateFeatureCoordinates(feature, bpStart, xScale)

        expect(pw).toBe(3)
        // px is adjusted: original 100, then shifted left by 1.5
        expect(px).toBe(100 - 1.5)
        expect(px1).toBe(100.1) // 1001 / 10
    })

    it('handles feature starting before bpStart (negative px)', () => {
        const feature = { start: 0, end: 100 }
        const bpStart = 50
        const xScale = 1

        const { px, px1, pw } = calculateFeatureCoordinates(feature, bpStart, xScale)

        expect(px).toBe(-50)
        expect(px1).toBe(50)
        expect(pw).toBe(100)
    })
})

describe('getFeatureLabelY', () => {

    it('returns featureY + 25 without transform', () => {
        expect(getFeatureLabelY(10)).toBe(35)
        expect(getFeatureLabelY(0)).toBe(25)
    })

    it('returns featureY + 20 with transform', () => {
        expect(getFeatureLabelY(10, { rotate: true })).toBe(30)
        expect(getFeatureLabelY(0, { rotate: true })).toBe(20)
    })
})

describe('aminoAcidSequenceRenderThreshold', () => {

    it('is 0.25', () => {
        expect(aminoAcidSequenceRenderThreshold).toBe(0.25)
    })
})

describe('translationDict', () => {

    it('translates start codon ATG to M (methionine)', () => {
        expect(translationDict['ATG']).toBe('M')
    })

    it('translates stop codons', () => {
        expect(translationDict['TAA']).toBe('STOP')
        expect(translationDict['TAG']).toBe('STOP')
        expect(translationDict['TGA']).toBe('STOP')
    })

    it('has 64 codons', () => {
        expect(Object.keys(translationDict)).toHaveLength(64)
    })
})
