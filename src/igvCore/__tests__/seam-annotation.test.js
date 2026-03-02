import { describe, it, expect, vi } from 'vitest'
import FeatureRenderer from '../rendering/featureRenderer.js'

describe('FeatureRenderer (seam test)', () => {

    function createRecordingContext() {
        const calls = []
        const handler = {
            get(target, prop) {
                if (prop in target) return target[prop]
                // Return a recording function for any canvas method
                if (typeof prop === 'string') {
                    if (!target[prop]) {
                        target[prop] = (...args) => {
                            calls.push({ method: prop, args })
                        }
                    }
                    return target[prop]
                }
            }
        }
        const ctx = new Proxy({
            // Provide methods that return values
            measureText: (text) => {
                calls.push({ method: 'measureText', args: [text] })
                return { width: text.length * 7, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 3 }
            },
            save: () => calls.push({ method: 'save', args: [] }),
            restore: () => calls.push({ method: 'restore', args: [] }),
            fillRect: (...args) => calls.push({ method: 'fillRect', args }),
            clearRect: (...args) => calls.push({ method: 'clearRect', args }),
            fillText: (...args) => calls.push({ method: 'fillText', args }),
            beginPath: () => calls.push({ method: 'beginPath', args: [] }),
            moveTo: (...args) => calls.push({ method: 'moveTo', args }),
            lineTo: (...args) => calls.push({ method: 'lineTo', args }),
            stroke: () => calls.push({ method: 'stroke', args: [] }),
            fill: () => calls.push({ method: 'fill', args: [] }),
            fillStyle: '',
            strokeStyle: '',
            globalAlpha: 1.0,
            setLineDash: () => {},
        }, handler)
        return { ctx, calls }
    }

    it('computePixelHeight returns margin + rowHeight in COLLAPSED mode', () => {
        const renderer = new FeatureRenderer({
            displayMode: 'COLLAPSED',
            browser: { genome: {}, qtlSelections: { hasPhenotype: () => false } },
        })
        const height = renderer.computePixelHeight([])
        expect(height).toBe(10 + 30) // margin(10) + expandedRowHeight(30)
    })

    it('computePixelHeight accounts for max feature row in EXPANDED mode', () => {
        const renderer = new FeatureRenderer({
            displayMode: 'EXPANDED',
            browser: { genome: {}, qtlSelections: { hasPhenotype: () => false } },
        })
        const features = [
            { row: 0 },
            { row: 1 },
            { row: 2 },
        ]
        const height = renderer.computePixelHeight(features)
        expect(height).toBe(10 + 3 * 30) // margin + (maxRow+1) * expandedRowHeight
    })

    it('getColorForFeature returns default color when no colorBy', () => {
        const renderer = new FeatureRenderer({
            color: 'rgb(0,0,150)',
            browser: { genome: {}, qtlSelections: { hasPhenotype: () => false } },
        })
        expect(renderer.getColorForFeature({})).toBe('rgb(0,0,150)')
    })

    it('getColorForFeature returns fallback when no color set', () => {
        const renderer = new FeatureRenderer({
            browser: { genome: {}, qtlSelections: { hasPhenotype: () => false } },
        })
        expect(renderer.getColorForFeature({})).toBe('rgb(0,0,150)')
    })

    it('draw calls canvas methods for features in view', () => {
        const { ctx, calls } = createRecordingContext()
        const renderer = new FeatureRenderer({
            displayMode: 'COLLAPSED',
            color: 'rgb(0,0,150)',
            browser: {
                genome: {},
                qtlSelections: { hasPhenotype: () => false },
            },
        })

        const features = [
            { name: 'BRCA2', start: 100, end: 500, strand: '+', exons: [], row: 0 },
        ]

        renderer.draw({
            features,
            context: ctx,
            bpPerPixel: 1,
            bpStart: 0,
            bpEnd: 1000,
            pixelWidth: 1000,
            pixelHeight: 40,
            chr: 'chr13',
        })

        // Should have called fillRect for the background clear
        const fillRects = calls.filter(c => c.method === 'fillRect')
        expect(fillRects.length).toBeGreaterThan(0)

        // Should have called save/restore for feature rendering
        const saves = calls.filter(c => c.method === 'save')
        expect(saves.length).toBeGreaterThan(0)
    })
})
