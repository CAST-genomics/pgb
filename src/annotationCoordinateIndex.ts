import RibbonNode from "./ribbonNode.ts"
import type { AssemblyTrackModel, AssemblyTrackAnchor } from "./assemblyTrackModel.ts"

/**
 * Pure coordinate-mapping index for an assembly's annotation track.
 *
 * Built from an AssemblyTrackModel on assembly emphasis. The canvas extent
 * is the assembly's reference `region`; each anchor (per-node reference extent)
 * is positioned by its own coordinates — no cumulative-length synthesis.
 *
 * Orientation is taken from node_strand:
 *   '+' → entryT=0, exitT=1
 *   '-' → entryT=1, exitT=0
 *
 * No DOM, no events, no rendering — just coordinate math.
 */
class AnnotationCoordinateIndex {

    bpStart: number | undefined
    bpEnd: number | undefined

    anchors: AssemblyTrackAnchor[]
    anchorsByNode: Map<string, AssemblyTrackAnchor[]>

    constructor() {
        this.anchors = []
        this.anchorsByNode = new Map()
    }

    get isEmpty(): boolean {
        return this.anchors.length === 0
    }

    /**
     * Build the index from an AssemblyTrackModel.
     * Call on each assembly:emphasis event.
     */
    build(model: AssemblyTrackModel): { anchors: AssemblyTrackAnchor[]; bpStart: number; bpEnd: number } {

        this.clear()

        this.bpStart = model.regionStart
        this.bpEnd = model.regionEnd
        this.anchors = model.anchors.slice()

        for (const anchor of this.anchors) {
            const list = this.anchorsByNode.get(anchor.nodeId)
            if (list) list.push(anchor)
            else this.anchorsByNode.set(anchor.nodeId, [anchor])
        }

        return { anchors: this.anchors, bpStart: this.bpStart, bpEnd: this.bpEnd }
    }

    /**
     * Map a raycast (nodeName, tRaw on the RibbonNode's arc-length parameterization)
     * to a normalized track parameter (0..1). Returns null if the node has no anchor
     * on this track.
     *
     * If a node has multiple anchors (duplicated_assembly), the first anchor wins.
     */
    getTrackParamFromLineIntersection(nodeName: string, t: number): number | null {

        const anchors = this.anchorsByNode.get(nodeName)
        if (!anchors || anchors.length === 0) return null

        const anchor = anchors[0]
        const u = orientedU(t, anchor.nodeStrand)

        const refBp = anchor.refStart + u * anchor.lengthBp
        return bpToParam(refBp, this.bpStart!, this.bpEnd!)
    }

    /**
     * Map a normalized track parameter (0..1) to a 3D position on the graph.
     * Returns null if the corresponding reference bp falls in a gap between
     * anchors (no node covers it).
     */
    getXYZFromTrackParam(param: number, sceneManager: any): { nodeId: string; t: number; xyz: any; u: number } | null {

        const refBp = this.bpStart! + param * (this.bpEnd! - this.bpStart!)

        const anchor = findAnchorContaining(this.anchors, refBp)
        if (!anchor) return null

        const u = anchor.lengthBp ? clamp01((refBp - anchor.refStart) / anchor.lengthBp) : 0
        const t = strandToT(u, anchor.nodeStrand)

        const nodeMeshGroup = sceneManager.getActiveScene().getObjectByName('NodeMeshGroup')
        const line = RibbonNode.getLine(anchor.nodeId, nodeMeshGroup)
        const xyz = line.getPoint(t, 'world')

        return { nodeId: anchor.nodeId, t, xyz, u }
    }

    clear(): void {
        this.anchors = []
        this.anchorsByNode.clear()
        this.bpStart = undefined
        this.bpEnd = undefined
    }
}

// ---------- helpers ----------

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)

function bpToParam(bp: number, bpStart: number, bpEnd: number): number {
    const span = bpEnd - bpStart
    if (span <= 0) return 0
    return clamp01((bp - bpStart) / span)
}

/**
 * Given a raw arc-length t on a RibbonNode and the node's strand, return the
 * oriented u (progress in the strand's natural direction, 0..1).
 *
 * '+' strand: u = t.   '-' strand: u = 1 - t.
 */
function orientedU(t: number, nodeStrand: '+' | '-'): number {
    return clamp01(nodeStrand === '-' ? 1 - t : t)
}

/**
 * Inverse of orientedU: given oriented u and strand, return the raw t to
 * sample on the RibbonNode.
 */
function strandToT(u: number, nodeStrand: '+' | '-'): number {
    return clamp01(nodeStrand === '-' ? 1 - u : u)
}

/**
 * Linear scan for the first anchor containing refBp in [refStart, refEnd).
 * Anchors are sorted by refStart but may overlap (duplicated assemblies on the
 * same reference region are rare but legal), so we return the first match
 * deterministically.
 */
function findAnchorContaining(anchors: AssemblyTrackAnchor[], refBp: number): AssemblyTrackAnchor | null {
    for (const anchor of anchors) {
        if (refBp >= anchor.refStart && refBp < anchor.refEnd) return anchor
    }
    return null
}

export default AnnotationCoordinateIndex
