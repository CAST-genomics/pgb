import ParametricLine from "./parametricLine.js"

// ---------- tiny helpers ----------

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const d2 = (a: any, b: any) => { const dx=a.x-b.x, dy=a.y-b.y, dz=a.z-b.z; return dx*dx+dy*dy+dz*dz; };

// ---------- types ----------

interface NodeRecord {
    id: string
    bpStart: number
    bpEnd: number
    lengthBp: number
}

interface BpIndex {
    idx: NodeRecord[]
    bpMin: number
    bpMax: number
}

interface SplineParam {
    startParam: number
    endParam: number
}

interface Endpoint {
    entryT: 0 | 1
    exitT: 0 | 1
}

/**
 * Pure coordinate-mapping index for an assembly's annotation track.
 *
 * Built from spine data on assembly emphasis, this class owns the four
 * interrelated maps that enable bidirectional bp ↔ xyz coordinate mapping
 * between the 1D annotation track and the 3D pangenome graph.
 *
 * No DOM, no events, no rendering — just coordinate math.
 */
class AnnotationCoordinateIndex {

    bpIndex: BpIndex | undefined
    bpIndexMap: Map<string, NodeRecord>
    endpointMap: Map<string, Endpoint>
    splineParameterMap: Map<string, SplineParam>

    bpStart: number | undefined
    bpEnd: number | undefined

    constructor() {
        this.bpIndex = undefined
        this.bpIndexMap = new Map()
        this.endpointMap = new Map()
        this.splineParameterMap = new Map()
    }

    get isEmpty(): boolean {
        return this.splineParameterMap.size === 0
    }

    /**
     * Build all coordinate maps from spine data.
     * Call this on each assembly:emphasis event.
     */
    build(spine: any, sceneManager: any): { nodes: any[]; bpStart: number; bpEnd: number } {

        this.clear()

        const { nodes } = spine

        this.bpIndex = buildBpIndex(spine)
        this.bpIndexMap = makeNodeRecordMap(this.bpIndex)

        const walkNodes = nodes.map((n: any) => n.id)
        this.endpointMap = buildNodeEndpointMap(walkNodes, sceneManager)

        const bpStart = nodes[0].bpStart
        const bpEnd = nodes[nodes.length - 1].bpEnd

        this.bpStart = bpStart
        this.bpEnd = bpEnd

        const bpExtent = bpEnd - bpStart

        for (const node of nodes) {
            const startParam = (node.bpStart - bpStart) / bpExtent
            const endParam = (node.bpEnd - bpStart) / bpExtent
            this.splineParameterMap.set(node.id, { startParam, endParam })
        }

        return { nodes, bpStart, bpEnd }
    }

    /**
     * Map a raycast (nodeName, tRaw) to a normalized track parameter (0..1).
     * Used for 3D hover → annotation track visual feedback positioning.
     * Returns null if nodeName is not in the index.
     */
    getTrackParamFromLineIntersection(nodeName: string, t: number): number | null {

        const splineParam = this.splineParameterMap.get(nodeName)
        if (splineParam === undefined) return null

        const { bp, u: tOriented } = getTrackParameterWithLineParameter(
            nodeName, t, this.bpIndex!, this.endpointMap, this.bpIndexMap
        )

        const { startParam, endParam } = splineParam
        return startParam * (1 - tOriented) + endParam * tOriented
    }

    /**
     * Map a normalized track parameter (0..1) to a 3D position on the graph.
     * Used for annotation track mouse hover → 3D visual feedback.
     */
    getXYZFromTrackParam(param: number, sceneManager: any): { nodeId: string; t: number; xyz: any; u: number } | null {

        const bp = Math.floor(this.bpStart! * (1 - param) + this.bpEnd! * param)

        return getLineXYZWithTrackBasepair(bp, this.bpIndex!, this.endpointMap, sceneManager)
    }

    clear(): void {
        this.splineParameterMap.clear()
        this.bpIndex = undefined
        this.bpIndexMap.clear()
        this.endpointMap.clear()
        this.bpStart = undefined
        this.bpEnd = undefined
    }
}

// ---------- private coordinate-mapping functions ----------
// (absorbed from annotationTrackUtils.js)

/**
 * Build a bp index from spine data.
 * spine.nodes must be ordered in walk order and contain {id, bpStart, bpEnd}.
 * This is monotonic (bp always increases along the spine).
 */
function buildBpIndex(spine: any): BpIndex {
    const idx = spine.nodes.map((n: any) => ({
        id: n.id,
        bpStart: n.bpStart,
        bpEnd: n.bpEnd,
        lengthBp: Math.max(0, (n.bpEnd ?? 0) - (n.bpStart ?? 0)),
    }));
    const bpMin = idx.length ? idx[0].bpStart : 0;
    const bpMax = idx.length ? idx[idx.length - 1].bpEnd : 0;
    return { idx, bpMin, bpMax };
}

function makeNodeRecordMap(bpIndex: BpIndex): Map<string, NodeRecord> {
    const m = new Map<string, NodeRecord>();
    for (const n of bpIndex.idx) m.set(n.id, n);
    return m;
}

