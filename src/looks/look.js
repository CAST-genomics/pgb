import * as THREE from 'three'
import lineMaterialResolutionService from "../lineMaterialResolutionService.js"
import GeometryFactory from "../geometryFactory.js"
import RibbonLine from "../ribbonLine.js"
import RibbonMaterialFactory from "../ribbonMaterialFactory.js"
import materialService, {colorRampArrowMaterialFactory} from "../materialService.js"
import {getAppleCrayonColorByName} from "../utils/color/color.js"
import {prettyPrint} from "../utils/utils.js"

class Look {

    static NODE_EMPHASIS_COLOR = '#c0311a'

    static NODE_DEEMPHASIS_COLOR = '#afafaf'

    static NODE_ABSENCE_COLOR = '#7a92a3'
    // static NODE_ABSENCE_COLOR = '#c8cdd3'
    // static NODE_ABSENCE_COLOR = '#ff0289'

    static DEFAULT_NODE_COLOR = '#6e6e6e'
    static DEFAULT_NODE_COLOR_THREE_JS = new THREE.Color('#6e6e6e')

    static DEFAULT_EDGE_COLOR_NAME = 'magnesium'

    // Apparent line width in screen pixels (constant regardless of zoom).
    // Converted to world units per frame by lineMaterialResolutionService.
    static NODE_LINE_WIDTH_PIXELS = 2*2;

    constructor(name, config) {
        this.name = name

        this.genomicService = config.genomicService
        this.geometryManager = config.geometryManager
        this.assemblyWidget = config.assemblyWidget; // Access to assembly widget for selected assembly info
        this.sceneManager = config.sceneManager; // Optional, may be undefined

        this.zOffset = config.zOffset || 0;

        this.isActive = false; // Track if this look is currently active

        // Material cache to avoid creating duplicate materials
        this.materialCache = new Map();

        // Emphasis state tracking
        this.emphasisStates = new Map();

        // Event subscription cleanup
        this.deemphasizeUnsub = null;
        this.restoreUnsub = null;

    }

    /**
     * Gets the Z-offset for a given object based on its ID.
     * Nodes and edges are rendered at different Z depths to control visual layering.
     *
     * @param {string} objectId - The object identifier, must start with 'node:' or 'edge:'
     * @returns {number} The Z-offset value for the object type
     */
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

    /**
     * Creates a Three.js mesh from geometry and context information.
     * Routes to the appropriate creation method based on context type.
     *
     * @param {THREE.BufferGeometry} geometry - The geometry to use for the mesh
     * @param {Object} context - Context object containing type and metadata
     * @param {string} context.type - Either 'node' or 'edge'
     * @returns {THREE.Mesh|RibbonLine} The created mesh object
     * @throws {Error} If context.type is not 'node' or 'edge'
     */
    createMesh(geometry, context) {
        if (context.type === 'node') {
            return this.createNodeMesh(geometry, context);
        } else if (context.type === 'edge') {
            return this.createEdgeMesh(geometry, context);
        }

        throw new Error(`Unknown context type: ${context.type}`);
    }

    /**
     * Creates a ribbon mesh for a node.
     *
     * @param {THREE.BufferGeometry} geometry - Ribbon geometry from LineFactory.createNodeRibbonGeometry
     * @param {Object} context - Context object
     * @param {string} context.nodeName - Node name
     * @param {THREE.CatmullRomCurve3} context.spline - The node's spline for getPoint()
     * @returns {RibbonLine}
     */
    createNodeMesh(geometry, context) {

        const { nodeName, spline } = context

        const material = this.getNodeRibbonMaterial(nodeName)

        const mesh = new RibbonLine(geometry, material)

        mesh.userData = {
            nodeName,
            geometryKey: `node:${nodeName}`,
            type: 'node',
            spline,
            zOffset: GeometryFactory.NODE_LINE_Z_OFFSET,
        }

        return mesh
    }

