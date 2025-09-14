import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import * as THREE from "three"

/**
 * ParametricLine class that extends Line2
 * Constructed in the same way as Line2
 */
class ParametricLine extends Line2 {
    constructor(geometry, material, count) {
        super(geometry, material, count);
    }

    getPoint(t, space){

        const arc = this.userData.arcLengthTable

        const tt = THREE.MathUtils.clamp(t, 0, 1);
        const s = tt * arc.total;

        const out = new THREE.Vector3()

        // handle exact end
        if (s >= arc.total) {
            const B = new THREE.Vector3().fromBufferAttribute(this.geometry.attributes.instanceEnd, arc.segLen.length - 1);
            out.copy(B);
            return space === 'world' ? this.localToWorld(out) : out;
        }

        // binary search cum[] to locate segment
        const cum = arc.cum;
        let lo = 0, hi = cum.length - 1;
        while (lo + 1 < hi) {
            const mid = (lo + hi) >> 1;
            (cum[mid] <= s) ? (lo = mid) : (hi = mid);
        }
        const i = lo; // segment index with cum[i] <= s < cum[i+1]

        const starts = this.geometry.attributes.instanceStart;
        const ends   = this.geometry.attributes.instanceEnd;
        const A = new THREE.Vector3().fromBufferAttribute(starts, i);
        const B = new THREE.Vector3().fromBufferAttribute(ends,   i);

        const L = arc.segLen[i];
        const u = L > 0 ? (s - cum[i]) / L : 0; // guard zero-length
        out.copy(A).lerp(B, THREE.MathUtils.clamp(u, 0, 1));
        return space === 'world' ? this.localToWorld(out) : out;

    }

    static getParameter(intersection){

        const { faceIndex, point, object:line } = intersection

        const P = point.clone();
        line.worldToLocal(P);

        const A = new THREE.Vector3().fromBufferAttribute(line.geometry.attributes.instanceStart, faceIndex);
        const B = new THREE.Vector3().fromBufferAttribute(line.geometry.attributes.instanceEnd,   faceIndex);

        const AB = B.clone().sub(A);

        const u = AB.lengthSq() > 0 ? THREE.MathUtils.clamp( AB.dot(P.clone().sub(A)) / AB.lengthSq(), 0, 1 ) : 0;

        const { cum, segLen, total } = line.userData.arcLengthTable

        const s = cum[ faceIndex ] + u * segLen[ faceIndex ];

        const t = total > 0 ? s / total : 0;

        const { userData } = line;
        const { nodeName } = userData;

        return { t, nodeName, line }

    }

    static getLine(nodeName, nodeMeshGroup){
        return nodeMeshGroup.children.find(child => child.userData.nodeName === nodeName)
    }


}

export default ParametricLine;
