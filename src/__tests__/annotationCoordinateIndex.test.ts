/**
 * Characterization tests for AnnotationCoordinateIndex coordinate math.
 *
 * These tests pin the bidirectional bp ↔ track-parameter mapping extracted
 * from AnnotationRenderService in phases 1–4 of the annotation track refactor
 * (issue #49). The index is pure data — no DOM, no events, no rendering.
 *
 * The math being pinned:
 *   - spine nodes → bpIndex + splineParameterMap (monotonic 0..1 coverage)
 *   - (nodeName, tRaw) → oriented track parameter via endpoint anchoring
 *   - roundtrip: entry/exit endpoints → correct oriented u
 */

import { describe, it, expect } from 'vitest'
import AnnotationCoordinateIndex from '../annotationCoordinateIndex.ts'

// ── Fixtures ────────────────────────────────────────────────────────

/** Three-node spine: A(0–100bp), B(100–300bp), C(300–350bp) */
function threeNodeSpine() {
    return {
        nodes: [
            { id: 'A', bpStart: 0, bpEnd: 100 },
            { id: 'B', bpStart: 100, bpEnd: 300 },
            { id: 'C', bpStart: 300, bpEnd: 350 },
        ]
    }
}

/**
 * Mock sceneManager that places nodes along the x-axis.
 * Node A: x=[0,1], Node B: x=[1,2], Node C: x=[2,3]
 * All endpoints are in walk order (t=0 near left neighbor, t=1 near right),
 * so entryT=0, exitT=1 for all nodes.
 */
function mockSceneManager() {
    const lines: Record<string, { t0: {x:number,y:number,z:number}, t1: {x:number,y:number,z:number} }> = {
        A: { t0: { x: 0, y: 0, z: 0 }, t1: { x: 1, y: 0, z: 0 } },
        B: { t0: { x: 1, y: 0, z: 0 }, t1: { x: 2, y: 0, z: 0 } },
        C: { t0: { x: 2, y: 0, z: 0 }, t1: { x: 3, y: 0, z: 0 } },
    }

    const children = Object.entries(lines).map(([name, pts]) => ({
        userData: { nodeName: name },
        getPoint(t: number, _space: string) {
            return {
                x: pts.t0.x + t * (pts.t1.x - pts.t0.x),
                y: pts.t0.y + t * (pts.t1.y - pts.t0.y),
                z: pts.t0.z + t * (pts.t1.z - pts.t0.z),
            }
        }
    }))

    return {
        getActiveScene() {
            return {
                getObjectByName(_name: string) {
                    return { children }
                }
            }
        }
    }
}

/**
 * Mock sceneManager where node B is flipped — t=0 is near right neighbor,
 * t=1 is near left neighbor. The endpoint anchoring should detect this
 * and set entryT=1, exitT=0 for B.
 */
function mockSceneManagerWithFlippedB() {
    const lines: Record<string, { t0: {x:number,y:number,z:number}, t1: {x:number,y:number,z:number} }> = {
        A: { t0: { x: 0, y: 0, z: 0 }, t1: { x: 1, y: 0, z: 0 } },
        B: { t0: { x: 2, y: 0, z: 0 }, t1: { x: 1, y: 0, z: 0 } },  // flipped
        C: { t0: { x: 2, y: 0, z: 0 }, t1: { x: 3, y: 0, z: 0 } },
    }

    const children = Object.entries(lines).map(([name, pts]) => ({
        userData: { nodeName: name },
        getPoint(t: number, _space: string) {
            return {
                x: pts.t0.x + t * (pts.t1.x - pts.t0.x),
                y: pts.t0.y + t * (pts.t1.y - pts.t0.y),
                z: pts.t0.z + t * (pts.t1.z - pts.t0.z),
            }
        }
    }))

    return {
        getActiveScene() {
            return {
                getObjectByName(_name: string) {
                    return { children }
                }
            }
        }
    }
}

// ── Lifecycle ───────────────────────────────────────────────────────

describe('AnnotationCoordinateIndex lifecycle', () => {

    it('isEmpty is true before build', () => {
        const idx = new AnnotationCoordinateIndex()
        expect(idx.isEmpty).toBe(true)
    })

    it('isEmpty is false after build', () => {
        const idx = new AnnotationCoordinateIndex()
        idx.build(threeNodeSpine(), mockSceneManager())
        expect(idx.isEmpty).toBe(false)
    })

    it('clear resets to empty', () => {
        const idx = new AnnotationCoordinateIndex()
        idx.build(threeNodeSpine(), mockSceneManager())
        idx.clear()
        expect(idx.isEmpty).toBe(true)
        expect(idx.bpIndex).toBeUndefined()
        expect(idx.bpStart).toBeUndefined()
        expect(idx.bpEnd).toBeUndefined()
        expect(idx.bpIndexMap.size).toBe(0)
        expect(idx.endpointMap.size).toBe(0)
        expect(idx.splineParameterMap.size).toBe(0)
    })
})

