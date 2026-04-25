/**
 * Characterization test pinning the arc-length contract for RibbonNode.getPoint.
 *
 * Background: RibbonNode (formerly RibbonLine) replaced ParametricLine as the
 * mesh type for nodes, but AnnotationCoordinateIndex still treats the parameter
 * returned by getPoint(t) / raycast as arc-length normalized (inherited from
 * ParametricLine). THREE.CatmullRomCurve3.getPoint is NOT arc-length
 * parameterized, so on curvy nodes the annotation track mis-registers by up to
 * ~5% of node arc length without the arc-length remap.
 *
 * Fixture: node `5504+` from public/datasets/hello-hprc.json — the worst
 * offender in the probe (6.58% midpoint drift, ~42 world units on a 632-unit
 * node). Coordinates are hard-coded here to keep the test self-contained.
 */

import { describe, it, expect, afterEach } from 'vitest'
import * as THREE from 'three'
import RibbonNode, { buildNodeRibbonGeometry, clearRibbonRegistry } from '../ribbonNode.ts'

const NODE_Z_OFFSET = -8

const COORDS: Array<[number, number]> = [
    [5696 - 2860, 2560 - 2812.5],
    [5464 - 2860, 2413 - 2812.5],
    [5162 - 2860, 2221 - 2812.5],
]

function makeSpline(): any {
    return new THREE.CatmullRomCurve3(
        COORDS.map(([x, y]) => new THREE.Vector3(x, y, 0))
    )
}

function makeRibbonViaCreate(spline: any): RibbonNode {
    const geometry = buildNodeRibbonGeometry(spline)
    const material = new THREE.Material() as any
    return RibbonNode.create(geometry, spline, material)
}

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

describe('RibbonNode arc-length contract', () => {

    afterEach(() => clearRibbonRegistry())

    it('getPoint(0) returns the first control point', () => {
        const spline = makeSpline()
        const mesh = makeRibbonViaCreate(spline)
        const p = mesh.getPoint(0)
        expect(p.x).toBeCloseTo(COORDS[0][0], 6)
        expect(p.y).toBeCloseTo(COORDS[0][1], 6)
    })

    it('getPoint(1) returns the last control point', () => {
        const spline = makeSpline()
        const mesh = makeRibbonViaCreate(spline)
        const p = mesh.getPoint(1)
        expect(p.x).toBeCloseTo(COORDS[COORDS.length - 1][0], 6)
        expect(p.y).toBeCloseTo(COORDS[COORDS.length - 1][1], 6)
    })

    it('getPoint(0.5) lands within 0.1 world units of the arc-length midpoint (XY)', () => {
        const spline = makeSpline()
        const mesh = makeRibbonViaCreate(spline)
        const { point: ref } = arcLengthReference(spline, 0.5)
        const p = mesh.getPoint(0.5)
        // getPoint() bakes NODE_Z_OFFSET into z; compare XY-only since the
        // arc-length contract is a planar property.
        const drift = Math.hypot(p.x - ref.x, p.y - ref.y)
        expect(drift).toBeLessThan(0.1)
    })

    it('getPoint(u) is arc-length proportional', () => {
        const spline = makeSpline()
        const mesh = makeRibbonViaCreate(spline)
        const { total } = arcLengthReference(spline, 1)

        // XY-only chord distance — getPoint bakes NODE_Z_OFFSET into z.
        const xyDist = (a: any, b: any) => Math.hypot(a.x - b.x, a.y - b.y)

        const samples = 64
        let prev = mesh.getPoint(0)
        let cum = 0
        for (let i = 1; i <= samples; i++) {
            const u = i / samples
            const pt = mesh.getPoint(u)
            cum += xyDist(prev, pt)
            const expected = u * total
            expect(Math.abs(cum - expected)).toBeLessThan(total * 0.005)
            prev = pt
        }
    })
})

describe('RibbonNode Z source-of-truth', () => {

    afterEach(() => clearRibbonRegistry())

    it('getPoint(u) always returns a point with z === NODE_Z_OFFSET', () => {
        const spline = makeSpline()
        const mesh = makeRibbonViaCreate(spline)
        for (const u of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
            expect(mesh.getPoint(u).z).toBe(NODE_Z_OFFSET)
        }
    })

    it('vertex positions in geometry have z === NODE_Z_OFFSET', () => {
        const spline = makeSpline()
        const geometry = buildNodeRibbonGeometry(spline)
        const positions = geometry.getAttribute('position').array as Float32Array
        for (let i = 2; i < positions.length; i += 3) {
            expect(positions[i]).toBe(NODE_Z_OFFSET)
        }
    })
})

describe('RibbonNode registration lifecycle', () => {

    afterEach(() => clearRibbonRegistry())

    it('create() adds to the registry, dispose() removes it', () => {
        const spline = makeSpline()
        expect(RibbonNode.registeredCount).toBe(0)

        const a = makeRibbonViaCreate(spline)
        const b = makeRibbonViaCreate(spline)
        const c = makeRibbonViaCreate(spline)
        expect(RibbonNode.registeredCount).toBe(3)

        a.dispose()
        expect(RibbonNode.registeredCount).toBe(2)

        b.dispose()
        c.dispose()
        expect(RibbonNode.registeredCount).toBe(0)
    })

    it('dispose() is idempotent', () => {
        const spline = makeSpline()
        const a = makeRibbonViaCreate(spline)
        expect(RibbonNode.registeredCount).toBe(1)
        a.dispose()
        a.dispose()
        expect(RibbonNode.registeredCount).toBe(0)
    })

    it('clearRibbonRegistry() bulk-empties the registry', () => {
        const spline = makeSpline()
        for (let i = 0; i < 5; i++) makeRibbonViaCreate(spline)
        expect(RibbonNode.registeredCount).toBe(5)
        clearRibbonRegistry()
        expect(RibbonNode.registeredCount).toBe(0)
    })
})