/**
 * Decide, per node, which endpoint of its ParametricLine is the entry (near left neighbor)
 * and which is the exit (near right neighbor). This makes mapping monotonic and visually correct
 * even when the line's internal t runs the "wrong" way.
 */
function buildNodeEndpointMap(walkNodes: string[], sceneManager: any): Map<string, Endpoint> {

    const map = new Map<string, Endpoint>();

    const nodeMeshGroup = sceneManager.getActiveScene().getObjectByName('NodeMeshGroup')
    const endpoint = (id: string, t: number) => ParametricLine.getLine(id, nodeMeshGroup).getPoint(t, 'world');
    const center   = (id: string)            => ParametricLine.getLine(id, nodeMeshGroup).getPoint(0.5, 'world');

    for (let i = 0; i < walkNodes.length; i++) {
        const id = walkNodes[i];
        const prevId = i > 0 ? walkNodes[i - 1] : null;
        const nextId = i < walkNodes.length - 1 ? walkNodes[i + 1] : null;

        const p0 = endpoint(id, 0);
        const p1 = endpoint(id, 1);

        let entryT: 0 | 1 = 0;
        let exitT: 0 | 1 = 1;

        if (p0 && p1) {
            if (prevId && nextId) {
                const prevC = center(prevId), nextC = center(nextId);
                const dPrev0 = prevC ? d2(p0, prevC) : Infinity;
                const dPrev1 = prevC ? d2(p1, prevC) : Infinity;
                entryT = dPrev0 <= dPrev1 ? 0 : 1;

                const dNext0 = nextC ? d2(p0, nextC) : Infinity;
                const dNext1 = nextC ? d2(p1, nextC) : Infinity;
                exitT = dNext0 <= dNext1 ? 0 : 1;

                if (entryT === exitT) exitT = (1 - entryT) as 0 | 1; // degenerate: force opposite end
            } else if (nextId) {
                const nextC = center(nextId);
                const dNext0 = nextC ? d2(p0, nextC) : Infinity;
                const dNext1 = nextC ? d2(p1, nextC) : Infinity;
                exitT  = dNext0 <= dNext1 ? 0 : 1;
                entryT = (1 - exitT) as 0 | 1;
            } else if (prevId) {
                const prevC = center(prevId);
                const dPrev0 = prevC ? d2(p0, prevC) : Infinity;
                const dPrev1 = prevC ? d2(p1, prevC) : Infinity;
                entryT = dPrev0 <= dPrev1 ? 0 : 1;
                exitT  = (1 - entryT) as 0 | 1;
            }
        }
        map.set(id, { entryT, exitT });
    }
    return map;
}

/**
 * Monotonic mapping from track bp to a position on the graph.
 * Internally converts bp → node → u (0..1) → oriented t via (entryT, exitT).
 */
function getLineXYZWithTrackBasepair(bp: number, bpIndex: BpIndex, endpointMap: Map<string, Endpoint>, sceneManager: any) {
    const { idx } = bpIndex;
    if (!idx.length) return null;

    // clamp into [first.bpStart, last.bpEnd)
    const first = idx[0], last = idx[idx.length - 1];
    if (bp < first.bpStart) bp = first.bpStart;
    if (bp >= last.bpEnd)   bp = last.bpEnd - 1e-9;

    // binary search node with bpStart <= bp < bpEnd
    let lo = 0, hi = idx.length - 1, hit = 0;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const n = idx[mid];
        if (bp < n.bpStart) hi = mid - 1;
        else if (bp >= n.bpEnd) lo = mid + 1;
        else { hit = mid; break; }
    }

    const n = idx[hit];
    const u = n.lengthBp ? clamp01((bp - n.bpStart) / n.lengthBp) : 0;

    const { entryT = 0, exitT = 1 } = endpointMap.get(n.id) ?? {};
    const t = entryT + u * (exitT - entryT);

    const nodeMeshGroup = sceneManager.getActiveScene().getObjectByName('NodeMeshGroup')
    const line = ParametricLine.getLine(n.id, nodeMeshGroup);
    const xyz  = line.getPoint(t, 'world')

    return { nodeId: n.id, t, xyz, u };
}

/**
 * Given a raycast on a ParametricLine (nodeId, tRaw from the line's own parameterization),
 * convert to the oriented progress u via (entryT, exitT), then map to track bp.
 */
function getTrackParameterWithLineParameter(nodeName: string, tRaw: number, bpIndex: BpIndex, endpointMap: Map<string, Endpoint>, bpIndexMap: Map<string, NodeRecord>) {

    const node = bpIndexMap.get(nodeName)!

    const { entryT = 0, exitT = 1 } = endpointMap.get(nodeName)!;

    const denom = (exitT - entryT) || 1; // avoid division by zero

    const u = clamp01((tRaw - entryT) / denom);

    const bp = node.bpStart + u * (node.lengthBp || 0);

    return { bp, u };
}

export default AnnotationCoordinateIndex
