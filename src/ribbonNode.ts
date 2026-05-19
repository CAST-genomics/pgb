import * as THREE from 'three'
import RibbonMaterialFactory from './ribbonMaterialFactory.js'
import Look from './looks/look.ts'

// Single source of truth for the node ribbon's Z layering. Baked into
// vertex positions by buildNodeRibbonGeometry and read back by raycast()
// and getPoint(). Was previously duplicated across geometryFactory's
// NODE_LINE_Z_OFFSET, LineFactory's zOffset param, and userData.zOffset.
const NODE_Z_OFFSET = -8

const FLATNESS_TOLERANCE = 0.5
const MIN_DEPTH = 3
const MAX_DEPTH = 8

const ARC_LENGTH_SAMPLES = 256

// Sticky tracking: once the cursor has acquired a node within halfWidth,
// keep that node "owned" up to halfWidth * STICKY_RELEASE_MULTIPLIER.
// Spaghetti-curve nodes are hard to follow with the cursor without this.
// const STICKY_RELEASE_MULTIPLIER = 2.5 * 2 * 2
const STICKY_RELEASE_MULTIPLIER = 8

const ribbonNodes: Set<RibbonNode> = new Set()
let lastHalfWidth = 0
let stickyNode: RibbonNode | null = null

const _inverseMatrix = new THREE.Matrix4()
const _ray = new THREE.Ray()
const _splinePoint = new THREE.Vector3()

interface FrameContext {
    camera: any
    container: any
}

