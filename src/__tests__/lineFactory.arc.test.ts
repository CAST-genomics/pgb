/**
 * Contract tests for skip arc geometry — the curve drawn between two spine nodes the
 * spine's topology does not place next to each other.
 *
 * Three things here are load-bearing and easy to break by "tidying":
 *
 *  1. ARC_PARAMS.MIN_HEIGHT / MAX_HEIGHT mean the height the arc actually reaches. A
 *     cubic Bezier peaks at three quarters of its control-point lift, so the lift is
 *     divided by 0.75 in LineFactory; drop that and every arc silently loses a quarter
 *     of its height.
 *  2. Sub-unit skips are drawn at all. In a bp-scaled linear layout a skip over three
 *     short nodes spans well under one world unit, and a curve proportional to that
 *     chord is invisible. The splay term balloons those into loops with real extent.
 *  3. The ribbon does not fold. It is HALF_WIDTH wide, so the curve's radius of
 *     curvature must stay above HALF_WIDTH everywhere or the inner offset inverts and
 *     the arc crumples at the shoulders. This is what ties MIN_HEIGHT to HALF_WIDTH.
 */

import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import LineFactory, { ARC_PARAMS } from '../lineFactory.js'

const Z = -12

const start = (x: number) => new THREE.Vector3(x, 0, Z)

/** Height the height rule should produce for a given chord and skip count. */
const expectedHeight = (chord: number, skipped: number) => Math.min(
    ARC_PARAMS.MAX_HEIGHT,
    Math.max(
        ARC_PARAMS.MIN_HEIGHT,
        ARC_PARAMS.HEIGHT_RATIO * chord + ARC_PARAMS.HEIGHT_PER_SKIPPED_NODE * skipped,
    ),
)

const positions = (geometry: THREE.BufferGeometry) => {
    const attribute = geometry.getAttribute('position')
    const out: THREE.Vector3[] = []
    for (let i = 0; i < attribute.count; i++) {
        out.push(new THREE.Vector3(attribute.getX(i), attribute.getY(i), attribute.getZ(i)))
    }
    return out
}

/** Smallest radius of curvature along the curve, sampled densely. */
const minimumCurvatureRadius = (curve: THREE.CubicBezierCurve3) => {
    const samples = 600
    let smallest = Infinity

    for (let i = 1; i < samples; i++) {
        const t = i / samples
        const h = 1e-4
        const before = curve.getPoint(Math.max(0, t - h))
        const here = curve.getPoint(t)
        const after = curve.getPoint(Math.min(1, t + h))

        const first = after.clone().sub(before).divideScalar(2 * h)
        const second = after.clone().add(before).sub(here.clone().multiplyScalar(2)).divideScalar(h * h)

        const cross = first.x * second.y - first.y * second.x
        if (Math.abs(cross) < 1e-9) continue

        const radius = Math.pow(first.x * first.x + first.y * first.y, 1.5) / Math.abs(cross)
        if (radius < smallest) smallest = radius
    }

    return smallest
}

