import * as THREE from 'three';
import Look from './look.ts';
import materialService from '../materialService.js';

/**
 * Parameter-binding events (the Look's "shader uniforms" — inputs that drive
 * its appearance while active). Subscribed in `activate()`, drained in
 * `Look.deactivate()`.
 *
 *   assembly:emphasis   — emphasize a set of nodes for a given assembly
 *                         (from AssemblyWidget). Payload: { assembly, nodeSet,
 *                         deemphasisColor }.
 *   assembly:normal     — restore a set of nodes to normal (from AssemblyWidget).
 *                         Payload: { nodeSet }.
 *   pclaiWidget:emphasis  — emphasize a set of nodes for a PCLAI coordinate key
 *                         (from PCLAIWidget). nodeSet = the haplotype's placed
 *                         nodes; absentNodeSet = the rest of its subgraph;
 *                         everything else is de-emphasized. Payload:
 *                         { assembly, nodeSet, absentNodeSet, emphasisColor,
 *                         deemphasisColor, absenceColor }.
 *   pclaiWidget:normal    — restore a set of nodes to normal (from PCLAIWidget).
 *                         Payload: { nodeSet }.
 */
class NodeEmphasisLook extends Look {

    constructor(name: string, config: any) {
        super(name, config);
    }

    static createNodeEmphasisLook(name: string, config: any): NodeEmphasisLook {
        return new NodeEmphasisLook(name, config);
    }

    activate(activeScene: THREE.Scene): void {
        super.activate(activeScene);

        this.subscribe('assembly:emphasis', data => {
            const { assembly, nodeSet, offWalkNodeSet, emphasisColor, deemphasisColor, offWalkColor } = data
            this.setNodeEmphasis(assembly.name, nodeSet, emphasisColor, undefined, deemphasisColor, undefined, offWalkNodeSet, offWalkColor);
        });

        this.subscribe('assembly:normal', data => {
            this.restoreNodes(data.nodeSet)
        });

        this.subscribe('pclaiWidget:emphasis', data => {
            const { assembly, nodeSet, absentNodeSet, emphasisColor, deemphasisColor, absenceColor } = data
            this.setNodeEmphasis(assembly.name, nodeSet, emphasisColor, absentNodeSet, deemphasisColor, absenceColor);
        });

        this.subscribe('pclaiWidget:normal', data => {
            this.restoreNodes(data.nodeSet)
        });
    }

    dispose(): void {

        super.dispose()

        // Dispose of MaterialService cached materials
        materialService.dispose();

        this.emphasisStates.clear();
    }
}

export default NodeEmphasisLook;
