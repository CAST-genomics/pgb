import * as THREE from "three"

/**
 * Tuning for skip arcs — the curves drawn between two spine nodes that the spine's
 * own topology does not place next to each other. Not user facing: tweak the numbers
 * here and reload.
 *
 * Height is driven by the chord *and* by how many spine nodes the edge jumps, because
 * in a bp-scaled linear layout the chord alone is a poor proxy for significance: a skip
 * over three tiny nodes spans well under a unit of world space, while a skip over one
 * long node spans hundreds.
 *
 * SPLAY is what keeps those sub-unit skips visible. The cubic's control points are
 * pushed *outward* past their endpoints whenever the chord is narrower than MIN_SPAN,
 * which balloons the curve into a loop with real horizontal extent; the push fades to
 * zero as the chord widens, so a long skip is an ordinary arch and there is no
 * discontinuity in between. A loop therefore overhangs its own endpoints — deliberate,
 * and the price of drawing a 0.8-unit skip at all.
 *
 * MIN_HEIGHT is not free to shrink: a ribbon HALF_WIDTH wide folds in on itself
 * wherever the curve's radius of curvature falls below HALF_WIDTH, and it is the loop's
 * shoulders that get tight first. At 100 the tightest radius is ~30 — comfortable. Drop
 * this much below that and thin the ribbon to match, or the arcs crumple.
 */
export const ARC_PARAMS = {
    HEIGHT_RATIO:            0.15,  // height contribution per unit of chord length
    HEIGHT_PER_SKIPPED_NODE: 20,    // height contribution per spine node jumped
    MIN_HEIGHT:              100,
    MAX_HEIGHT:              200,
    MIN_SPAN:                96,    // chord below which the curve starts splaying outward
    SPLAY_GAIN:              1.25,
    SEGMENTS:                32,
    HALF_WIDTH:              16,    // matches the straight edge ribbon
    START_SIDE:              1,     // +1 above the spine, -1 below; alternates per arc
};

/**
 * A cubic Bezier's apex sits at three quarters of its control-point lift, not all of
 * it, so the lift is divided by this to make MIN_HEIGHT/MAX_HEIGHT mean the height the
 * arc actually reaches. Do not "simplify" this away.
 */
const CUBIC_APEX_FRACTION = 0.75;

class LineFactory {

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

    /**
     * The curve a skip arc follows: a cubic Bezier lifted off the spine, with its
     * control points splayed outward when the chord is too short to be seen otherwise.
     *
     * The lift is along world Y rather than the chord's perpendicular so that `side`
     * means the same thing for every arc. A backwards skip — one whose end node sits
     * earlier in the spine than its start node — would otherwise flip to the opposite
     * side of the spine purely because its direction vector reversed.
     *
     * @param {THREE.Vector3} startXYZ
     * @param {THREE.Vector3} endXYZ
     * @param {number} skippedNodeCount - spine nodes the edge jumps over
     * @param {number} side - +1 above the spine, -1 below
     * @returns {THREE.CubicBezierCurve3}
     */
    static createSkipArcCurve(startXYZ, endXYZ, skippedNodeCount, side) {
        const {
            HEIGHT_RATIO, HEIGHT_PER_SKIPPED_NODE, MIN_HEIGHT, MAX_HEIGHT,
            MIN_SPAN, SPLAY_GAIN,
        } = ARC_PARAMS;

        const chord = Math.hypot(endXYZ.x - startXYZ.x, endXYZ.y - startXYZ.y);

        const height = Math.min(
            MAX_HEIGHT,
            Math.max(MIN_HEIGHT, HEIGHT_RATIO * chord + HEIGHT_PER_SKIPPED_NODE * skippedNodeCount)
        );

        const splay = SPLAY_GAIN * Math.max(0, MIN_SPAN - chord);

        // Coincident endpoints leave no chord to splay along; fall back to +X so the
        // curve is still a loop rather than a zero-area sliver.
        const along = new THREE.Vector3(endXYZ.x - startXYZ.x, endXYZ.y - startXYZ.y, 0);
        if (along.lengthSq() === 0) {
            along.set(1, 0, 0);
        }
        along.normalize();

        const lift = new THREE.Vector3(0, side * height / CUBIC_APEX_FRACTION, 0);

        const control1 = startXYZ.clone().addScaledVector(along, -splay).add(lift);
        const control2 = endXYZ.clone().addScaledVector(along, splay).add(lift);

        return new THREE.CubicBezierCurve3(startXYZ.clone(), control1, control2, endXYZ.clone());
    }

    /**
     * Create skip arc geometry: the same textured ribbon as a straight edge, swept
     * along a curve instead of a straight chord. UVs run 0..1 from start to end along
     * the arc, so the edge texture behaves exactly as it does on a straight edge.
     */
    static createSkipArcGeometry(startXYZ, endXYZ, skippedNodeCount, side) {
        const { SEGMENTS, HALF_WIDTH } = ARC_PARAMS;

        const curve = LineFactory.createSkipArcCurve(startXYZ, endXYZ, skippedNodeCount, side);

        // Spaced rather than uniformly parameterized, so the texture advances evenly
        // along the arc instead of bunching where the curve turns.
        const points = curve.getSpacedPoints(SEGMENTS);

        const vertices = [];
        const uvs = [];

        for (let i = 0; i < points.length; i++) {
            const previous = points[Math.max(0, i - 1)];
            const next = points[Math.min(points.length - 1, i + 1)];

            const tangent = new THREE.Vector3().subVectors(next, previous);
            const perpendicular = new THREE.Vector3(-tangent.y, tangent.x, 0);
            if (perpendicular.lengthSq() === 0) {
                perpendicular.set(0, 1, 0);
            }
            perpendicular.normalize();

            const u = i / SEGMENTS;
            const point = points[i];

            const outer = point.clone().addScaledVector(perpendicular, HALF_WIDTH);
            const inner = point.clone().addScaledVector(perpendicular, -HALF_WIDTH);

            // Same vertex ordering as createEdgeRectGeometry: +perpendicular at v=0.
            vertices.push(outer.x, outer.y, outer.z);
            uvs.push(u, 0);

            vertices.push(inner.x, inner.y, inner.z);
            uvs.push(u, 1);
        }

        const indices = [];
        for (let i = 0; i < points.length - 1; i++) {
            const a = i * 2;       // outer, this sample
            const b = i * 2 + 1;   // inner, this sample
            const c = i * 2 + 3;   // inner, next sample
            const d = i * 2 + 2;   // outer, next sample
            indices.push(a, b, c, a, c, d);
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setIndex(indices);

        return geometry;
    }
}

export default LineFactory;
