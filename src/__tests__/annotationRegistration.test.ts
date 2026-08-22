/**
 * Registration probe — is the annotation track 1:1 with the linearized spine?
 *
 * The requirement: dragging across the track must move the dot along the spine
 * at a constant bp-per-world-unit rate, everywhere.
 *
 * This measures that rate directly. It is deliberately a test of the *contract*
 * between node geometry and track anchors, not of any particular backend build:
 * given a set of spine node extents and their reference bp extents, is the
 * mapping uniform? Feed it grid-pitch extents (what the backend emits today)
 * and it fails; feed it bp-proportional extents and it passes.
 */

import { describe, it, expect } from 'vitest'
import AnnotationCoordinateIndex from '../annotationCoordinateIndex.ts'
import type { AssemblyTrackModel } from '../assemblyTrackModel.ts'

// ── Layout models ───────────────────────────────────────────────────

interface SpineNode {
    id: string
    bp: number
}

/** World units the whole spine occupies. Mirrors TARGET_SPINE_WIDTH in the backend. */
const TARGET_SPINE_WIDTH = 3000

/**
 * Today's backend: extent = (numRects - 1) * NODE_SPACING, where
 * numRects - 1 = ceil(max(MINNODELENGTH, bp/1000) / NODESEGLEN).
 * At default settings every node up to 20,000 bp collapses to one segment
 * and is drawn exactly 30 units wide.
 */
function gridExtent(node: SpineNode): number {
    const NODE_SPACING = 30
    const MINNODELENGTH = 5
    const NODESEGLEN = 20
    const drawn = Math.max(MINNODELENGTH, (1000 * node.bp) / 1e6)
    return Math.max(1, Math.ceil(drawn / NODESEGLEN)) * NODE_SPACING
}

/** The fix: extent exactly proportional to bp, normalized to a constant total width. */
function bpExtent(node: SpineNode, allNodes: SpineNode[]): number {
    const totalBp = allNodes.reduce((sum, n) => sum + n.bp, 0)
    return (node.bp / totalBp) * TARGET_SPINE_WIDTH
}

// ── Fixtures ────────────────────────────────────────────────────────

/**
 * Contiguous spine: node i covers reference bp [offset, offset + bp).
 * Region matches the walk exactly, so there are no gaps.
 */
function spineModel(nodes: SpineNode[]): AssemblyTrackModel {
    let offset = 0
    const anchors = nodes.map(n => {
        const anchor = {
            nodeId: n.id,
            refStart: offset,
            refEnd: offset + n.bp,
            nodeStrand: '+' as const,
            lengthBp: n.bp,
        }
        offset += n.bp
        return anchor
    })

    return {
        assemblyKey: 'SPINE#1#chrZ',
        sequenceId: 'chrZ',
        regionStart: 0,
        regionEnd: offset,
        anchors,
        walkNodeIds: new Set(nodes.map(n => n.id)),
    }
}

/**
 * Lay nodes end to end along +x using `extentOf`, and expose them through the
 * minimal sceneManager surface getXYZFromTrackParam touches:
 * getActiveScene().getObjectByName('NodeMeshGroup').children[].{userData,getPoint}.
 *
 * getPoint interpolates linearly, which is what a real RibbonNode does for the
 * collinear constant-y point sets the linear layout emits.
 */
function sceneFor(nodes: SpineNode[], extentOf: (n: SpineNode) => number) {
    let x = 0
    const children = nodes.map(n => {
        const x0 = x
        const x1 = x + extentOf(n)
        x = x1
        return {
            userData: { nodeName: n.id },
            getPoint(t: number, _space?: string) {
                return { x: x0 + t * (x1 - x0), y: 0, z: 0 }
            },
        }
    })

    return {
        totalWidth: x,
        getActiveScene() {
            return { getObjectByName: (_name: string) => ({ children }) }
        },
    }
}

// ── The measurement ─────────────────────────────────────────────────

