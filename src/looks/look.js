import * as THREE from 'three'
import lineMaterialResolutionService from "../lineMaterialResolutionService.js"
import GeometryFactory from "../geometryFactory.js"
import ParametricLine from "../parametricLine.js"
import materialService, {colorRampArrowMaterialFactory} from "../materialService.js"
import {LineMaterial} from "three/addons/lines/LineMaterial.js"
import {getAppleCrayonColorByName} from "../utils/color/color.js"
import {prettyPrint} from "../utils/utils.js"

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
        this.sceneManager = config.sceneManager; // Optional, may be undefined

        this.behaviors = config.behaviors || {};
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
     * Updates animation behavior for this look.
     * Called each frame to update any time-based visual effects.
     * Base implementation does nothing; subclasses should override for specific animations.
     *
     * @param {number} deltaTime - Time elapsed since last frame in milliseconds
     * @param {THREE.Scene} scene - The Three.js scene being rendered
     */
    updateBehavior(deltaTime, scene) {
        // Base class has no animation by default
        // Subclasses override this method for specific animation behaviors
    }

    /**
     * Creates a Three.js mesh from geometry and context information.
     * Routes to the appropriate creation method based on context type.
     *
     * @param {THREE.BufferGeometry} geometry - The geometry to use for the mesh
     * @param {Object} context - Context object containing type and metadata
     * @param {string} context.type - Either 'node' or 'edge'
     * @returns {THREE.Mesh|ParametricLine} The created mesh object
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
     * Creates a mesh for a node (genomic segment) using the provided geometry.
     * Uses ParametricLine for rendering node lines with appropriate materials.
     *
     * @param {THREE.BufferGeometry} geometry - The geometry for the node line
     * @param {Object} context - Context object containing node information
     * @param {string} context.nodeName - The name/identifier of the node
     * @returns {ParametricLine} The created node mesh with userData populated
     */
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

    /**
     * Gets or creates a material for a node's normal (non-emphasized) state.
     * Materials are cached to avoid creating duplicates for the same node.
     *
     * @param {string} nodeName - The name/identifier of the node
     * @returns {LineMaterial} The material for rendering the node in normal state
     */
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

    /**
     * Gets or creates a material for a node in its emphasized state.
     * This is a critical method for highlighting nodes when an assembly is selected.
     * Materials are cached per node and assembly combination to avoid duplicates.
     *
     * @param {string} assemblyName - The name of the assembly that this emphasis is for
     * @param {string} nodeName - The name/identifier of the node to emphasize
     * @param {THREE.Color|Map<string, THREE.Color>} nodeColor - The color(s) to use for emphasis.
     *   Can be either:
     *   - A single THREE.Color instance: Used for all nodes in the emphasis set
     *   - A Map<string, THREE.Color>: Maps node names to their specific colors.
     *     If the nodeName is not found in the map, falls back to NODE_EMPHASIS_COLOR.
     * @returns {LineMaterial} The material for rendering the node in emphasized state
     */
    getNodeEmphasisMaterial(assemblyName, nodeName, nodeColor) {

        const cacheKey = `${this.constructor.name}:${nodeName}:assembly:${assemblyName}`;

        // Check if we already have this material cached
        if (this.materialCache.has(cacheKey)) {
            console.log(`getNodeEmphasisMaterial - Node ${ nodeName } return material with cache key ${ cacheKey }`)
            return this.materialCache.get(cacheKey);
        }

        console.log(`getNodeEmphasisMaterial - Node ${ nodeName } create cache key ${ cacheKey } and create material`)

        // Disambiguate between a single color and a Map object
        let colorToUse;
        if (nodeColor instanceof Map) {
            // If nodeColor is a Map, retrieve the color using nodeName as the key
            const color = nodeColor.get(nodeName);
            if (color) {
                // Clone the THREE.Color object to prevent external modification
                colorToUse = color.clone();
            } else {
                // Fallback to default emphasis color if node not found in map
                colorToUse = Look.NODE_EMPHASIS_COLOR;
            }
        } else {
            // Use the single color directly
            colorToUse = nodeColor;
        }

        // color: Look.NODE_EMPHASIS_COLOR
        const material = new LineMaterial({ color: colorToUse, linewidth: Look.NODE_LINE_WIDTH, worldUnits: true, opacity: 1, transparent: true });

        // Register with resolution service for automatic resolution updates
        lineMaterialResolutionService.registerMaterial(material);

        // Cache the material
        this.materialCache.set(cacheKey, material);

        return material;
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
        console.log(`${ this.constructor.name } dispose.  material cache pre ${ this.constructor.size }`)
        this.materialCache.clear()
        console.log(`${ this.constructor.name } dispose.  material cache post ${ this.constructor.size }`)
    }

    /**
     * Generates a cache key for storing node materials.
     * Used to uniquely identify materials in the material cache.
     *
     * @param {string} nodeName - The name/identifier of the node
     * @returns {string} A unique cache key string
     */
    static getCacheKey(nodeName) {
        return `${this.constructor.name}:${nodeName}:normal`;
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
     *   See getNodeEmphasisMaterial() for details on the nodeColor parameter format.
     */
    setNodeAndEdgeEmphasis(assemblyName, nodeSet, edgeSet, nodeColor) {

        this.emphasisStates.clear()

        const deemphasisNodeSet = this.geometryManager.geometryFactory.getNodeNameSet().difference(nodeSet);

        for (const nodeName of deemphasisNodeSet) {
            this.setEmphasisState(nodeName, 'deemphasized');
        }

        this.updateNodeEmphasis(deemphasisNodeSet, 'deemphasized', undefined);
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
     * @param {THREE.Mesh|ParametricLine} mesh - The mesh to update
     * @param {string} emphasisState - The state to apply ('normal', 'emphasized', or 'deemphasized')
     * @param {string} assemblyName - The assembly name (required for 'emphasized' state)
     * @param {THREE.Color|Map<string, THREE.Color>} nodeColor - Color(s) for emphasized nodes.
     *   See getNodeEmphasisMaterial() for details on the nodeColor parameter format.
     */
    applyEmphasisState(mesh, emphasisState, assemblyName, nodeColor) {
        if (!mesh.userData) return;

        const { type } = mesh.userData;

        if (emphasisState === 'deemphasized') {
            if (type === 'node') {
                mesh.material = materialService.getNodeDeemphasisMaterial(mesh.userData.nodeName);
            } else if (type === 'edge') {
                mesh.material = materialService.getEdgeDeemphasisMaterial();
            }
        } else if (emphasisState === 'emphasized') {

            if (type === 'node') {
                mesh.material = this.getNodeEmphasisMaterial(assemblyName, mesh.userData.nodeName, nodeColor);
            } else if (type === 'edge') {

                const startColor = getAppleCrayonColorByName('magnesium')
                const endColor = getAppleCrayonColorByName('magnesium')
                mesh.material = this.getEdgeMaterial(startColor, endColor)

                // mesh.material = materialService.getEdgeEmphasisMaterial(this.genomicService.getAssemblyColor(assembly));
            }

        }  else if (emphasisState === 'normal') {

            if (type === 'node') {
                mesh.material = this.getNodeMaterial(mesh.userData.nodeName);
            } else if (type === 'edge') {
                // TODO: Handle 'normal' edge material
                const startColor = getAppleCrayonColorByName('steel')
                const endColor = getAppleCrayonColorByName('steel')
                mesh.material = this.getEdgeMaterial(startColor, endColor)

            }

        } else {
            console.warn('DANGER! Should not get here')
        }

        // Immediately update resolution for LineMaterials to fix raycasting issues
        if (mesh.material && mesh.material.resolution) {
            lineMaterialResolutionService.updateMaterialResolution(mesh.material);
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
     *   See getNodeEmphasisMaterial() for details on the nodeColor parameter format.
     */
    updateNodeEmphasis(nodeNameSet, emphasisState, assemblyName, nodeColor) {

        const nodeMeshGroup = this.sceneManager.getActiveScene().getObjectByName('NodeMeshGroup')
        nodeMeshGroup.traverse((object) => {
            if (object.userData?.nodeName && nodeNameSet.has(object.userData.nodeName)) {
                this.applyEmphasisState(object, emphasisState, assemblyName, nodeColor);
            }
        });
    }

    /**
     * Updates the Z-position (depth) of all nodes and edges in the scene.
     * Uses emphasis states to determine appropriate Z-offsets for visual layering.
     * Nodes are updated by modifying their geometry attributes, edges by updating their position.
     */
    updateGeometryPositions() {

        const nodeMeshGroup = this.sceneManager.getActiveScene().getObjectByName('NodeMeshGroup')
        nodeMeshGroup.traverse((object) => {
            if (object.userData?.nodeName) {
                const nodeName = object.userData.nodeName;
                const zOffset = this.getZOffset(`node:${nodeName}`);

                // Update geometry Z coordinates
                if (object.geometry.attributes.instanceStart) {
                    const instanceStart = object.geometry.attributes.instanceStart.array;
                    const instanceEnd = object.geometry.attributes.instanceEnd.array;

                    for (let i = 0; i < instanceStart.length; i += 3) {
                        instanceStart[i + 2] = zOffset;
                        instanceEnd[i + 2] = zOffset;
                    }

                    // Only needed for dashed lines
                    // if (object.computeLineDistances) {
                    //     object.computeLineDistances();
                    // }

                    object.geometry.attributes.instanceStart.needsUpdate = true;
                    object.geometry.attributes.instanceEnd.needsUpdate = true;
                }
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
