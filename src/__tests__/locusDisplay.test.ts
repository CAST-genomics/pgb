import { describe, it, expect } from 'vitest'
import { formatLocusString, locusDisplayItems } from '../mountLocusDisplay.ts'

describe('formatLocusString', () => {
    it('adds thousands separators to both coordinates', () => {
        expect(formatLocusString('chr8:78675042-78805463')).toBe('chr8:78,675,042-78,805,463')
    })
    it('is idempotent on already-formatted strings', () => {
        expect(formatLocusString('chr8:78,675,042-78,805,463')).toBe('chr8:78,675,042-78,805,463')
    })
    it('passes unparseable strings through untouched', () => {
        expect(formatLocusString('something odd')).toBe('something odd')
    })
})

describe('locusDisplayItems', () => {
    it('shows both loci, labelled, when they differ', () => {
        expect(locusDisplayItems({ queriedLocus: 'chr1:100-200', actualLocus: 'chr1:90-210' })).toEqual([
            { label: 'Queried Locus', value: 'chr1:100-200' },
            { label: 'Actual Locus', value: 'chr1:90-210' },
        ])
    })
    it('collapses to a single Locus when they are identical', () => {
        expect(locusDisplayItems({ queriedLocus: 'chr1:1000-2000', actualLocus: 'chr1:1,000-2,000' }))
            .toEqual([{ label: 'Locus', value: 'chr1:1,000-2,000' }])
    })
    it('shows whichever locus exists under its own label', () => {
        expect(locusDisplayItems({ queriedLocus: 'chr1:1-5', actualLocus: null }))
            .toEqual([{ label: 'Queried Locus', value: 'chr1:1-5' }])
        expect(locusDisplayItems({ queriedLocus: null, actualLocus: 'chr1:1-5' }))
            .toEqual([{ label: 'Actual Locus', value: 'chr1:1-5' }])
    })
    it('shows nothing when the dataset carries neither', () => {
        expect(locusDisplayItems({ queriedLocus: null, actualLocus: null })).toEqual([])
    })
})
