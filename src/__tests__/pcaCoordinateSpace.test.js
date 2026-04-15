/**
 * Characterization tests for PcaCoordinateSpace projection math.
 *
 * These tests pin the projection formulas extracted from pcaChartService
 * in phase 1 of the PCA triangle refactor (issue #46). They were previously
 * run through the live jsdom service at pcaChartService.projection.dom.test.js;
 * the assertions and fixture values are unchanged, but they now exercise the
 * pure object directly — no DOM, no singleton, no fetch stub.
 *
 * The math being pinned:
 *     data (x, y) → { left, top, size }
 *
 * via per-axis linear scaling + padding + half-dot centering + high/low
 * clamping at the surface edge.
 */

import { describe, it, expect } from 'vitest'
import { PcaCoordinateSpace } from '../widgets/pcaCoordinateSpace.js'

// ── Fixture knobs ────────────────────────────────────────────────────
// Chosen so arithmetic is legible in test assertions.

const SURFACE = 448
const PADDING = 20
const DOT_PCT = 1
const AVAILABLE = SURFACE - 2 * PADDING              // 408
const DOT_SIZE = AVAILABLE * DOT_PCT / 100            // 4.08
const HALF_DOT = DOT_SIZE / 2                         // 2.04

function spaceWithBounds(xMin, xMax, yMin, yMax) {
    const bbox = {
        x: { min: xMin, max: xMax, centroid: (xMin + xMax) / 2, range: xMax - xMin },
        y: { min: yMin, max: yMax, centroid: (yMin + yMax) / 2, range: yMax - yMin },
    }
    return new PcaCoordinateSpace(bbox, SURFACE, SURFACE, PADDING, DOT_PCT)
}

// ── Characterization ────────────────────────────────────────────────

describe('PcaCoordinateSpace projection', () => {

    // T1 ── dot size is derived from maxAvailableDimension × dotSizePercent
    it('dot size = maxAvailableDimension * dotSizePercent / 100', () => {
        const space = spaceWithBounds(0, 1, 0, 1)
        const { size } = space.project(0.5, 0.5)
        expect(size).toBeCloseTo(DOT_SIZE, 6)
        expect(space.dotSize).toBeCloseTo(DOT_SIZE, 6)
    })

    // T2 ── origin of bbox lands at (padding, padding), offset by halfDot
    //       so the dot visually centers on that point.
    it('origin (minX, minY) projects to chart padding, dot centered on that point', () => {
        const space = spaceWithBounds(0, 1, 0, 1)
        const { left, top } = space.project(0, 0)
        expect(left).toBeCloseTo(PADDING - HALF_DOT, 6)   // 17.96
        expect(top).toBeCloseTo(PADDING - HALF_DOT, 6)
    })

    // T3 ── far corner (maxX, maxY) lands at (surface - padding, surface - padding)
    it('far corner (maxX, maxY) projects to surface edge minus padding', () => {
        const space = spaceWithBounds(0, 1, 0, 1)
        const { left, top } = space.project(1, 1)
        const expected = SURFACE - PADDING - HALF_DOT  // 425.96
        expect(left).toBeCloseTo(expected, 6)
        expect(top).toBeCloseTo(expected, 6)
    })

    // T4 ── centroid lands at dead center of the available area
    it('centroid projects to center of available area', () => {
        const space = spaceWithBounds(0, 1, 0, 1)
        const { left, top } = space.project(0.5, 0.5)
        const expected = PADDING + AVAILABLE / 2 - HALF_DOT
        expect(left).toBeCloseTo(expected, 6)
        expect(top).toBeCloseTo(expected, 6)
    })

    // T5 ── each axis scales independently with its own range
    //       Asymmetric bbox catches bugs where a shared "scale" is derived
    //       from max(xRange, yRange) instead of per-axis.
    it('asymmetric bbox: each axis scales by its own range', () => {
        const space = spaceWithBounds(0.2, 0.8, 0.1, 0.4) // xRange 0.6, yRange 0.3
        const { left, top } = space.project(0.5, 0.25)    // centroid of both axes
        const expected = PADDING + AVAILABLE / 2 - HALF_DOT
        expect(left).toBeCloseTo(expected, 6)
        expect(top).toBeCloseTo(expected, 6)
    })

    // T6 ── asymmetric bbox: max corner saturates to full available dim on each axis
    it('asymmetric bbox: (maxX, maxY) lands at (surface-padding, surface-padding)', () => {
        const space = spaceWithBounds(0.2, 0.8, 0.1, 0.4)
        const { left, top } = space.project(0.8, 0.4)
        const expected = SURFACE - PADDING - HALF_DOT
        expect(left).toBeCloseTo(expected, 6)
        expect(top).toBeCloseTo(expected, 6)
    })

    // T7 ── out-of-bbox coordinate is clamped to (surface - halfDot) on the
    //       high side. Visible as "a dot piled on the edge"; pinned here to
    //       the exact boundary.
    it('coordinate beyond maxX clamps to surfaceWidth - halfDotSize', () => {
        const space = spaceWithBounds(0, 0.5, 0, 0.5)
        const { left, top } = space.project(1.0, 0.5) // x is 2× out of range
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
        const space = spaceWithBounds(0.4, 0.6, 0.4, 0.6)
        const { left, top } = space.project(0, 0.5) // x way below minX
        // raw scaledX = (0 - 0.4) / 0.2 * 408 + 20 = -796
        // clampedX = max(2.04, -796) = 2.04
        // left = 2.04 - 2.04 = 0
        expect(left).toBeCloseTo(0, 6)
        // y at centroid → dead center
        expect(top).toBeCloseTo(PADDING + AVAILABLE / 2 - HALF_DOT, 6)
    })
})
