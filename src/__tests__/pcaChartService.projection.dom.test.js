// @vitest-environment jsdom

/**
 * Characterization tests for pcaChartService projection math.
 *
 * These tests pin the CURRENT projection behavior of pcaChartService so that
 * the upcoming refactor (extract PcaCoordinateSpace + PcaChartRenderer, roadmap
 * entry #6) has a black-box spec to preserve. They target the math that maps
 *
 *     data coordinate (x, y) → dot pixel position (left, top) + dot size
 *
 * through the service's current code path. Nothing is mocked on the hot path:
 * finishInitialization() and renderDotsFromCoordinateDataMap() are called
 * directly on the real singleton, dots are rendered into the real jsdom
 * chartSurface, and their inline styles are read back.
 *
 * If these assertions change meaning during the refactor, the refactor has
 * changed observable behavior — investigate before accepting.
 *
 * Reference lines (main branch at time of writing):
 * - Projection formula: pcaChartService.js:699-704
 * - Dot size formula:   pcaChartService.js:687-688
 * - Inline style write: pcaChartService.js:710-713
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'

// Stub fetch before the service module imports — loadReferenceData() fires in
// the constructor and hits /datasets/hprc-reference-pca.tsv. Response is
// consumed async; the tests don't await it.
globalThis.fetch = () => Promise.resolve({
    ok: false,
    status: 404,
    text: () => Promise.resolve(''),
})

const { pcaChartService } = await import('../widgets/pcaChartService.js')

// ── Fixture knobs ────────────────────────────────────────────────────
// Chosen so arithmetic is legible in test assertions.

const SURFACE = 448
const PADDING = 20
const DOT_PCT = 1                    // pcaChartService default
const AVAILABLE = SURFACE - 2 * PADDING   // 408
const MAX_AVAILABLE = AVAILABLE            // square surface → same
const DOT_SIZE = MAX_AVAILABLE * DOT_PCT / 100  // 4.08
const HALF_DOT = DOT_SIZE / 2                    // 2.04

/**
 * Install known bounds directly on the singleton. Bypasses the async
 * initializeGlobalBoundingBox() path so tests don't depend on rAF or
 * reference data loading.
 */
function primeWithBounds(xMin, xMax, yMin, yMax) {
    pcaChartService.chartPadding = PADDING
    pcaChartService.dotSizePercent = DOT_PCT
    pcaChartService.finishInitialization(
        {
            x: { min: xMin, max: xMax, centroid: (xMin + xMax) / 2, range: xMax - xMin },
            y: { min: yMin, max: yMax, centroid: (yMin + yMax) / 2, range: yMax - yMin },
        },
        SURFACE,
        SURFACE,
    )
}

/**
 * Clear any existing dataset dots from the chart surface and render a
 * single data point via the real rendering path. Return the DOM element.
 */
function renderSingleDot(x, y) {
    const existing = pcaChartService.chartSurface.querySelectorAll('.pca-chart__dot')
    existing.forEach(el => el.remove())

    const map = new Map([
        ['test-key', {
            coordinates: [x, y],
            rgbString: 'rgb(100, 100, 100)',
            rgbThreeJS: { clone: () => ({}) },
        }],
    ])
    pcaChartService.renderDotsFromCoordinateDataMap(map, pcaChartService.globalBoundingBox)

    const dots = pcaChartService.chartSurface.querySelectorAll('.pca-chart__dot')
    expect(dots.length).toBe(1)
    return dots[0]
}

/** Read inline styles back as numbers (strips "px"). */
function positionOf(dot) {
    return {
        left: parseFloat(dot.style.left),
        top: parseFloat(dot.style.top),
        width: parseFloat(dot.style.width),
        height: parseFloat(dot.style.height),
    }
}

// ── Characterization ────────────────────────────────────────────────

