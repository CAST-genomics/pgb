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

    /**
     * Activate this look - subscribe to events
     */
    activate() {
        super.activate();

        // Assembly Viz Events
        this.deemphasizeAssemblyUnsub = eventBus.subscribe('assembly:emphasis', data => {
            const { assembly, nodeSet, deemphasisColor } = data
            this.setNodeEmphasis(assembly.name, nodeSet, Look.NODE_EMPHASIS_COLOR, undefined, deemphasisColor);
        });

        this.restoreAssemblyUnsub = eventBus.subscribe('assembly:normal', data => {
            const { nodeSet } = data
            this.restoreNodes(nodeSet)
        });

        // PCA Widget Events
        this.pcaWidgetAbsenceUnsub = eventBus.subscribe('pcaWidget:absence', data => {
            const { absentNodeSet } = data
            this.setNodeAbsence(absentNodeSet);
        });

        this.deemphasizePCAWidgetUnsub = eventBus.subscribe('pcaWidget:emphasis', data => {
            const { assembly, nodeSet, absentNodeSet, deemphasisColor } = data
            const color = pclaiCoordinateService.getNodeColorMapForCoordinateKey(assembly.name)
            this.setNodeEmphasis(assembly.name, nodeSet, color, absentNodeSet, deemphasisColor);
        });

        this.restorePCAWidgetUnsub = eventBus.subscribe('pcaWidget:normal', data => {
            const { nodeSet } = data
            this.restoreNodes(nodeSet)
        });

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

        if (this.pcaWidgetAbsenceUnsub) {
            this.pcaWidgetAbsenceUnsub();
            this.pcaWidgetAbsenceUnsub = null;
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