export function buildNodeRibbonGeometry(spline: any): any {

    const samples = adaptiveSample(spline)

    const vertexCount = samples.length * 2
    const positions = new Float32Array(vertexCount * 3)
    const normal2ds = new Float32Array(vertexCount * 2)
    const uParams = new Float32Array(vertexCount)
    const sides = new Float32Array(vertexCount)
    const uvs = new Float32Array(vertexCount * 2)

    const N = samples.length

    for (let i = 0; i < N; i++) {
        const { t, point } = samples[i]

        let tx, ty
        if (i === 0) {
            tx = samples[1].point.x - point.x
            ty = samples[1].point.y - point.y
        } else if (i === N - 1) {
            tx = point.x - samples[N - 2].point.x
            ty = point.y - samples[N - 2].point.y
        } else {
            tx = samples[i + 1].point.x - samples[i - 1].point.x
            ty = samples[i + 1].point.y - samples[i - 1].point.y
        }

        const len = Math.sqrt(tx * tx + ty * ty)
        if (len > 0) { tx /= len; ty /= len }

        const nx = -ty
        const ny = tx

        const topIdx = 2 * i
        positions[topIdx * 3    ] = point.x
        positions[topIdx * 3 + 1] = point.y
        positions[topIdx * 3 + 2] = NODE_Z_OFFSET
        normal2ds[topIdx * 2    ] = nx
        normal2ds[topIdx * 2 + 1] = ny
        uParams[topIdx] = t
        sides[topIdx] = 1.0
        uvs[topIdx * 2    ] = t
        uvs[topIdx * 2 + 1] = 1.0

        const botIdx = 2 * i + 1
        positions[botIdx * 3    ] = point.x
        positions[botIdx * 3 + 1] = point.y
        positions[botIdx * 3 + 2] = NODE_Z_OFFSET
        normal2ds[botIdx * 2    ] = nx
        normal2ds[botIdx * 2 + 1] = ny
        uParams[botIdx] = t
        sides[botIdx] = -1.0
        uvs[botIdx * 2    ] = t
        uvs[botIdx * 2 + 1] = 0.0
    }

    const indices: number[] = []
    for (let i = 0; i < N - 1; i++) {
        const tl = 2 * i
        const bl = 2 * i + 1
        const tr = 2 * (i + 1)
        const br = 2 * (i + 1) + 1
        indices.push(tl, bl, tr)
        indices.push(bl, br, tr)
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('normal2d', new THREE.BufferAttribute(normal2ds, 2))
    geometry.setAttribute('uParam', new THREE.BufferAttribute(uParams, 1))
    geometry.setAttribute('side', new THREE.BufferAttribute(sides, 1))
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
    geometry.setIndex(indices)

    geometry.userData.totalArcLength = spline.getLength()
    geometry.userData.sampleCount = N

    return geometry
}

function adaptiveSample(spline: any): Array<{ t: number; point: any }> {
    const samples: Array<{ t: number; point: any }> = []
    const pStart = spline.getPoint(0)
    const pEnd = spline.getPoint(1)
    samples.push({ t: 0, point: pStart })
    subdivide(spline, 0, 1, pStart, pEnd, samples, 0)
    samples.push({ t: 1, point: pEnd })
    samples.sort((a, b) => a.t - b.t)
    return samples
}

function subdivide(spline: any, tStart: number, tEnd: number, pStart: any, pEnd: any, samples: any[], depth: number): void {
    const tMid = (tStart + tEnd) / 2
    const pMid = spline.getPoint(tMid)
    const deviation = pointToLineDistance(pMid, pStart, pEnd)
    const needsSubdivision = deviation > FLATNESS_TOLERANCE || depth < MIN_DEPTH
    if (needsSubdivision && depth < MAX_DEPTH) {
        subdivide(spline, tStart, tMid, pStart, pMid, samples, depth + 1)
        samples.push({ t: tMid, point: pMid })
        subdivide(spline, tMid, tEnd, pMid, pEnd, samples, depth + 1)
    }
}

function pointToLineDistance(P: any, A: any, B: any): number {
    const abx = B.x - A.x
    const aby = B.y - A.y
    const apx = P.x - A.x
    const apy = P.y - A.y
    const abLenSq = abx * abx + aby * aby
    if (abLenSq === 0) return Math.sqrt(apx * apx + apy * apy)
    const cross = Math.abs(abx * apy - aby * apx)
    return cross / Math.sqrt(abLenSq)
}

class RibbonNode extends THREE.Mesh {

    constructor(geometry: any, material: any) {
        super(geometry, material)
    }

    /**
     * Wire a node mesh: bind geometry+material, attach the spline reference
     * needed by raycast and getPoint, and join the per-frame uniform tick.
     */
    static create(geometry: any, spline: any, material: any): RibbonNode {
        const node = new RibbonNode(geometry, material)
        node.userData.spline = spline
        ribbonNodes.add(node)
        return node
    }

    /**
     * Remove this node from the per-frame tick. Idempotent.
     */
    dispose(): void {
        ribbonNodes.delete(this)
    }

    #getArcLengthTable(): { pts: any[]; cum: Float64Array; total: number; samples: number } {
        if (this.userData.arcLengthTable) return this.userData.arcLengthTable

        const spline = this.userData.spline
        const N = ARC_LENGTH_SAMPLES
        const pts = new Array(N + 1)
        for (let i = 0; i <= N; i++) pts[i] = spline.getPoint(i / N)

        const cum = new Float64Array(N + 1)
        for (let i = 0; i < N; i++) cum[i + 1] = cum[i] + pts[i].distanceTo(pts[i + 1])

        const table = { pts, cum, total: cum[N], samples: N }
        this.userData.arcLengthTable = table
        return table
    }

    #arcLengthUToNativeT(u: number): number {
        const { cum, total, samples } = this.#getArcLengthTable()
        if (total <= 0) return 0
        const s = THREE.MathUtils.clamp(u, 0, 1) * total
        if (s >= total) return 1
        let lo = 0, hi = samples
        while (lo + 1 < hi) {
            const mid = (lo + hi) >> 1
            cum[mid] <= s ? (lo = mid) : (hi = mid)
        }
        const L = cum[lo + 1] - cum[lo]
        const frac = L > 0 ? (s - cum[lo]) / L : 0
        return (lo + frac) / samples
    }

    #nativeTToArcLengthU(t: number): number {
        const { cum, total, samples } = this.#getArcLengthTable()
        if (total <= 0) return 0
        const tt = THREE.MathUtils.clamp(t, 0, 1)
        const pos = tt * samples
        const i = Math.min(Math.floor(pos), samples - 1)
        const frac = pos - i
        const s = cum[i] + frac * (cum[i + 1] - cum[i])
        return s / total
    }

    /**
     * Custom raycast: project the ray onto the XY plane (orthographic),
     * find the closest point on the spline, hit if within halfWidth.
     *
     * Uses the module-scope halfWidth snapshot taken by the most recent
     * tickRibbonResolution() — does NOT read material.uniforms. This severs
     * raycast hit-testing from shader-uniform plumbing so it can be unit
     * tested by setting the snapshot directly.
     */
    raycast(raycaster: any, intersects: any[]): void {

        const halfWidth = lastHalfWidth
        if (!halfWidth || halfWidth <= 0) return

        const spline = this.userData.spline
        if (!spline) return

        _inverseMatrix.copy(this.matrixWorld).invert()
        _ray.copy(raycaster.ray).applyMatrix4(_inverseMatrix)

        const pointerX = _ray.origin.x
        const pointerY = _ray.origin.y

        const coarseSamples = 32
        let bestT = 0
        let bestDistSq = Infinity

        for (let i = 0; i <= coarseSamples; i++) {
            const t = i / coarseSamples
            spline.getPoint(t, _splinePoint)
            const dx = _splinePoint.x - pointerX
            const dy = _splinePoint.y - pointerY
            const distSq = dx * dx + dy * dy
            if (distSq < bestDistSq) {
                bestDistSq = distSq
                bestT = t
            }
        }

        // Iterative refinement: shrink the t-window around bestT until the
        // worst-case world-space sample spacing is well below halfWidth.
        // Fixed-density sampling fails at high zoom because halfWidth scales
        // down with zoom while the parametric step does not — the true
        // closest point on the curve can sit between samples, farther than
        // halfWidth from any of them, and the hit is silently lost.
        const fineSamples = 16
        const RESOLUTION_TARGET = halfWidth / 4
        const MAX_REFINE_ITERATIONS = 8
        let windowHalf = 1 / coarseSamples

        for (let iter = 0; iter < MAX_REFINE_ITERATIONS; iter++) {
            const tLo = Math.max(0, bestT - windowHalf)
            const tHi = Math.min(1, bestT + windowHalf)
            let prevX = 0, prevY = 0
            let maxSpacingSq = 0

            for (let i = 0; i <= fineSamples; i++) {
                const t = tLo + (tHi - tLo) * (i / fineSamples)
                spline.getPoint(t, _splinePoint)
                const dx = _splinePoint.x - pointerX
                const dy = _splinePoint.y - pointerY
                const distSq = dx * dx + dy * dy
                if (distSq < bestDistSq) {
                    bestDistSq = distSq
                    bestT = t
                }
                if (i > 0) {
                    const sdx = _splinePoint.x - prevX
                    const sdy = _splinePoint.y - prevY
                    const sp = sdx * sdx + sdy * sdy
                    if (sp > maxSpacingSq) maxSpacingSq = sp
                }
                prevX = _splinePoint.x
                prevY = _splinePoint.y
            }

            if (Math.sqrt(maxSpacingSq) < RESOLUTION_TARGET) break
            windowHalf *= 0.5
        }

        const bestDist = Math.sqrt(bestDistSq)

        const threshold = (this === stickyNode) ? halfWidth * STICKY_RELEASE_MULTIPLIER : halfWidth

        if (bestDist <= threshold) {
            spline.getPoint(bestT, _splinePoint)
            _splinePoint.z = NODE_Z_OFFSET

            const worldPoint = _splinePoint.clone().applyMatrix4(this.matrixWorld)

            const u = this.#nativeTToArcLengthU(bestT)

            intersects.push({
                distance: raycaster.ray.origin.distanceTo(worldPoint),
                point: worldPoint,
                uv: new THREE.Vector2(u, 0.5),
                object: this,
                splineDistSq: bestDistSq,
            })
        }
    }

    /**
     * Get a world- or local-space point at arc-length fraction u along the node.
     */
    getPoint(u: number, space?: 'world' | 'local'): any {
        const nativeT = this.#arcLengthUToNativeT(u)
        const point = this.userData.spline.getPoint(nativeT)
        point.z = NODE_Z_OFFSET
        return space === 'world' ? this.localToWorld(point) : point
    }

    /**
     * Recover the arc-length parameter u from a raycast intersection.
     * The custom raycast sets uv.x to the arc-length u.
     */
    static getParameter(intersection: any): { t: number; nodeName: string } {
        const { object, uv } = intersection
        const t = uv ? uv.x : 0
        const { nodeName } = object.userData
        return { t, nodeName, ...intersection }
    }

    /**
     * Find a RibbonNode by node name in a mesh group.
     */
    static getLine(nodeName: string, nodeMeshGroup: any): RibbonNode {
        return nodeMeshGroup.children.find((child: any) => child.userData.nodeName === nodeName) as RibbonNode
    }

    /**
     * Count of nodes currently registered for the per-frame tick.
     * Lets tests assert "after teardown, no leaks remain."
     */
    static get registeredCount(): number {
        return ribbonNodes.size
    }
}

