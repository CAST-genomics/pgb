// ---------- tiny helpers ----------
import ParametricLine from "../parametricLine.js"

const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
const d2 = (a, b) => { const dx=a.x-b.x, dy=a.y-b.y, dz=a.z-b.z; return dx*dx+dy*dy+dz*dz; };

// ---------- 1) Build a bp index from getSpineFeatures(...) ----------
/**
 * spine.nodes must be ordered in walk order and contain {id, bpStart, bpEnd}.
 * This is monotonic (bp always increases along the spine).
 */
function buildBpIndex(spine) {
    const idx = spine.nodes.map(n => ({
        id: n.id,
        bpStart: n.bpStart,
        bpEnd: n.bpEnd,
        lengthBp: Math.max(0, (n.bpEnd ?? 0) - (n.bpStart ?? 0)),
    }));
    const bpMin = idx.length ? idx[0].bpStart : 0;
    const bpMax = idx.length ? idx[idx.length - 1].bpEnd : 0;
    return { idx, bpMin, bpMax };
}

function makeNodeRecordMap(bpIndex) {
    const m = new Map();
    for (const n of bpIndex.idx) m.set(n.id, n);
    return m;
}

// ---------- 2) Anchor each node’s t to “left neighbor → right neighbor” ----------
/**
 * Decide, per node, which endpoint of its ParametricLine is the entry (near left neighbor)
 * and which is the exit (near right neighbor). This makes mapping monotonic and visually correct
 * even when the line’s internal t runs the “wrong” way.
 *
 * @param {string[]} walkNodes - node ids in spine/walk order (left→right on the track)
 * @param sceneManager
 * @returns {Map<string, {entryT:0|1, exitT:0|1}>}
 */
function buildNodeEndpointMap(walkNodes, sceneManager) {

    const map = new Map();

    const nodeMeshGroup = sceneManager.getActiveScene().getObjectByName('NodeMeshGroup')
    const endpoint = (id, t) => ParametricLine.getLine(id, nodeMeshGroup).getPoint(t, 'world');
    const center   = (id)    => ParametricLine.getLine(id, nodeMeshGroup).getPoint(0.5, 'world');

    for (let i = 0; i < walkNodes.length; i++) {
        const id = walkNodes[i];
        const prevId = i > 0 ? walkNodes[i - 1] : null;
        const nextId = i < walkNodes.length - 1 ? walkNodes[i + 1] : null;

        const p0 = endpoint(id, 0);
        const p1 = endpoint(id, 1);

        let entryT = 0;
        let exitT = 1;

        if (p0 && p1) {
            if (prevId && nextId) {
                const prevC = center(prevId), nextC = center(nextId);
                const dPrev0 = prevC ? d2(p0, prevC) : Infinity;
                const dPrev1 = prevC ? d2(p1, prevC) : Infinity;
                entryT = dPrev0 <= dPrev1 ? 0 : 1;

                const dNext0 = nextC ? d2(p0, nextC) : Infinity;
                const dNext1 = nextC ? d2(p1, nextC) : Infinity;
                exitT = dNext0 <= dNext1 ? 0 : 1;

                if (entryT === exitT) exitT = 1 - entryT; // degenerate: force opposite end
            } else if (nextId) {
                const nextC = center(nextId);
                const dNext0 = nextC ? d2(p0, nextC) : Infinity;
                const dNext1 = nextC ? d2(p1, nextC) : Infinity;
                exitT  = dNext0 <= dNext1 ? 0 : 1;
                entryT = 1 - exitT;
            } else if (prevId) {
                const prevC = center(prevId);
                const dPrev0 = prevC ? d2(p0, prevC) : Infinity;
                const dPrev1 = prevC ? d2(p1, prevC) : Infinity;
                entryT = dPrev0 <= dPrev1 ? 0 : 1;
                exitT  = 1 - entryT;
            }
        }
        map.set(id, { entryT, exitT });
    }
    return map;
}

// ---------- 3) Track → Graph: bp to {nodeId, t, xyz} ----------
/**
 * Monotonic mapping from track bp to a position on the graph.
 * Internally converts bp → node → u (0..1) → oriented t via (entryT, exitT).
 */
function getLineXYZWithTrackBasepair(bp, bpIndex, endpointMap, sceneManager) {
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

// ---------- 4) Graph → Track: (nodeId, tRaw) back to bp ----------
/**
 * Given a raycast on a ParametricLine (nodeId, tRaw from the line’s own parameterization),
 * convert to the oriented progress u via (entryT, exitT), then map to track bp.
 * NOTE: keep using the raycast xyz for the dot; this mapping is for semantics (bp/scrubber).
 */
function getTrackParameterWithLineParameter(nodeName, tRaw, bpIndex, endpointMap, bpIndexMap) {

    const node = bpIndexMap.get(nodeName)

    const { entryT = 0, exitT = 1 } = endpointMap.get(nodeName);

    const denom = (exitT - entryT) || 1; // avoid division by zero

    const u = clamp01((tRaw - entryT) / denom);

    const bp = node.bpStart + u * (node.lengthBp || 0);

    return { bp, u };
}

export { buildBpIndex, makeNodeRecordMap, buildNodeEndpointMap, getTrackParameterWithLineParameter, getLineXYZWithTrackBasepair }
