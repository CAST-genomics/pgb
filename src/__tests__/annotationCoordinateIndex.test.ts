/**
 * Characterization tests for AnnotationCoordinateIndex coordinate math.
 *
 * After the issue #69 refactor, the index is driven by an AssemblyTrackModel:
 *   - canvas extent = region start/end (NOT the synthetic cumulative spine)
 *   - per-band positions = each node's own metadata.start/end
 *   - orientation = node_strand ('+' or '-'), no geometric endpoint heuristic
 */

import { describe, it, expect } from 'vitest'
import AnnotationCoordinateIndex from '../annotationCoordinateIndex.ts'
import type { AssemblyTrackModel } from '../assemblyTrackModel.ts'

// ── Fixtures ────────────────────────────────────────────────────────

/**
 * Three bands on a single reference: A(0–100), B(100–300), C(300–350).
 * Region matches the band span exactly (no gaps).
 */
function contiguousModel(): AssemblyTrackModel {
    return {
        assemblyKey: 'X#1#chrZ',
        sequenceId: 'chrZ',
        regionStart: 0,
        regionEnd: 350,
        anchors: [
            { nodeId: 'A', refStart: 0,   refEnd: 100, nodeStrand: '+', lengthBp: 100 },
            { nodeId: 'B', refStart: 100, refEnd: 300, nodeStrand: '+', lengthBp: 200 },
            { nodeId: 'C', refStart: 300, refEnd: 350, nodeStrand: '+', lengthBp: 50  },
        ],
        walkNodeIds: new Set(['A', 'B', 'C']),
    }
}

/** Region [0..500], bands at [0..100] and [200..300] — gaps at [100..200] and [300..500]. */
function gappedModel(): AssemblyTrackModel {
    return {
        assemblyKey: 'X#1#chrZ',
        sequenceId: 'chrZ',
        regionStart: 0,
        regionEnd: 500,
        anchors: [
            { nodeId: 'A', refStart: 0,   refEnd: 100, nodeStrand: '+', lengthBp: 100 },
            { nodeId: 'B', refStart: 200, refEnd: 300, nodeStrand: '+', lengthBp: 100 },
        ],
        walkNodeIds: new Set(['A', 'B']),
    }
}

/** Two non-overlapping bands for the same node id (duplicated_assembly). */
function duplicatedModel(): AssemblyTrackModel {
    return {
        assemblyKey: 'X#1#chrZ',
        sequenceId: 'chrZ',
        regionStart: 0,
        regionEnd: 400,
        anchors: [
            { nodeId: 'A', refStart: 0,   refEnd: 100, nodeStrand: '+', lengthBp: 100 },
            { nodeId: 'A', refStart: 300, refEnd: 400, nodeStrand: '+', lengthBp: 100 },
        ],
        walkNodeIds: new Set(['A']),
    }
}

/** Single band on the '-' strand. */
function minusStrandModel(): AssemblyTrackModel {
    return {
        assemblyKey: 'X#1#chrZ',
        sequenceId: 'chrZ',
        regionStart: 0,
        regionEnd: 100,
        anchors: [
            { nodeId: 'A', refStart: 0, refEnd: 100, nodeStrand: '-', lengthBp: 100 },
        ],
        walkNodeIds: new Set(['A']),
    }
}

/**
 * Mock sceneManager whose RibbonNodes interpolate linearly along the x-axis.
 * Node A: t=0 at x=0, t=1 at x=1. (Used only by getXYZFromTrackParam.)
 */
