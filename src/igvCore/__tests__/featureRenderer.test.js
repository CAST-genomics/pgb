import { describe, it, expect } from 'vitest'
import FeatureRenderer from '../rendering/featureRenderer.js'

function createRecordingContext() {
    const calls = []
    const ctx = {
        fillStyle: '',
        strokeStyle: '',
        globalAlpha: 1.0,
        font: '',
        save() { calls.push({ method: 'save' }) },
        restore() { calls.push({ method: 'restore' }) },
        fillRect(...args) { calls.push({ method: 'fillRect', args }) },
        clearRect(...args) { calls.push({ method: 'clearRect', args }) },
        fillText(...args) { calls.push({ method: 'fillText', args }) },
        strokeText(...args) { calls.push({ method: 'strokeText', args }) },
        beginPath() { calls.push({ method: 'beginPath' }) },
        moveTo(...args) { calls.push({ method: 'moveTo', args }) },
        lineTo(...args) { calls.push({ method: 'lineTo', args }) },
        stroke() { calls.push({ method: 'stroke' }) },
        fill() { calls.push({ method: 'fill' }) },
        arc(...args) { calls.push({ method: 'arc', args }) },
        setLineDash() {},
        measureText(text) {
            return { width: text.length * 7, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 3 }
        },
        translate(...args) { calls.push({ method: 'translate', args }) },
        scale(...args) { calls.push({ method: 'scale', args }) },
        rotate(...args) { calls.push({ method: 'rotate', args }) },
    }
    return { ctx, calls }
}

function createRenderer(overrides = {}) {
    return new FeatureRenderer({
        displayMode: 'COLLAPSED',
        color: 'rgb(0,0,150)',
        browser: {
            genome: { getSequenceInterval: () => undefined },
            qtlSelections: { hasPhenotype: () => false },
        },
        ...overrides,
    })
}

describe('FeatureRenderer — characterization', () => {

    describe('computePixelHeight', () => {

        it('COLLAPSED: returns margin + expandedRowHeight regardless of feature rows', () => {
            const renderer = createRenderer({ displayMode: 'COLLAPSED' })
            expect(renderer.computePixelHeight([{ row: 5 }])).toBe(40) // 10 + 30
        })

        it('EXPANDED: height scales with max row', () => {
            const renderer = createRenderer({ displayMode: 'EXPANDED' })
            expect(renderer.computePixelHeight([{ row: 0 }, { row: 4 }])).toBe(10 + 5 * 30) // 160
        })

        it('SQUISHED: uses squishedRowHeight', () => {
            const renderer = createRenderer({ displayMode: 'SQUISHED' })
            expect(renderer.computePixelHeight([{ row: 0 }, { row: 2 }])).toBe(10 + 3 * 15) // 55
        })

        it('handles undefined features gracefully', () => {
            const renderer = createRenderer({ displayMode: 'EXPANDED' })
            expect(renderer.computePixelHeight(undefined)).toBe(10 + 30) // margin + 1 row
        })

        it('handles features without row property', () => {
            const renderer = createRenderer({ displayMode: 'EXPANDED' })
            expect(renderer.computePixelHeight([{}, {}])).toBe(10 + 30) // maxRow stays 0
        })
    })

    describe('getColorForFeature', () => {

        it('returns configured color', () => {
            const renderer = createRenderer({ color: 'red' })
            expect(renderer.getColorForFeature({})).toBe('red')
        })

        it('returns default rgb(0,0,150) when no color configured', () => {
            const renderer = createRenderer({ color: undefined })
            expect(renderer.getColorForFeature({})).toBe('rgb(0,0,150)')
        })

        it('colorBy=function uses SNP color priorities', () => {
            const renderer = createRenderer({ colorBy: 'function', type: 'SNP' })
            const feature = { func: 'missense' }
            const color = renderer.getColorForFeature(feature)
            expect(color).toBe('rgb(255,0,0)') // priority 3 → snpColors[3]
        })

        it('colorBy=class maps deletion to red', () => {
            const renderer = createRenderer({ colorBy: 'class', type: 'SNP' })
            const feature = { class: 'deletion' }
            const color = renderer.getColorForFeature(feature)
            expect(color).toBe('rgb(255,0,0)') // snpColors[3]
        })
    })

    describe('draw — characterization snapshot', () => {

        it('renders a single-exon feature (no exons array)', () => {
            const { ctx, calls } = createRecordingContext()
            const renderer = createRenderer()
            const features = [
                { name: 'FEAT1', start: 100, end: 200, strand: '+', row: 0 },
            ]

            renderer.draw({
                features,
                context: ctx,
                bpPerPixel: 1,
                bpStart: 0,
                bpEnd: 1000,
                pixelWidth: 1000,
                pixelHeight: 40,
                chr: 'chr1',
            })

            // Background clear
            expect(calls[0]).toEqual({ method: 'fillRect', args: [0, 0, 1000, 40] })

            // Feature rendering should include save/fillRect/restore
            const saveCount = calls.filter(c => c.method === 'save').length
            const restoreCount = calls.filter(c => c.method === 'restore').length
            expect(saveCount).toBe(restoreCount)
            expect(saveCount).toBeGreaterThan(0)
        })

        it('renders a multi-exon feature with intron line and exon blocks', () => {
            const { ctx, calls } = createRecordingContext()
            const renderer = createRenderer()
            const features = [
                {
                    name: 'GENE1', start: 100, end: 500, strand: '+', row: 0,
                    cdStart: 150, cdEnd: 450,
                    exons: [
                        { start: 100, end: 200, utr: true },
                        { start: 250, end: 350 },
                        { start: 400, end: 500, cdEnd: 450 },
                    ],
                },
            ]

            renderer.draw({
                features,
                context: ctx,
                bpPerPixel: 1,
                bpStart: 0,
                bpEnd: 1000,
                pixelWidth: 1000,
                pixelHeight: 40,
                chr: 'chr1',
            })

            // Should have fillRect calls for exon blocks
            const fillRects = calls.filter(c => c.method === 'fillRect')
            expect(fillRects.length).toBeGreaterThan(1) // background + exon blocks

            // Should have stroked intron line (beginPath, moveTo, lineTo, stroke)
            const beginPaths = calls.filter(c => c.method === 'beginPath')
            expect(beginPaths.length).toBeGreaterThan(0)
        })

        it('skips features entirely outside the view', () => {
            const { ctx, calls } = createRecordingContext()
            const renderer = createRenderer()
            const features = [
                { name: 'OUTSIDE', start: 2000, end: 3000, strand: '+', row: 0 },
            ]

            renderer.draw({
                features,
                context: ctx,
                bpPerPixel: 1,
                bpStart: 0,
                bpEnd: 1000,
                pixelWidth: 1000,
                pixelHeight: 40,
                chr: 'chr1',
            })

            // Only the background fillRect — no save/restore for feature rendering
            const saves = calls.filter(c => c.method === 'save')
            expect(saves).toHaveLength(0)
        })
    })
})
