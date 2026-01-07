import Look from "./look.js"
import eventBus from "../utils/eventBus.js"
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import GeometryFactory from "../geometryFactory.js"
import lineMaterialResolutionService from '../lineMaterialResolutionService.js'

class PCAChartLook extends Look {

    constructor(name, config) {
        super(name, config)
    }

    static createPCAChartLook(name, config) {
        return new PCAChartLook(name, config);
    }

    getNodeEmphasisMaterial(assembly, nodeName) {

        const cacheKey = `${this.constructor.name}:${nodeName}:assembly:${assembly}`;

        // Check if we already have this material cached
        if (this.materialCache.has(cacheKey)) {
            return this.materialCache.get(cacheKey);
        }

        const material = new LineMaterial({
            color: '#00ff00', // Temporary green color
            linewidth: Look.NODE_LINE_WIDTH,
            worldUnits: true,
            opacity: 1,
            transparent: true
        });

        // Register with resolution service for automatic resolution updates
        lineMaterialResolutionService.registerMaterial(material);

        // Cache the material
        this.materialCache.set(cacheKey, material);

        return material;
    }

    getZOffset(objectId) {

        if (objectId.startsWith('node:')) {
            // Node emphasis behavior
            const nodeName = objectId.replace('node:', '');
            const state = this.emphasisStates.get(nodeName) || 'normal';
            switch (state) {
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

    activate() {
        super.activate();

        this.deemphasizeUnsub = eventBus.subscribe('pcaChart:emphasis', data => {
            const { assembly, nodeSet, edgeSet } = data
            this.setNodeAndEdgeEmphasis(assembly.name, nodeSet, edgeSet);
        });

        this.restoreUnsub = eventBus.subscribe('pcaChart:normal', data => {
            const { nodeSet, edgeSet } = data
            this.restoreLinesandEdgesViaZOffset(nodeSet, edgeSet)
        });
    }

    deactivate() {
        super.deactivate();

        if (this.deemphasizeUnsub) {
            this.deemphasizeUnsub();
            this.deemphasizeUnsub = null;
        }

        if (this.restoreUnsub) {
            this.restoreUnsub();
            this.restoreUnsub = null;
        }
    }

}

export default PCAChartLook