    /**
     * Gets or creates a ribbon ShaderMaterial for a node's default state.
     *
     * @param {string} nodeName - The node name
     * @returns {THREE.ShaderMaterial}
     */
    getNodeRibbonMaterial(nodeName) {
        const cacheKey = `ribbon:${nodeName}:normal`

        if (this.materialCache.has(cacheKey)) {
            return this.materialCache.get(cacheKey)
        }

        const material = RibbonMaterialFactory.createMaterial(Look.DEFAULT_NODE_COLOR_THREE_JS)
        lineMaterialResolutionService.registerRibbonMaterial(material)
        this.materialCache.set(cacheKey, material)

        return material
    }

    /**
     * Gets or creates a ribbon ShaderMaterial for a node's emphasized state.
     *
     * @param {string} assemblyName - Assembly name
     * @param {string} nodeName - Node name
     * @param {THREE.Color|Map<string, THREE.Color>} nodeColor - Emphasis color(s)
     * @returns {THREE.ShaderMaterial}
     */
    getNodeRibbonEmphasisMaterial(assemblyName, nodeName, nodeColor) {
        const cacheKey = `ribbon:${nodeName}:assembly:${assemblyName}`

        if (this.materialCache.has(cacheKey)) {
            return this.materialCache.get(cacheKey)
        }

        let colorToUse
        if (nodeColor instanceof Map) {
            const color = nodeColor.get(nodeName)
            colorToUse = color ? color.clone() : new THREE.Color(Look.NODE_EMPHASIS_COLOR)
        } else {
            colorToUse = nodeColor instanceof THREE.Color ? nodeColor : new THREE.Color(nodeColor || Look.NODE_EMPHASIS_COLOR)
        }

        const material = RibbonMaterialFactory.createMaterial(colorToUse)
        lineMaterialResolutionService.registerRibbonMaterial(material)
        this.materialCache.set(cacheKey, material)

        return material
    }

    /**
     * Gets or creates a ribbon deemphasis material for a node.
     * @param {string} nodeName - The node name
     * @param {string|THREE.Color} [deemphasisColor] - Optional override color; defaults to NODE_DEEMPHASIS_COLOR
     */
    getNodeRibbonDeemphasisMaterial(nodeName, deemphasisColor) {
        const color = deemphasisColor || Look.NODE_DEEMPHASIS_COLOR
        const cacheKey = deemphasisColor ? `ribbon:${nodeName}:deemphasis:${color}` : `ribbon:${nodeName}:deemphasis`

        if (this.materialCache.has(cacheKey)) {
            return this.materialCache.get(cacheKey)
        }

        const material = RibbonMaterialFactory.createMaterial(color)
        lineMaterialResolutionService.registerRibbonMaterial(material)
        this.materialCache.set(cacheKey, material)

        return material
    }

    /**
     * Gets or creates a ribbon absence material for a node.
     */
    getNodeRibbonAbsenceMaterial(nodeName) {
        const cacheKey = `ribbon:${nodeName}:absence`

        if (this.materialCache.has(cacheKey)) {
            return this.materialCache.get(cacheKey)
        }

        const material = RibbonMaterialFactory.createMaterial(Look.NODE_ABSENCE_COLOR)
        lineMaterialResolutionService.registerRibbonMaterial(material)
        this.materialCache.set(cacheKey, material)

        return material
    }

    /**
     * Gets the color for a node in its normal (non-emphasized) state.
     * Subclasses can override this to provide node-specific coloring.
     *
     * @param {string} nodeName - The name/identifier of the node
     * @returns {THREE.Color} The Three.js Color object for the node
     */
    getNodeColor(nodeName) {
        return Look.DEFAULT_NODE_COLOR_THREE_JS
    }

    /**
     * Creates a mesh for an edge (connection between nodes) using the provided geometry.
     * Edges use gradient materials that transition from start to end colors.
     *
     * @param {THREE.BufferGeometry} geometry - The geometry for the edge
     * @param {Object} context - Context object containing edge information
     * @param {string} context.startNode - The name of the starting node
     * @param {string} context.endNode - The name of the ending node
     * @param {string} context.edgeKey - Unique identifier for this edge
     * @returns {THREE.Mesh} The created edge mesh with userData populated
     */
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