// ── Build ───────────────────────────────────────────────────────────

describe('AnnotationCoordinateIndex build', () => {

    it('returns bpStart and bpEnd from first/last spine nodes', () => {
        const idx = new AnnotationCoordinateIndex()
        const { bpStart, bpEnd } = idx.build(threeNodeSpine(), mockSceneManager())
        expect(bpStart).toBe(0)
        expect(bpEnd).toBe(350)
    })

    it('populates bpIndex with all spine nodes', () => {
        const idx = new AnnotationCoordinateIndex()
        idx.build(threeNodeSpine(), mockSceneManager())
        expect(idx.bpIndex!.idx).toHaveLength(3)
        expect(idx.bpIndex!.bpMin).toBe(0)
        expect(idx.bpIndex!.bpMax).toBe(350)
    })

    it('populates bpIndexMap keyed by node id', () => {
        const idx = new AnnotationCoordinateIndex()
        idx.build(threeNodeSpine(), mockSceneManager())
        expect(idx.bpIndexMap.has('A')).toBe(true)
        expect(idx.bpIndexMap.has('B')).toBe(true)
        expect(idx.bpIndexMap.has('C')).toBe(true)
        expect(idx.bpIndexMap.get('B')!.lengthBp).toBe(200)
    })

    it('splineParameterMap covers [0, 1] monotonically', () => {
        const idx = new AnnotationCoordinateIndex()
        idx.build(threeNodeSpine(), mockSceneManager())

        const a = idx.splineParameterMap.get('A')!
        const b = idx.splineParameterMap.get('B')!
        const c = idx.splineParameterMap.get('C')!

        // First node starts at 0, last node ends at 1
        expect(a.startParam).toBeCloseTo(0)
        expect(c.endParam).toBeCloseTo(1)

        // Each node's endParam equals the next node's startParam (contiguous)
        expect(a.endParam).toBeCloseTo(b.startParam)
        expect(b.endParam).toBeCloseTo(c.startParam)

        // Monotonic: each startParam < endParam
        expect(a.startParam).toBeLessThan(a.endParam)
        expect(b.startParam).toBeLessThan(b.endParam)
        expect(c.startParam).toBeLessThan(c.endParam)
    })

    it('splineParameterMap reflects bp proportions', () => {
        const idx = new AnnotationCoordinateIndex()
        idx.build(threeNodeSpine(), mockSceneManager())

        // Node B is 200bp out of 350bp total = 4/7 of the track
        const b = idx.splineParameterMap.get('B')!
        const bFraction = b.endParam - b.startParam
        expect(bFraction).toBeCloseTo(200 / 350, 6)
    })

    it('endpointMap has entry for every node', () => {
        const idx = new AnnotationCoordinateIndex()
        idx.build(threeNodeSpine(), mockSceneManager())
        expect(idx.endpointMap.size).toBe(3)
        for (const id of ['A', 'B', 'C']) {
            const ep = idx.endpointMap.get(id)!
            expect(ep.entryT === 0 || ep.entryT === 1).toBe(true)
            expect(ep.exitT === 0 || ep.exitT === 1).toBe(true)
            expect(ep.entryT).not.toBe(ep.exitT) // must be opposite ends
        }
    })
})

// ── Endpoint anchoring with flipped nodes ───────────────────────────

describe('AnnotationCoordinateIndex flipped-node anchoring', () => {

    it('detects flipped node B and reverses its endpoints', () => {
        const idx = new AnnotationCoordinateIndex()
        idx.build(threeNodeSpine(), mockSceneManagerWithFlippedB())

        // Node B's t=0 is at x=2 (near C), t=1 is at x=1 (near A)
        // So entry (near A) should be t=1, exit (near C) should be t=0
        const bEndpoints = idx.endpointMap.get('B')!
        expect(bEndpoints.entryT).toBe(1)
        expect(bEndpoints.exitT).toBe(0)
    })
})

// ── getTrackParamFromLineIntersection ───────────────────────────────

