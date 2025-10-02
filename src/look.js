import * as THREE from 'three'
import lineMaterialResolutionService from "./lineMaterialResolutionService.js"
import GeometryFactory from "./geometryFactory.js"
import ParametricLine from "./parametricLine.js"
import materialService, {colorRampArrowMaterialFactory} from "./materialService.js"
import {LineMaterial} from "three/addons/lines/LineMaterial.js"
import GenomicService from "./genomicService.js"
import {getAppleCrayonColorByName} from "./utils/color/color.js"
import {prettyPrint} from "./utils/utils.js"

class Look {

    static NODE_EMPHASIS_COLOR = '#dc3545'

    static DEFAULT_NODE_COLOR = getAppleCrayonColorByName('tin', true)
    static DEFAULT_NODE_COLOR_THREE_JS = getAppleCrayonColorByName('tin')

    static DEFAULT_EDGE_COLOR_NAME = 'magnesium'

    // pixel units
    static NODE_LINE_WIDTH_PIXELS = 2*2;
    static NODE_LINE_DEEMPHASIS_WIDTH_PIXELS = 2*2;

    // world units
    static NODE_LINE_WIDTH = 16;
    static NODE_LINE_DEEMPHASIS_WIDTH = 16;

    constructor(name, config) {
        this.name = name

        this.genomicService = config.genomicService
        this.geometryManager = config.geometryManager
        this.assemblyWidget = config.assemblyWidget; // Access to assembly widget for selected assembly info

        this.behaviors = config.behaviors || {};
        this.zOffset = config.zOffset || 0;

        this.isActive = false; // Track if this look is currently active

        // Material cache to avoid creating duplicate materials
        this.materialCache = new Map();

    }

    getZOffset(objectId) {

        if (objectId.startsWith('node:')) {
            return GeometryFactory.NODE_LINE_Z_OFFSET;
        } else if (objectId.startsWith('edge:')) {
            return GeometryFactory.EDGE_LINE_Z_OFFSET;
        } else {
            console.error(`ERROR: object ID ${ objectId } is not valid.`)
            return GeometryFactory.NODE_LINE_Z_OFFSET;
        }

    }

    updateBehavior(deltaTime, scene) {
        // Base class has no animation by default
        // Subclasses override this method for specific animation behaviors
    }

    createMesh(geometry, context) {
        if (context.type === 'node') {
            return this.createNodeMesh(geometry, context);
        } else if (context.type === 'edge') {
            return this.createEdgeMesh(geometry, context);
        }

        throw new Error(`Unknown context type: ${context.type}`);
    }

    createNodeMesh(geometry, context) {

        const {nodeName} = context

        const material = this.getNodeMaterial(nodeName);

        const mesh = new ParametricLine(geometry, material);

        // Set up user data
        mesh.userData = {
            nodeName,
            geometryKey: `node:${nodeName}`,
            type: 'node',
        };

        return mesh;
    }

    getNodeMaterial(nodeName) {

        const cacheKey = Look.getCacheKey(nodeName);

        // Check if we already have this material cached
        if (this.materialCache.has(cacheKey)) {
            return this.materialCache.get(cacheKey);
        }

        const material = new LineMaterial({
            color: this.getNodeColor(nodeName),
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

    getNodeColor(nodeName) {
        return Look.DEFAULT_NODE_COLOR_THREE_JS
    }

    createEdgeMesh(geometry, context) {

        const { startNode, endNode, edgeKey } = context;

        const [ startColor, endColor ] = this.getEdgeColors(startNode, endNode, edgeKey)
        const material = this.getEdgeMaterial(startColor, endColor)

        const mesh = new THREE.Mesh(geometry, material);

        mesh.userData =
            {
                nodeNameStart: startNode,
                nodeNameEnd: endNode,
                geometryKey: edgeKey,
                type: 'edge',
            };

        return mesh;
    }

    getEdgeMaterial(startColor, endColor) {
        return colorRampArrowMaterialFactory(startColor, endColor, materialService.getTexture('arrow-white'), 1);
    }

    getEdgeColors(startNode, endNode, edgeKey) {
        const startColor = getAppleCrayonColorByName(Look.DEFAULT_EDGE_COLOR_NAME)
        const endColor = getAppleCrayonColorByName(Look.DEFAULT_EDGE_COLOR_NAME)
        return [ startColor, endColor ]
    }

    createNodeTooltipContent(nodeObject) {
        const { nodeName } = nodeObject.userData
        const { length } = this.genomicService.nodeMetadata.get(nodeName)
        const html = `<div class="look-tooltip">
            <div class="node-section">
                <table class="node-details-table">
                    <tr class="node-detail-row">
                        <td class="node-detail-label">Node:</td>
                        <td class="node-detail-value">${nodeName}</td>
                    </tr>
                    <tr class="node-detail-row">
                        <td class="node-detail-label">Length:</td>
                        <td class="node-detail-value">${ prettyPrint(length) } bp</td>
                    </tr>
                </table>
            </div>
        </div>`

        return html
    }

    /**
     * Called when this look becomes active
     * Subclasses should override to enable event subscriptions
     */
    activate() {
        this.isActive = true;
        console.log(`${this.constructor.name} is now active`)
    }

    /**
     * Called when this look becomes inactive
     * Subclasses should override to disable event subscriptions
     */
    deactivate() {
        this.isActive = false;
    }

    dispose() {

        this.deactivate(); // Ensure we unsubscribe before disposing

        // Unregister all cached materials from the resolution service
        for (const material of this.materialCache.values()) {
            lineMaterialResolutionService.unregisterMaterial(material);
        }

        // Clear the material cache
        console.log(`${ this.constructor.name } dispose.  material cache pre ${ this.constructor.size }`)
        this.materialCache.clear()
        console.log(`${ this.constructor.name } dispose.  material cache post ${ this.constructor.size }`)
    }

    static getCacheKey(nodeName) {
        return `${this.constructor.name}:${nodeName}:normal`;
    }

}

export default Look;