    /**
     * Creates a gradient material for an edge that transitions from start to end color.
     * Uses a color ramp with arrow texture for directional visualization.
     *
     * @param {THREE.Color} startColor - The color at the start of the edge
     * @param {THREE.Color} endColor - The color at the end of the edge
     * @returns {THREE.ShaderMaterial} The gradient material for the edge
     */
    getEdgeMaterial(startColor, endColor) {
        return colorRampArrowMaterialFactory(startColor, endColor, materialService.getTexture('arrow-white'), 1);
    }

    /**
     * Gets the start and end colors for an edge.
     * Subclasses can override this to provide edge-specific coloring based on nodes or edge properties.
     *
     * @param {string} startNode - The name of the starting node
     * @param {string} endNode - The name of the ending node
     * @param {string} edgeKey - Unique identifier for this edge
     * @returns {Array<THREE.Color>} Array containing [startColor, endColor]
     */
    getEdgeColors(startNode, endNode, edgeKey) {
        const startColor = getAppleCrayonColorByName(Look.DEFAULT_EDGE_COLOR_NAME)
        const endColor = getAppleCrayonColorByName(Look.DEFAULT_EDGE_COLOR_NAME)
        return [ startColor, endColor ]
    }

    /**
     * Creates HTML content for a node tooltip that appears on hover.
     * Displays node name and length information.
     *
     * @param {THREE.Object3D} nodeObject - The Three.js object representing the node
     * @returns {string} HTML string for the tooltip content
     */
    createNodeTooltipContent(nodeObject) {
        const { nodeName } = nodeObject.userData
        const { length } = this.genomicService.nodeMetadata.get(nodeName)
        const emphasisState = this.emphasisStates.get(nodeName) || 'normal'
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
                    <tr class="node-detail-row">
                        <td class="node-detail-label">State:</td>
                        <td class="node-detail-value">${emphasisState}</td>
                    </tr>
                </table>
            </div>
        </div>`

        return html
    }

    /**
     * Called when this look becomes active.
     * Sets the active flag and can be overridden by subclasses to enable
     * event subscriptions, start animations, or perform other activation logic.
     */
    activate() {
        this.isActive = true;
        console.log(`${this.constructor.name} is now active`)
    }

    /**
     * Called when this look becomes inactive.
     * Sets the active flag to false and can be overridden by subclasses to disable
     * event subscriptions, stop animations, or perform cleanup logic.
     */
    deactivate() {
        this.isActive = false;
    }

    /**
     * Disposes of all resources used by this look.
     * Deactivates the look, unregisters all materials from the resolution service,
     * and clears the material cache. Should be called when the look is no longer needed.
     */
    dispose() {

        this.deactivate(); // Ensure we unsubscribe before disposing

        // Unregister all cached materials from the resolution service
        for (const material of this.materialCache.values()) {
            lineMaterialResolutionService.unregisterMaterial(material);
        }

        // Clear the material cache
        console.log(`${ this.constructor.name } dispose.  material cache pre ${ this.materialCache.size }`)
        this.materialCache.clear()
        console.log(`${ this.constructor.name } dispose.  material cache post ${ this.materialCache.size }`)
    }

    /**
     * Applies absence to a set of nodes and restores all other nodes to normal.
     * This is the "PCA widget is open but no dot is selected" state.
     *
     * @param {Set<string>} absentNodeSet - Set of node names that lack the attribute category
     */
    setNodeAbsence(absentNodeSet) {

        this.emphasisStates.clear()

        const allNodes = this.geometryManager.geometryFactory.getNodeNameSet()
        const normalNodeSet = allNodes.difference(absentNodeSet)

        for (const nodeName of absentNodeSet) {
            this.setEmphasisState(nodeName, 'absent');
        }

        for (const nodeName of normalNodeSet) {
            this.setEmphasisState(nodeName, 'normal');
        }

        this.updateNodeEmphasis(absentNodeSet, 'absent', undefined);
        this.updateNodeEmphasis(normalNodeSet, 'normal', undefined);
        this.updateGeometryPositions();
    }

    /**
     * Sets emphasis state for nodes and edges based on an assembly selection.
     * Nodes and edges in the provided sets are emphasized, while others are deemphasized.
     * Updates materials and Z-positions accordingly.
     *
     * @param {string} assemblyName - The name of the assembly being emphasized
     * @param {Set<string>} nodeSet - Set of node names to emphasize
     * @param {Set<string>} edgeSet - Set of edge keys to emphasize
     * @param {THREE.Color|Map<string, THREE.Color>} nodeColor - Color(s) for emphasized nodes.
     * @param {Set<string>} [absentNodeSet] - Set of node names that lack the attribute category entirely
     * @param {string|THREE.Color} [deemphasisColor] - Optional override for deemphasis color
     */
    setNodeAndEdgeEmphasis(assemblyName, nodeSet, edgeSet, nodeColor, absentNodeSet, deemphasisColor) {

        this.emphasisStates.clear()

        const allNodes = this.geometryManager.geometryFactory.getNodeNameSet()

        // Three-way partition: emphasized, absent, deemphasized (remainder)
        const absentNodes = absentNodeSet || new Set()

        const deemphasisNodeSet = allNodes.difference(nodeSet).difference(absentNodes);

        for (const nodeName of absentNodes) {
            this.setEmphasisState(nodeName, 'absent');
        }

        for (const nodeName of deemphasisNodeSet) {
            this.setEmphasisState(nodeName, 'deemphasized');
        }

        this.updateNodeEmphasis(absentNodes, 'absent', undefined);
        this.updateNodeEmphasis(deemphasisNodeSet, 'deemphasized', undefined, undefined, deemphasisColor);
        this.updateNodeEmphasis(nodeSet, 'emphasized', assemblyName, nodeColor);

        const deemphasisEdgeSet = this.geometryManager.geometryFactory.getEdgeNameSet().difference(edgeSet);

        for (const edgeKey of deemphasisEdgeSet) {
            this.setEmphasisState(edgeKey, 'deemphasized');
        }

        this.updateEdgeEmphasis(deemphasisEdgeSet, 'deemphasized', undefined);
        this.updateEdgeEmphasis(edgeSet, 'emphasized', assemblyName);

        this.updateGeometryPositions();
    }

    /**
     * Restores nodes and edges to their normal (non-emphasized) state.
     * Resets materials and Z-positions for the specified nodes and edges.
     *
     * @param {Set<string>} nodeSet - Set of node names to restore to normal state
     * @param {Set<string>} edgeSet - Set of edge keys to restore to normal state
     */
    restoreLinesandEdgesViaZOffset(nodeSet, edgeSet) {

        for (const nodeName of nodeSet) {
            this.setEmphasisState(nodeName, 'normal');
        }

        for (const key of edgeSet) {
            this.setEmphasisState(key, 'normal');
        }

        this.updateNodeEmphasis(nodeSet, 'normal', undefined, undefined);
        this.updateEdgeEmphasis(edgeSet, 'normal', undefined);

        this.updateGeometryPositions();
    }

    /**
     * Sets the emphasis state for a node or edge.
     * States can be: 'normal', 'emphasized', or 'deemphasized'.
     *
     * @param {string} nodeName - The name/key of the node or edge
     * @param {string} state - The emphasis state ('normal', 'emphasized', or 'deemphasized')
     */
    setEmphasisState(nodeName, state) {
        this.emphasisStates.set(nodeName, state);
    }

    /**
     * Applies an emphasis state to a mesh by updating its material.
     * Handles both node and edge meshes, applying appropriate materials based on state.
     *
     * @param {THREE.Mesh|RibbonLine} mesh - The mesh to update
     * @param {string} emphasisState - The state to apply ('normal', 'emphasized', or 'deemphasized')
     * @param {string} assemblyName - The assembly name (required for 'emphasized' state)
     * @param {THREE.Color|Map<string, THREE.Color>} nodeColor - Color(s) for emphasized nodes.
     * @param {string|THREE.Color} [deemphasisColor] - Optional override for deemphasis color.
     */
    applyEmphasisState(mesh, emphasisState, assemblyName, nodeColor, deemphasisColor) {
        if (!mesh.userData) return;

        const { type } = mesh.userData;

        if (emphasisState === 'deemphasized') {
            if (type === 'node') {
                mesh.material = this.getNodeRibbonDeemphasisMaterial(mesh.userData.nodeName, deemphasisColor);
            } else if (type === 'edge') {
                mesh.material = materialService.getEdgeDeemphasisMaterial();
            }
        } else if (emphasisState === 'emphasized') {

            if (type === 'node') {
                mesh.material = this.getNodeRibbonEmphasisMaterial(assemblyName, mesh.userData.nodeName, nodeColor);
            } else if (type === 'edge') {

                const startColor = getAppleCrayonColorByName('magnesium')
                const endColor = getAppleCrayonColorByName('magnesium')
                mesh.material = this.getEdgeMaterial(startColor, endColor)
            }

        } else if (emphasisState === 'absent') {

            if (type === 'node') {
                mesh.material = this.getNodeRibbonAbsenceMaterial(mesh.userData.nodeName);
            }

        }  else if (emphasisState === 'normal') {

            if (type === 'node') {
                mesh.material = this.getNodeRibbonMaterial(mesh.userData.nodeName);
            } else if (type === 'edge') {
                const startColor = getAppleCrayonColorByName('steel')
                const endColor = getAppleCrayonColorByName('steel')
                mesh.material = this.getEdgeMaterial(startColor, endColor)
            }

        } else {
            console.warn('DANGER! Should not get here')
        }
    }

    /**
     * Updates the emphasis state for a set of edges in the scene.
     * Traverses the EdgeMeshGroup and applies the emphasis state to matching edges.
     *
     * @param {Set<string>} edgeSet - Set of edge keys to update
     * @param {string} emphasisState - The state to apply ('normal', 'emphasized', or 'deemphasized')
     * @param {string} assembly - The assembly name (used for 'emphasized' state)
     */
    updateEdgeEmphasis(edgeSet, emphasisState, assembly) {

        const edgeMeshGroup = this.sceneManager.getActiveScene().getObjectByName('EdgeMeshGroup')
        edgeMeshGroup.traverse((object) => {
            if (object.userData?.type === 'edge') {
                if (edgeSet.has(object.userData.geometryKey)) {
                    this.applyEmphasisState(object, emphasisState, assembly, undefined);
                }
            }
        })

    }

    /**
     * Updates the emphasis state for a set of nodes in the scene.
     * Traverses the NodeMeshGroup and applies the emphasis state to matching nodes.
     *
     * @param {Set<string>} nodeNameSet - Set of node names to update
     * @param {string} emphasisState - The state to apply ('normal', 'emphasized', or 'deemphasized')
     * @param {string} assemblyName - The assembly name (used for 'emphasized' state)
     * @param {THREE.Color|Map<string, THREE.Color>} nodeColor - Color(s) for emphasized nodes.
     * @param {string|THREE.Color} [deemphasisColor] - Optional override for deemphasis color.
     */
    updateNodeEmphasis(nodeNameSet, emphasisState, assemblyName, nodeColor, deemphasisColor) {

        const nodeMeshGroup = this.sceneManager.getActiveScene().getObjectByName('NodeMeshGroup')
        nodeMeshGroup.traverse((object) => {
            if (object.userData?.nodeName && nodeNameSet.has(object.userData.nodeName)) {
                this.applyEmphasisState(object, emphasisState, assemblyName, nodeColor, deemphasisColor);
            }
        });
    }

    /**
     * Updates the Z-position (depth) of all nodes and edges in the scene.
     * Uses emphasis states to determine appropriate Z-offsets for visual layering.
     */
    updateGeometryPositions() {

        const nodeMeshGroup = this.sceneManager.getActiveScene().getObjectByName('NodeMeshGroup')
        nodeMeshGroup.traverse((object) => {
            if (object.userData?.nodeName) {
                const nodeName = object.userData.nodeName;
                const zOffset = this.getZOffset(`node:${nodeName}`);
                const baseZ = object.userData.zOffset || GeometryFactory.NODE_LINE_Z_OFFSET
                object.position.z = zOffset - baseZ
            }
        });

        const edgeMeshGroup = this.sceneManager.getActiveScene().getObjectByName('EdgeMeshGroup')
        edgeMeshGroup.traverse((object) => {
            if (object.userData?.type === 'edge') {
                const edgeKey = object.userData.geometryKey;
                object.position.z = this.getZOffset(edgeKey);
            }
        });
    }

}

export default Look;
