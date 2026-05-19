import Look from './look.ts';
import materialService from '../materialService.js';
import {pclaiCoordinateService} from "../widgets/pclaiCoordinateService.js"

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
 *   pcaWidget:emphasis  — emphasize a set of nodes for a PCA coordinate key,
 *                         with optional absent set (from PCAWidget). Payload:
 *                         { assembly, nodeSet, absentNodeSet, deemphasisColor }.
 *   pcaWidget:absence   — mark a set of nodes absent with no emphasis (from
 *                         PCAWidget, widget open but no coordinate selected).
 *                         Payload: { absentNodeSet }.
 *   pcaWidget:normal    — restore a set of nodes to normal (from PCAWidget).
 *                         Payload: { nodeSet }.
 */
class NodeEmphasisLook extends Look {

    constructor(name: string, config: any) {
        super(name, config);
    }

    static createNodeEmphasisLook(name: string, config: any): NodeEmphasisLook {
        return new NodeEmphasisLook(name, config);
    }

    activate(activeScene: any): void {
        super.activate(activeScene);

        this.subscribe('assembly:emphasis', data => {
            const { assembly, nodeSet, emphasisColor, deemphasisColor } = data
            this.setNodeEmphasis(assembly.name, nodeSet, emphasisColor, undefined, deemphasisColor);
        });

        this.subscribe('assembly:normal', data => {
            this.restoreNodes(data.nodeSet)
        });

        this.subscribe('pcaWidget:absence', data => {
            this.setNodeEmphasis(undefined, new Set(), undefined, data.absentNodeSet, undefined);
        });

        this.subscribe('pcaWidget:emphasis', data => {
            const { assembly, nodeSet, absentNodeSet, deemphasisColor } = data
            const color = pclaiCoordinateService.getNodeColorMapForCoordinateKey(assembly.name)
            this.setNodeEmphasis(assembly.name, nodeSet, color, absentNodeSet, deemphasisColor);
        });

        this.subscribe('pcaWidget:normal', data => {
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
