import * as THREE from 'three'

const _inverseMatrix = new THREE.Matrix4()
const _ray = new THREE.Ray()
const _splinePoint = new THREE.Vector3()

// Arc-length sampling density. 256 samples across [0,1] native-t gives
// sub-pixel accuracy on the curviest real nodes observed to date.
const ARC_LENGTH_SAMPLES = 256

/**
 * RibbonLine — a THREE.Mesh subclass for ribbon-based node rendering.
 *
 * Owns an arc-length parameterization of its spline so callers can address
 * positions along the ribbon by fraction-of-arc-length u ∈ [0,1] rather than
 * the non-uniform native t of THREE.CatmullRomCurve3. This matches the
 * contract the annotation track and raycast pipeline rely on — the prior
 * ParametricLine class got its arc-length semantics from Line2's buffer
 * attributes; RibbonLine reconstructs it from the spline directly.
 *
 * Overrides raycast() because the GPU-side geometry is expanded by halfWidth
 * in the vertex shader, but the CPU-side positions are centerline-only.
 */
class RibbonLine extends THREE.Mesh {

    constructor(geometry, material) {
        super(geometry, material)
    }

    /**
     * Return (and lazily build) the arc-length table for this mesh's spline.
     * Memoized on userData so the cost is paid once per mesh. Samples the
     * spline at uniform native-t intervals, records cumulative chord lengths.
     */
    #getArcLengthTable() {
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

    /**
     * Map fraction-of-arc-length u ∈ [0,1] to the spline's native parameter.
     * Inverse of the cum table: find the segment containing s = u*total, then
     * linearly interpolate native-t within it.
     */
    #arcLengthUToNativeT(u) {
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

    /**
     * Custom raycast: project the ray onto the XY plane (orthographic),
     * then find the closest point on the spline. If distance < halfWidth, it's a hit.
     */
    raycast(raycaster, intersects) {

        const halfWidth = this.material.uniforms?.halfWidth?.value
        if (!halfWidth || halfWidth <= 0) return

        const spline = this.userData.spline
        if (!spline) return

        // Transform ray into local space
        _inverseMatrix.copy(this.matrixWorld).invert()
        _ray.copy(raycaster.ray).applyMatrix4(_inverseMatrix)

        // In orthographic view, the ray origin's XY is the pointer in world space.
        // We find the closest point on the spline to this XY position.
        const pointerX = _ray.origin.x
        const pointerY = _ray.origin.y

        // Coarse search: sample spline at intervals to find nearest region
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

        // Fine search: refine within the nearest coarse interval
        const step = 1 / coarseSamples
        const tLo = Math.max(0, bestT - step)
        const tHi = Math.min(1, bestT + step)
        const fineSamples = 16

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
        }

        const bestDist = Math.sqrt(bestDistSq)

        if (bestDist <= halfWidth) {
            spline.getPoint(bestT, _splinePoint)
            _splinePoint.z = this.userData.zOffset || 0

            const worldPoint = _splinePoint.clone().applyMatrix4(this.matrixWorld)

            // Report position in arc-length u, not native t, so downstream
            // consumers (annotationCoordinateIndex, raycastService) see the
            // same parameterization getPoint exposes.
            const u = this.#nativeTToArcLengthU(bestT)

            intersects.push({
                distance: raycaster.ray.origin.distanceTo(worldPoint),
                point: worldPoint,
                uv: new THREE.Vector2(u, 0.5),
                object: this,
            })
        }
    }

    /**
     * Map native-t back to arc-length u. Used by raycast() to convert the
     * result of its closest-point search into the public parameterization.
     */
    #nativeTToArcLengthU(t) {
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
     * Get a world-space point at arc-length fraction u along the node.
     *
     * @param {number} u - Arc-length fraction in [0, 1]. u=0 is the first
     *                     control point, u=1 the last, u=0.5 is the midpoint
     *                     measured along the curve (NOT the midpoint of the
     *                     spline's native parameterization).
     * @param {string} [space] - 'world' to return in world space, otherwise local
     * @returns {THREE.Vector3}
     */
    getPoint(u, space) {
        const nativeT = this.#arcLengthUToNativeT(u)
        const point = this.userData.spline.getPoint(nativeT)
        point.z = this.userData.zOffset || 0
        return space === 'world' ? this.localToWorld(point) : point
    }

    /**
     * Recover the arc-length parameter u from a raycast intersection.
     * The custom raycast sets uv.x to the arc-length u.
     *
     * @param {Object} intersection - Three.js raycast intersection
     * @returns {Object} { t, nodeName, ...intersection } where t is arc-length u
     */
    static getParameter(intersection) {
        const { object, uv } = intersection
        const t = uv ? uv.x : 0
        const { nodeName } = object.userData
        return { t, nodeName, ...intersection }
    }

    /**
     * Find a RibbonLine by node name in a mesh group.
     */
    static getLine(nodeName, nodeMeshGroup) {
        return nodeMeshGroup.children.find(child => child.userData.nodeName === nodeName)
    }
}

export default RibbonLine
