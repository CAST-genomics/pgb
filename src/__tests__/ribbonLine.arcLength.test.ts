/**
 * Characterization test pinning the arc-length contract for RibbonLine.getPoint.
 *
 * Background: RibbonLine replaced ParametricLine as the mesh type for nodes,
 * but AnnotationCoordinateIndex still treats the parameter returned by
 * getPoint(t) / raycast as arc-length normalized (inherited from ParametricLine).
 * THREE.CatmullRomCurve3.getPoint is NOT arc-length parameterized, so on curvy
 * nodes the annotation track mis-registers by up to ~5% of node arc length.
 *
 * Fixture: node `5504+` from public/datasets/hello-hprc.json — the worst
 * offender in the probe (6.58% midpoint drift, ~42 world units on a 632-unit
 * node). Coordinates are hard-coded here to keep the test self-contained.
 *
 * These assertions describe the contract RibbonLine *must* honor. They are
 * expected to fail before the Phase 2 fix and pass after.
 */

import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import RibbonLine from '../ribbonLine.js'

// Hard-coded ogdf_coordinates for `5504+` from hello-hprc.json, recentered
// around the dataset bbox centroid (cx=2860, cy=2812.5), matching what
// GeometryFactory produces at runtime.
const COORDS: Array<[number, number]> = [
    [5696 - 2860, 2560 - 2812.5], // [ 2836, -252.5]
    [5464 - 2860, 2413 - 2812.5], // [ 2604, -399.5]
    [5162 - 2860, 2221 - 2812.5], // [ 2302, -591.5]
]

function makeSpline(): any {
    return new THREE.CatmullRomCurve3(
        COORDS.map(([x, y]) => new THREE.Vector3(x, y, 0))
    )
}

function makeRibbon(spline: any): RibbonLine {
    const mesh = new RibbonLine(new THREE.BufferGeometry(), new THREE.Material())
    mesh.userData = { spline, zOffset: 0, nodeName: '5504+' }
    return mesh
}

/** Dense-sample arc-length reference (the ParametricLine way). */
function arcLengthReference(spline: any, u: number, samples = 2048) {
    const pts: any[] = []
    for (let i = 0; i <= samples; i++) pts.push(spline.getPoint(i / samples))
    const cum = new Float64Array(samples + 1)
    for (let i = 0; i < samples; i++) cum[i + 1] = cum[i] + pts[i].distanceTo(pts[i + 1])
    const total = cum[samples]
    const s = u * total
    if (s >= total) return { point: pts[samples].clone(), total }
    let lo = 0, hi = samples
    while (lo + 1 < hi) {
        const mid = (lo + hi) >> 1
        cum[mid] <= s ? (lo = mid) : (hi = mid)
    }
    const L = cum[lo + 1] - cum[lo]
    const frac = L > 0 ? (s - cum[lo]) / L : 0
    return { point: pts[lo].clone().lerp(pts[lo + 1], frac), total }
}

describe('RibbonLine arc-length contract', () => {

    it('getPoint(0) returns the first control point', () => {
        const spline = makeSpline()
        const mesh = makeRibbon(spline)
        const p = mesh.getPoint(0)
        expect(p.x).toBeCloseTo(COORDS[0][0], 6)
        expect(p.y).toBeCloseTo(COORDS[0][1], 6)
    })

    it('getPoint(1) returns the last control point', () => {
        const spline = makeSpline()
        const mesh = makeRibbon(spline)
        const p = mesh.getPoint(1)
        expect(p.x).toBeCloseTo(COORDS[COORDS.length - 1][0], 6)
        expect(p.y).toBeCloseTo(COORDS[COORDS.length - 1][1], 6)
    })

    it('getPoint(0.5) lands within 0.1 world units of the arc-length midpoint', () => {
        const spline = makeSpline()
        const mesh = makeRibbon(spline)
        const { point: ref } = arcLengthReference(spline, 0.5)
        const p = mesh.getPoint(0.5)
        const drift = p.distanceTo(ref)
        // Fails before Phase 2 (~42 world units); passes after.
        expect(drift).toBeLessThan(0.1)
    })

    it('getPoint(u) is arc-length proportional: distance traveled grows linearly in u', () => {
        const spline = makeSpline()
        const mesh = makeRibbon(spline)
        const { total } = arcLengthReference(spline, 1)

        // Sample dense u values and accumulate chord distance. Under arc-length
        // parameterization, the cumulative chord distance closely tracks u*total.
        const samples = 64
        let prev = mesh.getPoint(0)
        let cum = 0
        for (let i = 1; i <= samples; i++) {
            const u = i / samples
            const pt = mesh.getPoint(u)
            cum += prev.distanceTo(pt)
            const expected = u * total
            // Tolerance: 0.5% of total arc length accumulated drift.
            expect(Math.abs(cum - expected)).toBeLessThan(total * 0.005)
            prev = pt
        }
    })
})