function mockSceneManager() {
    const lines: Record<string, { t0: number, t1: number }> = {
        A: { t0: 0, t1: 1 },
        B: { t0: 1, t1: 2 },
        C: { t0: 2, t1: 3 },
    }

    const children = Object.entries(lines).map(([name, pts]) => ({
        userData: { nodeName: name },
        getPoint(t: number, _space: string) {
            return { x: pts.t0 + t * (pts.t1 - pts.t0), y: 0, z: 0 }
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
        idx.build(contiguousModel())
        expect(idx.isEmpty).toBe(false)
    })

    it('clear resets to empty', () => {
        const idx = new AnnotationCoordinateIndex()
        idx.build(contiguousModel())
        idx.clear()
        expect(idx.isEmpty).toBe(true)
        expect(idx.bpStart).toBeUndefined()
        expect(idx.bpEnd).toBeUndefined()
        expect(idx.anchorsByNode.size).toBe(0)
    })
})

// ── Build: region-driven extent ─────────────────────────────────────

describe('AnnotationCoordinateIndex build — region drives extent', () => {

    it('bpStart and bpEnd come from regionStart/regionEnd, not band bounds', () => {
        const idx = new AnnotationCoordinateIndex()
        const { bpStart, bpEnd } = idx.build(gappedModel())
        expect(bpStart).toBe(0)
        expect(bpEnd).toBe(500)
    })

    it('does not accumulate node lengths', () => {
        // A model where graph length would diverge from metadata length.
        // The refactor must use metadata, not lengths — so regionEnd is unaffected
        // by lengthBp values on the bands.
        const model: AssemblyTrackModel = {
            assemblyKey: 'X#1#chrZ',
            sequenceId: 'chrZ',
            regionStart: 78567196,
            regionEnd: 78786401,
            anchors: [
                // metadata length 12331, but graph lengthBp would have been 12328
                // (the il7.json HG00408#1 tracer case). lengthBp here matches metadata.
                { nodeId: 'N1', refStart: 78567196, refEnd: 78579527, nodeStrand: '+', lengthBp: 12331 },
            ],
            walkNodeIds: new Set(['N1']),
        }
        const idx = new AnnotationCoordinateIndex()
        const { bpStart, bpEnd } = idx.build(model)
        expect(bpStart).toBe(78567196)
        expect(bpEnd).toBe(78786401)
    })
})

// ── getTrackParamFromLineIntersection ───────────────────────────────

describe('AnnotationCoordinateIndex getTrackParamFromLineIntersection', () => {

    it('returns null for unknown node', () => {
        const idx = new AnnotationCoordinateIndex()
        idx.build(contiguousModel())
        expect(idx.getTrackParamFromLineIntersection('UNKNOWN', 0.5)).toBeNull()
    })

    it('+ strand: t=0 maps to band.refStart on the track', () => {
        const idx = new AnnotationCoordinateIndex()
        idx.build(contiguousModel())
        // Band B is refStart=100, refEnd=300. t=0 → refBp=100 → param = 100/350
        const param = idx.getTrackParamFromLineIntersection('B', 0)!
        expect(param).toBeCloseTo(100 / 350, 6)
    })

    it('+ strand: t=1 maps to band.refEnd on the track', () => {
        const idx = new AnnotationCoordinateIndex()
        idx.build(contiguousModel())
        const param = idx.getTrackParamFromLineIntersection('B', 1)!
        expect(param).toBeCloseTo(300 / 350, 6)
    })

    it('+ strand: midpoint maps to (refStart+refEnd)/2', () => {
        const idx = new AnnotationCoordinateIndex()
        idx.build(contiguousModel())
        const param = idx.getTrackParamFromLineIntersection('B', 0.5)!
        expect(param).toBeCloseTo(200 / 350, 6)
    })

    it('- strand: t=0 maps to band.refEnd, t=1 maps to band.refStart', () => {
        const idx = new AnnotationCoordinateIndex()
        idx.build(minusStrandModel())
        const p0 = idx.getTrackParamFromLineIntersection('A', 0)!
        const p1 = idx.getTrackParamFromLineIntersection('A', 1)!
        expect(p0).toBeCloseTo(1, 6) // refEnd of single band == regionEnd
        expect(p1).toBeCloseTo(0, 6) // refStart == regionStart
    })

    it('ignores accumulation: param uses metadata bp, not lengthBp summation', () => {
        // Two bands separated by a gap. If accumulation were used, B's params
        // would be contiguous with A's. Instead B sits at its real reference position.
        const idx = new AnnotationCoordinateIndex()
        idx.build(gappedModel())
        const pB0 = idx.getTrackParamFromLineIntersection('B', 0)!
        const pB1 = idx.getTrackParamFromLineIntersection('B', 1)!
        expect(pB0).toBeCloseTo(200 / 500, 6)
        expect(pB1).toBeCloseTo(300 / 500, 6)
    })

    it('duplicated assemblies: first band wins for hover (deterministic)', () => {
        const idx = new AnnotationCoordinateIndex()
        idx.build(duplicatedModel())
        // First band for A is refStart=0..100 → midpoint maps to 50/400
        const param = idx.getTrackParamFromLineIntersection('A', 0.5)!
        expect(param).toBeCloseTo(50 / 400, 6)
    })
})

// ── getXYZFromTrackParam ────────────────────────────────────────────

describe('AnnotationCoordinateIndex getXYZFromTrackParam', () => {

    it('returns null when param falls in a gap between bands', () => {
        const idx = new AnnotationCoordinateIndex()
        const sm = mockSceneManager()
        idx.build(gappedModel())
        // Region [0..500]; gap is bp [100..200] = params [0.2..0.4].
        const result = idx.getXYZFromTrackParam(0.3, sm)
        expect(result).toBeNull()
    })

    it('+ strand: param at band start hits node t=0', () => {
        const idx = new AnnotationCoordinateIndex()
        const sm = mockSceneManager()
        idx.build(contiguousModel())
        // Band B starts at bp 100; param = 100/350. Should land at B's t=0.
        const r = idx.getXYZFromTrackParam(100 / 350, sm)!
        expect(r.nodeId).toBe('B')
        expect(r.t).toBeCloseTo(0, 5)
    })

    it('+ strand: param at band end hits node t≈1', () => {
        const idx = new AnnotationCoordinateIndex()
        const sm = mockSceneManager()
        idx.build(contiguousModel())
        // bp just below 300: should still be in band B.
        const param = (300 - 1e-3) / 350
        const r = idx.getXYZFromTrackParam(param, sm)!
        expect(r.nodeId).toBe('B')
        expect(r.t).toBeGreaterThan(0.99)
    })

    it('- strand: param at band start hits node t=1 (reversed)', () => {
        const idx = new AnnotationCoordinateIndex()
        const sm = mockSceneManager()
        idx.build(minusStrandModel())
        const r = idx.getXYZFromTrackParam(0, sm)!
        expect(r.nodeId).toBe('A')
        expect(r.t).toBeCloseTo(1, 5)
    })

    it('round-trips: t → param → t for + strand', () => {
        const idx = new AnnotationCoordinateIndex()
        const sm = mockSceneManager()
        idx.build(contiguousModel())
        for (const tIn of [0.1, 0.25, 0.5, 0.75, 0.9]) {
            const param = idx.getTrackParamFromLineIntersection('B', tIn)!
            const r = idx.getXYZFromTrackParam(param, sm)!
            expect(r.nodeId).toBe('B')
            expect(r.t).toBeCloseTo(tIn, 5)
        }
    })

    it('round-trips: t → param → t for - strand', () => {
        const idx = new AnnotationCoordinateIndex()
        const sm = mockSceneManager()
        idx.build(minusStrandModel())
        for (const tIn of [0.1, 0.25, 0.5, 0.75, 0.9]) {
            const param = idx.getTrackParamFromLineIntersection('A', tIn)!
            const r = idx.getXYZFromTrackParam(param, sm)!
            expect(r.nodeId).toBe('A')
            expect(r.t).toBeCloseTo(tIn, 5)
        }
    })
})