describe('pcaChartService projection (characterization)', () => {

    beforeAll(() => {
        // The chart surface is created inside the service constructor. If the
        // DOM it built lacks dimensions (jsdom reports 0 for layout), nothing
        // below depends on layout — dots are positioned from globalBoundingBox,
        // which we inject directly.
    })

    beforeEach(() => {
        primeWithBounds(0, 1, 0, 1)
    })

    // T1 ── dot size is derived from maxAvailableDimension × dotSizePercent
    it('dot size = maxAvailableDimension * dotSizePercent / 100', () => {
        const dot = renderSingleDot(0.5, 0.5)
        const pos = positionOf(dot)
        expect(pos.width).toBeCloseTo(DOT_SIZE, 6)
        expect(pos.height).toBeCloseTo(DOT_SIZE, 6)
    })

    // T2 ── origin of bbox lands at (padding, padding), offset by halfDot
    //       so the dot visually centers on that point.
    it('origin (minX, minY) projects to chart padding, dot centered on that point', () => {
        const dot = renderSingleDot(0, 0)
        const { left, top } = positionOf(dot)
        expect(left).toBeCloseTo(PADDING - HALF_DOT, 6)   // 17.96
        expect(top).toBeCloseTo(PADDING - HALF_DOT, 6)
    })

    // T3 ── far corner (maxX, maxY) lands at (surface - padding, surface - padding)
    it('far corner (maxX, maxY) projects to surface edge minus padding', () => {
        const dot = renderSingleDot(1, 1)
        const { left, top } = positionOf(dot)
        const expected = SURFACE - PADDING - HALF_DOT  // 425.96
        expect(left).toBeCloseTo(expected, 6)
        expect(top).toBeCloseTo(expected, 6)
    })

    // T4 ── centroid lands at dead center of the available area
    it('centroid projects to center of available area', () => {
        const dot = renderSingleDot(0.5, 0.5)
        const { left, top } = positionOf(dot)
        // scaledX = 0.5 * 408 + 20 = 224; left = 224 - 2.04 = 221.96
        const expected = PADDING + AVAILABLE / 2 - HALF_DOT
        expect(left).toBeCloseTo(expected, 6)
        expect(top).toBeCloseTo(expected, 6)
    })

    // T5 ── each axis scales independently with its own range
    //       Asymmetric bbox catches bugs where a shared "scale" is derived
    //       from max(xRange, yRange) instead of per-axis.
    it('asymmetric bbox: each axis scales by its own range', () => {
        primeWithBounds(0.2, 0.8, 0.1, 0.4) // xRange 0.6, yRange 0.3
        const dot = renderSingleDot(0.5, 0.25) // centroid of both axes
        const { left, top } = positionOf(dot)
        const expected = PADDING + AVAILABLE / 2 - HALF_DOT
        expect(left).toBeCloseTo(expected, 6)
        expect(top).toBeCloseTo(expected, 6)
    })

    // T6 ── asymmetric bbox: max corner saturates to full available dim on each axis
    it('asymmetric bbox: (maxX, maxY) lands at (surface-padding, surface-padding)', () => {
        primeWithBounds(0.2, 0.8, 0.1, 0.4)
        const dot = renderSingleDot(0.8, 0.4)
        const { left, top } = positionOf(dot)
        const expected = SURFACE - PADDING - HALF_DOT
        expect(left).toBeCloseTo(expected, 6)
        expect(top).toBeCloseTo(expected, 6)
    })

    // T7 ── out-of-bbox coordinate is clamped to (surface - halfDot) on the
    //       high side. This is the silent-clamping behavior the testing-
    //       philosophy note explicitly calls out: eyes see "a dot piled on
    //       the edge"; a test catches the exact boundary.
    it('coordinate beyond maxX clamps to surfaceWidth - halfDotSize', () => {
        primeWithBounds(0, 0.5, 0, 0.5)
        const dot = renderSingleDot(1.0, 0.5) // x is 2× out of range
        const { left, top } = positionOf(dot)
        // raw scaledX = (1.0 - 0) / 0.5 * 408 + 20 = 836
        // clampedX = min(836, 448 - 2.04) = 445.96
        // left = 445.96 - 2.04 = 443.92
        const expectedLeft = (SURFACE - HALF_DOT) - HALF_DOT
        expect(left).toBeCloseTo(expectedLeft, 6)
        // y at maxY → normal projection to (surface-padding)
        expect(top).toBeCloseTo(SURFACE - PADDING - HALF_DOT, 6)
    })

    // T8 ── out-of-bbox coordinate below minX clamps to halfDotSize on the
    //       low side.
    it('coordinate below minX clamps to halfDotSize', () => {
        primeWithBounds(0.4, 0.6, 0.4, 0.6)
        const dot = renderSingleDot(0, 0.5) // x way below minX
        const { left, top } = positionOf(dot)
        // raw scaledX = (0 - 0.4) / 0.2 * 408 + 20 = -796
        // clampedX = max(2.04, -796) = 2.04
        // left = 2.04 - 2.04 = 0
        expect(left).toBeCloseTo(0, 6)
        // y at centroid → dead center
        expect(top).toBeCloseTo(PADDING + AVAILABLE / 2 - HALF_DOT, 6)
    })
})