interface RateProfile {
    /** Rate between each pair of index-adjacent samples that both resolved. */
    rates: number[]
    meanRate: number
    /** The headline number: 0 is perfect registration. */
    maxRelativeDeviation: number
    /** Samples that resolved to a node, out of `sampled`. */
    covered: number
    sampled: number
}

/**
 * Sample the track at `steps + 1` evenly spaced parameters and measure the rate
 * between *index-adjacent* samples that both resolve to a node.
 *
 * The rate is dx/dparam. Registration holds exactly when that is one number
 * across the whole track, so `maxRelativeDeviation` is the whole assertion.
 *
 * Pairs straddling a gap are dropped rather than counted as violations: a null
 * sample between them breaks the adjacency. Reference spans no node covers are a
 * legitimate part of the model, not a registration failure.
 */
function rateProfile(
    index: AnnotationCoordinateIndex,
    sceneManager: any,
    steps = 500,
): RateProfile {

    const step = 1 / steps
    const xs: (number | null)[] = []

    for (let i = 0; i <= steps; i++) {
        try {
            const hit = index.getXYZFromTrackParam(i / steps, sceneManager)
            xs.push(hit ? hit.xyz.x : null)
        } catch {
            // A node in the model with no mesh in the scene. Treat as uncovered
            // rather than failing the whole measurement.
            xs.push(null)
        }
    }

    const rates: number[] = []
    for (let i = 0; i < xs.length - 1; i++) {
        const a = xs[i]
        const b = xs[i + 1]
        if (a === null || b === null) continue
        rates.push((b - a) / step)
    }

    const covered = xs.filter(x => x !== null).length

    if (rates.length === 0) {
        return { rates, meanRate: 0, maxRelativeDeviation: 0, covered, sampled: xs.length }
    }

    const meanRate = rates.reduce((sum, r) => sum + r, 0) / rates.length

    // A zero mean rate means the track maps to a single point — degenerate, and
    // no relative measure is meaningful.
    const scale = Math.abs(meanRate)
    const maxRelativeDeviation = scale === 0
        ? 0
        : rates.reduce((max, r) => Math.max(max, Math.abs(r - meanRate) / scale), 0)

    return { rates, meanRate, maxRelativeDeviation, covered, sampled: xs.length }
}

// ── Node sets ───────────────────────────────────────────────────────

/**
 * Four spine nodes spanning nearly three orders of magnitude in bp, all of them
 * under the 20 kb threshold where the grid layout saturates to one segment.
 */
const MIXED_SPINE: SpineNode[] = [
    { id: 'n1', bp: 50 },
    { id: 'n2', bp: 12000 },
    { id: 'n3', bp: 800 },
    { id: 'n4', bp: 19000 },
]

// ── Tests ───────────────────────────────────────────────────────────

describe('registration probe — measurement harness', () => {

    it('samples the whole track when the spine is contiguous', () => {
        const index = new AnnotationCoordinateIndex()
        index.build(spineModel(MIXED_SPINE))
        const profile = rateProfile(index, sceneFor(MIXED_SPINE, n => bpExtent(n, MIXED_SPINE)))

        // Only the final sample (param === 1, refBp === regionEnd) falls outside
        // every half-open anchor and is legitimately dead.
        expect(profile.covered).toBe(profile.sampled - 1)
    })

    it('reports a positive rate — the dot advances with increasing bp', () => {
        const index = new AnnotationCoordinateIndex()
        index.build(spineModel(MIXED_SPINE))
        const profile = rateProfile(index, sceneFor(MIXED_SPINE, n => bpExtent(n, MIXED_SPINE)))
        expect(profile.meanRate).toBeGreaterThan(0)
    })
})