/**
 * Per-frame tick: recompute halfWidth from camera+container, snapshot it
 * onto each registered node (for raycast), and write the matching uniform
 * (for the shader). Replaces lineMaterialResolutionService.update().
 */
export function tickRibbonResolution(ctx: FrameContext): void {
    if (ribbonNodes.size === 0) return
    const halfWidth = RibbonMaterialFactory.computeHalfWidth(ctx.camera, Look.NODE_LINE_WIDTH_PIXELS, ctx.container)
    lastHalfWidth = halfWidth
    for (const node of ribbonNodes) {
        const mat: any = node.material
        if (mat?.uniforms?.halfWidth) {
            mat.uniforms.halfWidth.value = halfWidth
        }
    }
}

/**
 * Bulk-clear the registry. Called on dataset reload alongside scene teardown.
 */
export function clearRibbonRegistry(): void {
    ribbonNodes.clear()
    stickyNode = null
}

/**
 * Mark a node as "sticky" — it will be hit-testable out to a wider radius
 * than non-sticky nodes until another node is acquired or the cursor leaves.
 * Pass null to release.
 */
export function setStickyNode(node: RibbonNode | null): void {
    stickyNode = node
}

/**
 * Test-only: directly set the halfWidth snapshot used by raycast(). Lets
 * unit tests exercise hit-testing without running a full per-frame tick.
 */
export function __setHalfWidthForTests(v: number): void {
    lastHalfWidth = v
}

export default RibbonNode
