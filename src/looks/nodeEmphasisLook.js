import Look from './look.js';
import eventBus from "../utils/eventBus.js"
import materialService from '../materialService.js';
import GeometryFactory from "../geometryFactory.js"
import {pclaiCoordinateService} from "../widgets/pclaiCoordinateService.js"

class NodeEmphasisLook extends Look {

    constructor(name, config) {
        super(name, config);

        this.sceneManager = config.sceneManager
    }

    static createNodeEmphasisLook(name, config) {
        return new NodeEmphasisLook(name, config);
    }

    getZOffset(objectId) {

        if (objectId.startsWith('node:')) {
            // Node emphasis behavior
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
                    return GeometryFactory.EDGE_LINE_Z_OFFSET;
            }
        } else if (objectId.startsWith('edge:')) {

            const state = this.emphasisStates.get(objectId) || 'normal';
            switch (state) {
                case 'deemphasized':
                    return GeometryFactory.EDGE_LINE_Z_OFFSET - 4;
                case 'emphasized':
                    return GeometryFactory.EDGE_LINE_Z_OFFSET;
                case 'normal':
                    return GeometryFactory.EDGE_LINE_Z_OFFSET;
                default:
                    console.error(`getZOffset: object ${ objectId } has invalid emphasis state`);
                    return GeometryFactory.EDGE_LINE_Z_OFFSET;
            }
        }

        // Fallback to parent implementation
        return super.getZOffset(objectId);
    }

    /**
     * Activate this look - subscribe to events
     */
    activate() {
        super.activate();

        // Assembly Viz Events
        this.deemphasizeAssemblyUnsub = eventBus.subscribe('assembly:emphasis', data => {
            const { assembly, nodeSet, edgeSet } = data
            this.setNodeAndEdgeEmphasis(assembly.name, nodeSet, edgeSet, Look.NODE_EMPHASIS_COLOR);
        });

        this.restoreAssemblyUnsub = eventBus.subscribe('assembly:normal', data => {
            const { nodeSet, edgeSet } = data
            this.restoreLinesandEdgesViaZOffset(nodeSet, edgeSet)
        });

        // PCA Widget Events
        this.deemphasizePCAWidgetUnsub = eventBus.subscribe('pcaWidget:emphasis', data => {
            const { assembly, nodeSet, edgeSet, absentNodeSet } = data
            const color = pclaiCoordinateService.getNodeColorMapForCoordinateKey(assembly.name)
            this.setNodeAndEdgeEmphasis(assembly.name, nodeSet, edgeSet, color, absentNodeSet);
        });

        this.restorePCAWidgetUnsub = eventBus.subscribe('pcaWidget:normal', data => {
            const { nodeSet, edgeSet } = data
            this.restoreLinesandEdgesViaZOffset(nodeSet, edgeSet)
        });





        // PCA Chart Events
        // this.deemphasizePCAChartUnsub = eventBus.subscribe('pcaChart:emphasis', data => {
        //     const { assembly, nodeSet, edgeSet } = data
        //
        //     const color = (0 === pclaiCoordinateService.aveRgb.size) ? Look.DEFAULT_NODE_COLOR : pclaiCoordinateService.aveRgb
        //     this.setNodeAndEdgeEmphasis(assembly.name, nodeSet, edgeSet, color);
        // });
        //
        // this.restorePCAChartUnsub = eventBus.subscribe('pcaChart:normal', data => {
        //     const { nodeSet, edgeSet } = data
        //     this.restoreLinesandEdgesViaZOffset(nodeSet, edgeSet)
        // });


    }

    /**
     * Deactivate this look - unsubscribe from events
     */
    deactivate() {
        super.deactivate();

        if (this.deemphasizeAssemblyUnsub) {
            this.deemphasizeAssemblyUnsub();
            this.deemphasizeAssemblyUnsub = null;
        }

        if (this.restoreAssemblyUnsub) {
            this.restoreAssemblyUnsub();
            this.restoreAssemblyUnsub = null;
        }

        if (this.deemphasizePCAChartUnsub) {
            this.deemphasizePCAChartUnsub();
            this.deemphasizePCAChartUnsub = null;
        }

        if (this.restorePCAChartUnsub) {
            this.restorePCAChartUnsub();
            this.restorePCAChartUnsub = null;
        }

        if (this.deemphasizePCAWidgetUnsub) {
            this.deemphasizePCAWidgetUnsub();
            this.deemphasizePCAWidgetUnsub = null;
        }

        if (this.restorePCAWidgetUnsub) {
            this.restorePCAWidgetUnsub();
            this.restorePCAWidgetUnsub = null;
        }
    }

    dispose() {

        super.dispose()

        // Dispose of MaterialService cached materials
        materialService.dispose();

        this.emphasisStates.clear();
    }
}

export default NodeEmphasisLook;
