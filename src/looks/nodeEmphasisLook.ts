import Look from './look.ts';
import materialService from '../materialService.js';
import GeometryFactory from "../geometryFactory.js"
import {pclaiCoordinateService} from "../widgets/pclaiCoordinateService.js"

class NodeEmphasisLook extends Look {

    constructor(name: string, config: any) {
        super(name, config);
    }

    static createNodeEmphasisLook(name: string, config: any): NodeEmphasisLook {
        return new NodeEmphasisLook(name, config);
    }

    getZOffset(objectId: string): number {

        if (objectId.startsWith('node:')) {
            const nodeName = objectId.replace('node:', '');
            const state = this.emphasisStates.get(nodeName) || 'normal';
            switch (state) {
                case 'absent':
                    return GeometryFactory.NODE_LINE_DEEMPHASIS_Z_OFFSET;
                case 'deemphasized':
                    return GeometryFactory.NODE_LINE_DEEMPHASIS_Z_OFFSET;
                case 'emphasized':
                    return GeometryFactory.NODE_LINE_Z_OFFSET;
                case 'normal':
                    return GeometryFactory.NODE_LINE_Z_OFFSET;
                default:
                    console.error(`getZOffset: object ${ objectId } has invalid emphasis state`);
                    return GeometryFactory.NODE_LINE_Z_OFFSET;
            }
        }

        // Fallback to parent implementation
        return super.getZOffset(objectId);
    }

    activate(activeScene: any): void {
        super.activate(activeScene);

        this.subscribe('assembly:emphasis', data => {
            const { assembly, nodeSet, deemphasisColor } = data
            this.setNodeEmphasis(assembly.name, nodeSet, Look.NODE_EMPHASIS_COLOR, undefined, deemphasisColor);
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