describe('registration probe — bp-proportional spine geometry (the requirement)', () => {

    it('holds the rate constant to within 1% across the whole track', () => {
        const index = new AnnotationCoordinateIndex()
        index.build(spineModel(MIXED_SPINE))
        const profile = rateProfile(index, sceneFor(MIXED_SPINE, n => bpExtent(n, MIXED_SPINE)))
        expect(profile.maxRelativeDeviation).toBeLessThan(0.01)
    })

    it('holds the rate constant across node boundaries, not just within nodes', () => {
        // A boundary-straddling sample pair blends two nodes' rates. That is only
        // invisible if both rates are equal and the nodes are contiguous in x —
        // exactly what the inter-node gap of 0.0 guarantees.
        const index = new AnnotationCoordinateIndex()
        index.build(spineModel(MIXED_SPINE))
        // 37 samples over 4 nodes: coarse enough that pairs straddle every boundary.
        const profile = rateProfile(index, sceneFor(MIXED_SPINE, n => bpExtent(n, MIXED_SPINE)), 37)
        expect(profile.maxRelativeDeviation).toBeLessThan(0.01)
    })

    it('survives a 1000:1 bp ratio between adjacent nodes', () => {
        const extreme: SpineNode[] = [
            { id: 'tiny', bp: 20 },
            { id: 'huge', bp: 20000 },
            { id: 'tiny2', bp: 20 },
        ]
        const index = new AnnotationCoordinateIndex()
        index.build(spineModel(extreme))
        const profile = rateProfile(index, sceneFor(extreme, n => bpExtent(n, extreme)))
        expect(profile.maxRelativeDeviation).toBeLessThan(0.01)
    })

    it('stays uniform within covered spans when the reference has gaps', () => {
        // Region is wider than the walk, and the walk itself skips a span.
        const nodes: SpineNode[] = [{ id: 'a', bp: 1000 }, { id: 'b', bp: 3000 }]
        const model: AssemblyTrackModel = {
            assemblyKey: 'SPINE#1#chrZ',
            sequenceId: 'chrZ',
            regionStart: 0,
            regionEnd: 10000,
            anchors: [
                { nodeId: 'a', refStart: 0, refEnd: 1000, nodeStrand: '+', lengthBp: 1000 },
                { nodeId: 'b', refStart: 6000, refEnd: 9000, nodeStrand: '+', lengthBp: 3000 },
            ],
            walkNodeIds: new Set(['a', 'b']),
        }

        const index = new AnnotationCoordinateIndex()
        index.build(model)
        const profile = rateProfile(index, sceneFor(nodes, n => bpExtent(n, nodes)))

        expect(profile.covered).toBeLessThan(profile.sampled)   // the gap is dead
        expect(profile.maxRelativeDeviation).toBeLessThan(0.01) // covered spans still uniform
    })
})

describe('registration probe — grid spine geometry (the defect)', () => {

    it('every node up to 20 kb is drawn exactly 30 units wide', () => {
        // The quantization that breaks registration: a 50 bp node and a 19,000 bp
        // node get identical geometry.
        expect(gridExtent({ id: 'x', bp: 1 })).toBe(30)
        expect(gridExtent({ id: 'x', bp: 50 })).toBe(30)
        expect(gridExtent({ id: 'x', bp: 19999 })).toBe(30)
        expect(gridExtent({ id: 'x', bp: 20001 })).toBe(60)
    })

    it('produces a wildly non-uniform rate', () => {
        const index = new AnnotationCoordinateIndex()
        index.build(spineModel(MIXED_SPINE))
        const profile = rateProfile(index, sceneFor(MIXED_SPINE, gridExtent))

        // n4 (19,000 bp) and n1 (50 bp) both occupy 30 units, so the cursor
        // crosses n1 380x faster than n4 in bp terms.
        expect(profile.maxRelativeDeviation).toBeGreaterThan(5)
    })

    it('the rate spread matches the bp ratio between the widest and narrowest node', () => {
        const index = new AnnotationCoordinateIndex()
        index.build(spineModel(MIXED_SPINE))
        const { rates } = rateProfile(index, sceneFor(MIXED_SPINE, gridExtent))

        const fastest = Math.max(...rates)
        const slowest = Math.min(...rates)
        // 19000 / 50 = 380. Boundary-straddling pairs blend, so allow a wide band;
        // the point is the order of magnitude, not the exact figure.
        expect(fastest / slowest).toBeGreaterThan(100)
    })
})
