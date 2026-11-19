import { describe, it, expect } from 'vitest'
import { contentHeight, featureRowCount, trackGeometry } from '../annotationTrackLayout.ts'

// The vendored FeatureRenderer's defaults.
const metrics = { margin: 10, expandedRowHeight: 30, squishedRowHeight: 15 }

describe('trackGeometry — drawing and hover share one width', () => {
    it('a gene drawn at pixel x maps back, via hover, to the same bp', () => {
        const bpStart = 78_657_129
        const bpEnd = 78_876_423
        // Track narrowed by a 15px scrollbar gutter: drawing and hover must both use it.
        const g = trackGeometry(bpStart, bpEnd, 1985)

        for (const bp of [bpStart, 78_700_000, 78_805_463, bpEnd]) {
            const px = g.pxFromBp(bp)
            const param = g.paramFromPx(px)
            const bpBack = bpStart + param * (bpEnd - bpStart)
            expect(bpBack).toBeCloseTo(bp, 6)
        }
    })

    it('the right edge of the locus lands on the right edge of the drawable track', () => {
        const g = trackGeometry(1000, 2000, 800)
        expect(g.pxFromBp(2000)).toBeCloseTo(800, 9)
        expect(g.pxFromParam(1)).toBe(800)
    })
})

describe('feature rows are independent of display mode', () => {
    const features = [
        { start: 100, end: 500, row: 0 },
        { start: 200, end: 300, row: 1 },
        { start: 250, end: 900, row: 2 },
        { start: 600, end: 700, row: 0 },
        { start: 5_000, end: 6_000, row: 7 }, // outside the locus: ignored
    ]

    it('counts rows of features overlapping the locus', () => {
        expect(featureRowCount(features, 0, 1000)).toBe(3)
        expect(featureRowCount([], 0, 1000)).toBe(0)
    })

    it('Squished and Expanded lay out the same rows; only row height differs', () => {
        const rows = 9
        const expanded = contentHeight('EXPANDED', rows, 130, metrics)
        const squished = contentHeight('SQUISHED', rows, 130, metrics)
        expect((expanded - metrics.margin) / metrics.expandedRowHeight).toBe(rows)
        expect((squished - metrics.margin) / metrics.squishedRowHeight).toBe(rows)
    })

    it('content never shrinks below the fixed track height, and Collapsed never scrolls', () => {
        expect(contentHeight('EXPANDED', 1, 130, metrics)).toBe(130)
        expect(contentHeight('SQUISHED', 2, 130, metrics)).toBe(130)
        expect(contentHeight('COLLAPSED', 40, 130, metrics)).toBe(130)
    })
})
