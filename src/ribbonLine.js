import * as THREE from 'three'

const _inverseMatrix = new THREE.Matrix4()
const _ray = new THREE.Ray()
const _splinePoint = new THREE.Vector3()

/**
 * RibbonLine — a THREE.Mesh subclass for ribbon-based node rendering.
 * Provides the same parametric interface as ParametricLine (getPoint, getParameter)
 * so it integrates seamlessly with the raycast service and look system.
 *
 * Overrides raycast() because the GPU-side geometry is expanded by halfWidth
 * in the vertex shader, but the CPU-side positions are centerline-only.
 * The custom raycast tests distance from the ray to the spline centerline
 * against the current halfWidth.
 */
class RibbonLine extends THREE.Mesh {

    constructor(geometry, material) {
        super(geometry, material)
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
            // Build intersection result compatible with Three.js and our raycast service
            spline.getPoint(bestT, _splinePoint)
            _splinePoint.z = this.userData.zOffset || 0

            const worldPoint = _splinePoint.clone().applyMatrix4(this.matrixWorld)

            intersects.push({
                distance: raycaster.ray.origin.distanceTo(worldPoint),
                point: worldPoint,
                uv: new THREE.Vector2(bestT, 0.5),
                object: this,
            })
        }
    }

    /**
     * Get a world-space point at parameter t along the node.
     *
     * @param {number} t - Parameter in [0, 1]
     * @param {string} [space] - 'world' to return in world space, otherwise local
     * @returns {THREE.Vector3}
     */
    getPoint(t, space) {
        const spline = this.userData.spline
        const tt = THREE.MathUtils.clamp(t, 0, 1)
        const point = spline.getPoint(tt)
        point.z = this.userData.zOffset || 0
        return space === 'world' ? this.localToWorld(point) : point
    }

    /**
     * Recover the arc-length parameter t from a raycast intersection.
     * The custom raycast sets uv.x to the spline t-parameter.
     *
     * @param {Object} intersection - Three.js raycast intersection
     * @returns {Object} { t, nodeName, ...intersection }
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
