import * as THREE from "three"

class LineFactory {

    // Adaptive tessellation parameters
    static FLATNESS_TOLERANCE = 0.5;  // world units — max deviation before subdividing
    static MIN_DEPTH = 3;             // minimum recursion depth (at least 8 segments)
    static MAX_DEPTH = 8;             // maximum recursion depth (at most 256 segments)

    /**
     * Create ribbon geometry for a node — a triangle strip mesh with clean 0->1 UV parameterization.
     * Uses adaptive tessellation: more vertices in curved regions, fewer in straight ones.
     *
     * @param {THREE.CatmullRomCurve3} spline - The node's spline
     * @param {number} zOffset - Z depth for layering
     * @returns {THREE.BufferGeometry} Triangle strip geometry with attributes:
     *   position (vec3), normal2d (vec2), uParam (float), side (float), uv (vec2)
     */
    static createNodeRibbonGeometry(spline, zOffset = 0) {

        // Adaptively sample the spline
        const samples = LineFactory.#adaptiveSample(spline)

        const vertexCount = samples.length * 2
        const positions = new Float32Array(vertexCount * 3)
        const normal2ds = new Float32Array(vertexCount * 2)
        const uParams = new Float32Array(vertexCount)
        const sides = new Float32Array(vertexCount)
        const uvs = new Float32Array(vertexCount * 2)

        const N = samples.length

        for (let i = 0; i < N; i++) {
            const { t, point } = samples[i]

            // Compute tangent via central difference
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

            // Normalize tangent
            const len = Math.sqrt(tx * tx + ty * ty)
            if (len > 0) { tx /= len; ty /= len }

            // 2D perpendicular (rotate tangent 90 degrees)
            const nx = -ty
            const ny = tx

            // Top vertex (side = +1) at index 2*i
            const topIdx = 2 * i
            positions[topIdx * 3    ] = point.x
            positions[topIdx * 3 + 1] = point.y
            positions[topIdx * 3 + 2] = zOffset
            normal2ds[topIdx * 2    ] = nx
            normal2ds[topIdx * 2 + 1] = ny
            uParams[topIdx] = t
            sides[topIdx] = 1.0
            uvs[topIdx * 2    ] = t
            uvs[topIdx * 2 + 1] = 1.0

            // Bottom vertex (side = -1) at index 2*i + 1
            const botIdx = 2 * i + 1
            positions[botIdx * 3    ] = point.x
            positions[botIdx * 3 + 1] = point.y
            positions[botIdx * 3 + 2] = zOffset
            normal2ds[botIdx * 2    ] = nx
            normal2ds[botIdx * 2 + 1] = ny
            uParams[botIdx] = t
            sides[botIdx] = -1.0
            uvs[botIdx * 2    ] = t
            uvs[botIdx * 2 + 1] = 0.0
        }

        // Build index buffer: N-1 quads, 2 triangles each
        const indices = []
        for (let i = 0; i < N - 1; i++) {
            const tl = 2 * i       // top-left
            const bl = 2 * i + 1   // bottom-left
            const tr = 2 * (i + 1) // top-right
            const br = 2 * (i + 1) + 1 // bottom-right
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

        // Store arc length for texture aspect ratio computation
        geometry.userData.totalArcLength = spline.getLength()
        geometry.userData.sampleCount = N

        return geometry
    }

    /**
     * Adaptively sample a spline, placing more points in curved regions.
     * Returns a sorted array of { t, point } samples with t in [0, 1].
     */
    static #adaptiveSample(spline) {
        const samples = []

        const pStart = spline.getPoint(0)
        const pEnd = spline.getPoint(1)

        samples.push({ t: 0, point: pStart })
        LineFactory.#subdivide(spline, 0, 1, pStart, pEnd, samples, 0)
        samples.push({ t: 1, point: pEnd })

        // Sort by t (subdivision may add in arbitrary order)
        samples.sort((a, b) => a.t - b.t)

        return samples
    }

    /**
     * Recursive midpoint subdivision with flatness test.
     */
    static #subdivide(spline, tStart, tEnd, pStart, pEnd, samples, depth) {
        const tMid = (tStart + tEnd) / 2
        const pMid = spline.getPoint(tMid)

        const deviation = LineFactory.#pointToLineDistance(pMid, pStart, pEnd)
        const needsSubdivision = deviation > LineFactory.FLATNESS_TOLERANCE || depth < LineFactory.MIN_DEPTH

        if (needsSubdivision && depth < LineFactory.MAX_DEPTH) {
            LineFactory.#subdivide(spline, tStart, tMid, pStart, pMid, samples, depth + 1)
            samples.push({ t: tMid, point: pMid })
            LineFactory.#subdivide(spline, tMid, tEnd, pMid, pEnd, samples, depth + 1)
        }
    }

    /**
     * Distance from point P to the line segment from A to B (2D, ignoring z).
     */
    static #pointToLineDistance(P, A, B) {
        const abx = B.x - A.x
        const aby = B.y - A.y
        const apx = P.x - A.x
        const apy = P.y - A.y
        const abLenSq = abx * abx + aby * aby

        if (abLenSq === 0) {
            return Math.sqrt(apx * apx + apy * apy)
        }

        // Cross product magnitude / length of AB = perpendicular distance
        const cross = Math.abs(abx * apy - aby * apx)
        return cross / Math.sqrt(abLenSq)
    }
    /**
     * Create edge rectangle geometry without material (for texture mapping)
     */
    static createEdgeRectGeometry(startXYZ, endXYZ) {
        // Calculate direction vector and length
        const direction = new THREE.Vector3().subVectors(endXYZ, startXYZ);
        direction.normalize();

        // Calculate perpendicular vector (90 degrees rotation in XY plane)
        const perpendicular = new THREE.Vector3(-direction.y, direction.x, 0);

        // Calculate the four corners of the rectangle
        const halfWidth = 16; // Fixed width of 16 units (half on each side)
        const corners = [
            new THREE.Vector3().copy(startXYZ).addScaledVector(perpendicular, halfWidth),
            new THREE.Vector3().copy(startXYZ).addScaledVector(perpendicular, -halfWidth),
            new THREE.Vector3().copy(endXYZ).addScaledVector(perpendicular, -halfWidth),
            new THREE.Vector3().copy(endXYZ).addScaledVector(perpendicular, halfWidth)
        ];

        const vertices = [];
        const uvs = [];

        // Add vertices and corresponding UVs
        // UV coordinates for a rectangle that will stretch the texture along the length
        uvs.push(0, 0); // bottom left
        vertices.push(corners[0].x, corners[0].y, corners[0].z);

        uvs.push(0, 1); // top left
        vertices.push(corners[1].x, corners[1].y, corners[1].z);

        uvs.push(1, 1); // top right
        vertices.push(corners[2].x, corners[2].y, corners[2].z);

        uvs.push(1, 0); // bottom right
        vertices.push(corners[3].x, corners[3].y, corners[3].z);

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

        // Two triangles to form the rectangle
        geometry.setIndex([0, 1, 2, 0, 2, 3]);

        return geometry;
    }
}

export default LineFactory;
