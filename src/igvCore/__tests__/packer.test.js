import { describe, it, expect } from 'vitest'
import pack from '../layout/featurePacker.js'
import { packFeatures } from '../feature/featureUtils.js'

describe('pack', () => {

    it('assigns row 0 to non-overlapping features', () => {
        const features = [
            { start: 0, end: 10 },
            { start: 20, end: 30 },
            { start: 40, end: 50 },
        ]
        pack(features)
        for (const f of features) {
            expect(f.row).toBe(0)
        }
    })

    it('assigns different rows to overlapping features', () => {
        const features = [
            { start: 0, end: 100 },
            { start: 50, end: 150 },
            { start: 120, end: 200 },
        ]
        pack(features)
        expect(features[0].row).toBe(0)
        expect(features[1].row).toBe(1) // overlaps feature[0]
        expect(features[2].row).toBe(0) // starts after feature[0] ends
    })

    it('respects maxRows limit', () => {
        const features = [
            { start: 0, end: 100 },
            { start: 10, end: 110 },
            { start: 20, end: 120 },
        ]
        pack(features, 2)
        // First two features get rows 0 and 1
        expect(features[0].row).toBe(0)
        expect(features[1].row).toBe(1)
        // Third feature: both rows occupied, but maxRows=2 so it spills to row 2
        // (the function doesn't prevent assignment, it just limits the search)
        expect(features[2].row).toBe(2)
    })

    it('handles empty feature list', () => {
        const features = []
        pack(features)
        expect(features).toHaveLength(0)
    })

    it('sorts features by start position', () => {
        const features = [
            { start: 50, end: 60 },
            { start: 10, end: 20 },
            { start: 30, end: 40 },
        ]
        pack(features)
        // After packing, features are sorted in-place
        expect(features[0].start).toBe(10)
        expect(features[1].start).toBe(30)
        expect(features[2].start).toBe(50)
        // All non-overlapping → row 0
        for (const f of features) {
            expect(f.row).toBe(0)
        }
    })
})

describe('packFeatures', () => {

    it('packs features segregated by chromosome', () => {
        const features = [
            { chr: 'chr1', start: 0, end: 100 },
            { chr: 'chr1', start: 50, end: 150 },
            { chr: 'chr2', start: 50, end: 150 },
        ]
        packFeatures(features, 1000)
        // chr1 features overlap → different rows
        expect(features[0].row).toBe(0)
        expect(features[1].row).toBe(1)
        // chr2 feature is packed independently → row 0
        expect(features[2].row).toBe(0)
    })

    it('handles null/empty features gracefully', () => {
        expect(() => packFeatures(null)).not.toThrow()
        expect(() => packFeatures([])).not.toThrow()
    })

    it('respects filter function', () => {
        const features = [
            { chr: 'chr1', start: 0, end: 100, visible: true },
            { chr: 'chr1', start: 50, end: 150, visible: false },
        ]
        packFeatures(features, 1000, f => f.visible)
        expect(features[0].row).toBe(0)
        expect(features[1].row).toBeUndefined()
    })
})