describe('LineFactory.createSkipArcCurve', () => {

    it('starts and ends on the nodes it joins', () => {
        const a = start(0)
        const b = start(400)
        const curve = LineFactory.createSkipArcCurve(a, b, 8, 1)

        expect(curve.getPoint(0).distanceTo(a)).toBeLessThan(1e-9)
        expect(curve.getPoint(1).distanceTo(b)).toBeLessThan(1e-9)
    })

    it('peaks at the requested height, not at the control point lift', () => {
        const chord = 400
        const curve = LineFactory.createSkipArcCurve(start(0), start(chord), 8, 1)

        const apex = Math.max(...Array.from({ length: 201 }, (_, i) => curve.getPoint(i / 200).y))

        expect(apex).toBeCloseTo(expectedHeight(chord, 8), 1)
    })

    it('mirrors below the spine when the side is negative', () => {
        const above = LineFactory.createSkipArcCurve(start(0), start(400), 8, 1).getPoint(0.5)
        const below = LineFactory.createSkipArcCurve(start(0), start(400), 8, -1).getPoint(0.5)

        expect(above.y).toBeGreaterThan(0)
        expect(below.y).toBeCloseTo(-above.y, 9)
    })

    it('clamps height between MIN_HEIGHT and MAX_HEIGHT', () => {
        const tiny = LineFactory.createSkipArcCurve(start(0), start(0.76), 2, 1)
        const huge = LineFactory.createSkipArcCurve(start(0), start(4000), 40, 1)

        const apexOf = (curve: THREE.CubicBezierCurve3) =>
            Math.max(...Array.from({ length: 201 }, (_, i) => curve.getPoint(i / 200).y))

        expect(apexOf(tiny)).toBeCloseTo(ARC_PARAMS.MIN_HEIGHT, 1)
        expect(apexOf(huge)).toBeCloseTo(ARC_PARAMS.MAX_HEIGHT, 1)
    })

    it('balloons a sub-unit skip into a loop wider than the chord', () => {
        const chord = 0.76
        const curve = LineFactory.createSkipArcCurve(start(0), start(chord), 2, 1)

        const xs = Array.from({ length: 401 }, (_, i) => curve.getPoint(i / 400).x)
        const span = Math.max(...xs) - Math.min(...xs)

        expect(span).toBeGreaterThan(chord * 10)
        expect(Math.min(...xs)).toBeLessThan(0)          // overhangs the start node
        expect(Math.max(...xs)).toBeGreaterThan(chord)   // and the end node
    })

    it('leaves a wide skip as a plain arch, with no splay past its endpoints', () => {
        const chord = ARC_PARAMS.MIN_SPAN * 4
        const curve = LineFactory.createSkipArcCurve(start(0), start(chord), 8, 1)

        const xs = Array.from({ length: 401 }, (_, i) => curve.getPoint(i / 400).x)

        expect(Math.min(...xs)).toBeCloseTo(0, 6)
        expect(Math.max(...xs)).toBeCloseTo(chord, 6)
    })

    it('stays flatter than the ribbon is wide, so the arc cannot fold', () => {
        for (const [chord, skipped] of [[0.76, 2], [1.04, 3], [60.36, 1], [378.55, 8]]) {
            const curve = LineFactory.createSkipArcCurve(start(0), start(chord), skipped, 1)
            expect(minimumCurvatureRadius(curve)).toBeGreaterThan(ARC_PARAMS.HALF_WIDTH)
        }
    })

    it('loops in the same direction whichever way the edge runs', () => {
        const forward = LineFactory.createSkipArcCurve(start(0), start(0.76), 2, 1)
        const backward = LineFactory.createSkipArcCurve(start(0.76), start(0), 2, 1)

        expect(forward.getPoint(0.5).y).toBeGreaterThan(0)
        expect(backward.getPoint(0.5).y).toBeGreaterThan(0)
    })
})

describe('LineFactory.createSkipArcGeometry', () => {

    it('builds one ribbon quad per segment', () => {
        const geometry = LineFactory.createSkipArcGeometry(start(0), start(400), 8, 1)

        expect(geometry.getAttribute('position').count).toBe((ARC_PARAMS.SEGMENTS + 1) * 2)
        expect(geometry.getAttribute('uv').count).toBe((ARC_PARAMS.SEGMENTS + 1) * 2)
        expect(geometry.getIndex()!.count).toBe(ARC_PARAMS.SEGMENTS * 6)
    })

    it('straddles the curve by HALF_WIDTH and holds the edge z depth', () => {
        const geometry = LineFactory.createSkipArcGeometry(start(0), start(400), 8, 1)
        const points = positions(geometry)

        for (let i = 0; i < points.length; i += 2) {
            expect(points[i].distanceTo(points[i + 1])).toBeCloseTo(ARC_PARAMS.HALF_WIDTH * 2, 4)
            expect(points[i].z).toBeCloseTo(Z, 6)
        }
    })

    it('runs u from 0 at the start node to 1 at the end node', () => {
        const geometry = LineFactory.createSkipArcGeometry(start(0), start(400), 8, 1)
        const uv = geometry.getAttribute('uv')

        expect(uv.getX(0)).toBeCloseTo(0, 6)
        expect(uv.getX(uv.count - 1)).toBeCloseTo(1, 6)
        expect(uv.getY(0)).toBe(0)
        expect(uv.getY(1)).toBe(1)
    })
})