describe('AnnotationCoordinateIndex getTrackParamFromLineIntersection', () => {

    it('returns null for unknown node', () => {
        const idx = new AnnotationCoordinateIndex()
        idx.build(threeNodeSpine(), mockSceneManager())
        expect(idx.getTrackParamFromLineIntersection('UNKNOWN', 0.5)).toBeNull()
    })

    it('entry of first node maps to param ≈ 0', () => {
        const idx = new AnnotationCoordinateIndex()
        idx.build(threeNodeSpine(), mockSceneManager())
        const ep = idx.endpointMap.get('A')!
        const param = idx.getTrackParamFromLineIntersection('A', ep.entryT)!
        expect(param).toBeCloseTo(0, 2)
    })

    it('exit of last node maps to param ≈ 1', () => {
        const idx = new AnnotationCoordinateIndex()
        idx.build(threeNodeSpine(), mockSceneManager())
        const ep = idx.endpointMap.get('C')!
        const param = idx.getTrackParamFromLineIntersection('C', ep.exitT)!
        expect(param).toBeCloseTo(1, 2)
    })

    it('midpoint of node B maps to proportional track position', () => {
        const idx = new AnnotationCoordinateIndex()
        idx.build(threeNodeSpine(), mockSceneManager())

        const ep = idx.endpointMap.get('B')!
        const midT = (ep.entryT + ep.exitT) / 2
        const param = idx.getTrackParamFromLineIntersection('B', midT)!

        // B spans bp 100–300 out of 0–350. Midpoint is bp 200.
        // Track param for bp 200 = 200/350 ≈ 0.571
        expect(param).toBeCloseTo(200 / 350, 2)
    })

    it('is monotonic: increasing t within a node yields increasing param', () => {
        const idx = new AnnotationCoordinateIndex()
        idx.build(threeNodeSpine(), mockSceneManager())

        const samples = [0.0, 0.25, 0.5, 0.75, 1.0]
        const params = samples.map(t => idx.getTrackParamFromLineIntersection('B', t)!)

        for (let i = 1; i < params.length; i++) {
            expect(params[i]).toBeGreaterThanOrEqual(params[i - 1])
        }
    })

    it('is monotonic through flipped node B', () => {
        const idx = new AnnotationCoordinateIndex()
        idx.build(threeNodeSpine(), mockSceneManagerWithFlippedB())

        // For flipped B, entryT=1 exitT=0, so raw t going 0→1
        // means we go from exit→entry (reversed). But the mapping
        // should still produce monotonic params when we sample in
        // the oriented direction (entryT → exitT).
        const ep = idx.endpointMap.get('B')!
        const orientedSamples = [0, 0.25, 0.5, 0.75, 1].map(
            u => ep.entryT + u * (ep.exitT - ep.entryT)
        )
        const params = orientedSamples.map(t => idx.getTrackParamFromLineIntersection('B', t)!)

        for (let i = 1; i < params.length; i++) {
            expect(params[i]).toBeGreaterThanOrEqual(params[i - 1])
        }
    })
})

// ── getXYZFromTrackParam ────────────────────────────────────────────

describe('AnnotationCoordinateIndex getXYZFromTrackParam', () => {

    it('param 0 maps to start of first node', () => {
        const idx = new AnnotationCoordinateIndex()
        const sm = mockSceneManager()
        idx.build(threeNodeSpine(), sm)

        const result = idx.getXYZFromTrackParam(0, sm)!
        expect(result.nodeId).toBe('A')
        expect(result.xyz.x).toBeCloseTo(0, 1)
    })

    it('param 1 maps to end of last node', () => {
        const idx = new AnnotationCoordinateIndex()
        const sm = mockSceneManager()
        idx.build(threeNodeSpine(), sm)

        const result = idx.getXYZFromTrackParam(1, sm)!
        expect(result.nodeId).toBe('C')
        expect(result.xyz.x).toBeCloseTo(3, 0)
    })

    it('xyz.x increases monotonically with param', () => {
        const idx = new AnnotationCoordinateIndex()
        const sm = mockSceneManager()
        idx.build(threeNodeSpine(), sm)

        const params = [0, 0.1, 0.2, 0.3, 0.5, 0.7, 0.9, 1.0]
        const xs = params.map(p => idx.getXYZFromTrackParam(p, sm)!.xyz.x)

        for (let i = 1; i < xs.length; i++) {
            expect(xs[i]).toBeGreaterThanOrEqual(xs[i - 1])
        }
    })
})
