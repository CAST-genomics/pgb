import * as THREE from 'three'
import lineMaterialResolutionService from "../lineMaterialResolutionService.js"
import GeometryFactory from "../geometryFactory.js"
import RibbonLine from "../ribbonLine.js"
import RibbonMaterialFactory from "../ribbonMaterialFactory.js"
import materialService, {arrowMaterialFactory} from "../materialService.js"
import {rubinColorsHexStrings} from "../utils/color/color.js"
import {prettyPrint} from "../utils/utils.js"
import eventBus from "../utils/eventBus.ts"
import type { EventMap } from "../utils/eventMap.ts"

class Look {

    static NODE_EMPHASIS_COLOR = '#c0311a'

    static NODE_DEEMPHASIS_COLOR = '#B2B1A9'

    // static NODE_ABSENCE_COLOR = '#dce4e8'
    static NODE_ABSENCE_COLOR = rubinColorsHexStrings.get('rubinIvoryDark')
    // static NODE_ABSENCE_COLOR = '#ff0289'

    static DEFAULT_NODE_COLOR = rubinColorsHexStrings.get('rubinGray')
    static DEFAULT_EDGE_COLOR = rubinColorsHexStrings.get('rubinGray')

    // Apparent line width in screen pixels (constant regardless of zoom).
    // Converted to world units per frame by lineMaterialResolutionService.
    static NODE_LINE_WIDTH_PIXELS = 2*2;

    name: string
    genomicService: any
    geometryManager: any
    assemblyWidget: any
    activeScene: any
    zOffset: number
    isActive: boolean
    materialCache: Map<string, any>
    emphasisStates: Map<string, string>
    protected unsubs: Array<() => void>

    constructor(name: string, config: any) {
        this.name = name

        this.genomicService = config.genomicService
        this.geometryManager = config.geometryManager
        this.assemblyWidget = config.assemblyWidget; // Access to assembly widget for selected assembly info
        this.activeScene = null;

        this.zOffset = config.zOffset || 0;

        this.isActive = false; // Track if this look is currently active

        // Material cache to avoid creating duplicate materials
        this.materialCache = new Map();

        // Emphasis state tracking
        this.emphasisStates = new Map();

        // Active-event subscriptions; unsubscribed en masse in deactivate().
        this.unsubs = [];
    }

    /**
     * Subscribe to an event bus event for the lifetime of this look's active
     * window. All subscriptions registered here are automatically cleaned up
     * when deactivate() runs, so subclasses never need to track unsubs.
     */
    protected subscribe<K extends keyof EventMap>(event: K, handler: (data: EventMap[K]) => void): void {
        this.unsubs.push(eventBus.subscribe(event, handler));
    }

    /**
     * Gets the Z-offset for a given object based on its ID.
     * Nodes and edges are rendered at different Z depths to control visual layering.
     *
     * @param objectId - The object identifier, must start with 'node:' or 'edge:'
     * @returns The Z-offset value for the object type
     */
    getZOffset(objectId: string): number {

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
     */
    createMesh(geometry: any, context: any): any {
        if (context.type === 'node') {
            return this.createNodeMesh(geometry, context);
        } else if (context.type === 'edge') {
            return this.createEdgeMesh(geometry, context);
        }

        throw new Error(`Unknown context type: ${context.type}`);
    }

    /**
     * Creates a ribbon mesh for a node.
     */
    createNodeMesh(geometry: any, context: any): any {

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
     */
    getNodeRibbonMaterial(nodeName: string): any {
        const cacheKey = `ribbon:${nodeName}:normal`

        if (this.materialCache.has(cacheKey)) {
            return this.materialCache.get(cacheKey)
        }

        const material = RibbonMaterialFactory.createMaterial(Look.DEFAULT_NODE_COLOR)
        lineMaterialResolutionService.registerRibbonMaterial(material)
        this.materialCache.set(cacheKey, material)

        return material
    }

    /**
     * Gets or creates a ribbon ShaderMaterial for a node's emphasized state.
     */
    getNodeRibbonEmphasisMaterial(assemblyName: string, nodeName: string, nodeColor: any): any {
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
     */
    getNodeRibbonDeemphasisMaterial(nodeName: string, deemphasisColor?: string): any {
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
    getNodeRibbonAbsenceMaterial(nodeName: string): any {
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
     * Creates a mesh for an edge (connection between nodes) using the provided geometry.
     * Edges use gradient materials that transition from start to end colors.
     */
    createEdgeMesh(geometry: any, context: any): any {

        const { startNode, endNode, edgeKey } = context;

        const material = this.getEdgeMaterial(Look.DEFAULT_EDGE_COLOR)

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
     * Creates a material for an edge arrow with a single color.
     */
    getEdgeMaterial(color: any): any {
        return arrowMaterialFactory(color, materialService.getTexture('arrow-white'), 1);
    }

    /**
     * Creates HTML content for a node tooltip that appears on hover.
     * Displays node name and length information.
     */
    createNodeTooltipContent(nodeObject: any): string {
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
    activate(activeScene: any): void {
        this.isActive = true;
        this.activeScene = activeScene;
        console.log(`${this.constructor.name} is now active`)
    }

    /**
     * Called when this look becomes inactive.
     * Sets the active flag to false and can be overridden by subclasses to disable
     * event subscriptions, stop animations, or perform cleanup logic.
     */
    deactivate(): void {
        for (const unsub of this.unsubs) unsub();
        this.unsubs.length = 0;
        this.activeScene = null;
        this.isActive = false;
    }

    /**
     * Disposes of all resources used by this look.
     * Deactivates the look, unregisters all materials from the resolution service,
     * and clears the material cache. Should be called when the look is no longer needed.
     */
    dispose(): void {

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
     * Unified partition of all nodes into emphasized / absent / remainder.
     *
     * Behavior matches the prior setNodeEmphasis + setNodeAbsence pair:
     * - Nodes in `emphasizedSet` become 'emphasized' with `emphasisColor`.
     * - Nodes in `absentSet` become 'absent'.
     * - All remaining nodes become 'deemphasized' if any nodes are emphasized,
     *   or 'normal' if nothing is emphasized (the "PCA widget open, no dot
     *   selected" case).
     */
    applyPartition(
        assemblyName: string | undefined,
        emphasizedSet: Set<string>,
        emphasisColor: any,
        absentSet: Set<string> | undefined,
        deemphasisColor: string | undefined,
    ): void {

        this.emphasisStates.clear()

        const allNodes = this.geometryManager.geometryFactory.getNodeNameSet()
        const absent = absentSet || new Set<string>()
        const remainder = allNodes.difference(emphasizedSet).difference(absent)
        const remainderState = emphasizedSet.size > 0 ? 'deemphasized' : 'normal'

        for (const nodeName of absent) {
            this.setEmphasisState(nodeName, 'absent')
        }
        for (const nodeName of remainder) {
            this.setEmphasisState(nodeName, remainderState)
        }
        for (const nodeName of emphasizedSet) {
            this.setEmphasisState(nodeName, 'emphasized')
        }

        this.updateNodeEmphasis(absent, 'absent', undefined)
        this.updateNodeEmphasis(remainder, remainderState, undefined, undefined, deemphasisColor)
        if (emphasizedSet.size > 0) {
            this.updateNodeEmphasis(emphasizedSet, 'emphasized', assemblyName, emphasisColor)
        }

        this.updateGeometryPositions()
    }

    /**
     * Restores nodes to their normal (non-emphasized) state.
     * Resets materials and Z-positions for the specified nodes.
     */
    restoreNodes(nodeSet: Set<string>): void {

        for (const nodeName of nodeSet) {
            this.setEmphasisState(nodeName, 'normal');
        }

        this.updateNodeEmphasis(nodeSet, 'normal', undefined, undefined);

        this.updateGeometryPositions();
    }

    /**
     * Sets the emphasis state for a node or edge.
     * States can be: 'normal', 'emphasized', or 'deemphasized'.
     */
    setEmphasisState(nodeName: string, state: string): void {
        this.emphasisStates.set(nodeName, state);
    }

    /**
     * Applies an emphasis state to a mesh by updating its material.
     * Handles both node and edge meshes, applying appropriate materials based on state.
     */
    applyEmphasisState(mesh: any, emphasisState: string, assemblyName: string | undefined, nodeColor?: any, deemphasisColor?: string): void {
        if (!mesh.userData) return;

        if (emphasisState === 'deemphasized') {
            mesh.material = this.getNodeRibbonDeemphasisMaterial(mesh.userData.nodeName, deemphasisColor);
        } else if (emphasisState === 'emphasized') {
            mesh.material = this.getNodeRibbonEmphasisMaterial(assemblyName!, mesh.userData.nodeName, nodeColor);
        } else if (emphasisState === 'absent') {
            mesh.material = this.getNodeRibbonAbsenceMaterial(mesh.userData.nodeName);
        } else if (emphasisState === 'normal') {
            mesh.material = this.getNodeRibbonMaterial(mesh.userData.nodeName);
        } else {
            console.warn('DANGER! Should not get here')
        }
    }

    /**
     * Updates the emphasis state for a set of nodes in the scene.
     * Traverses the NodeMeshGroup and applies the emphasis state to matching nodes.
     */
    updateNodeEmphasis(nodeNameSet: Set<string>, emphasisState: string, assemblyName: string | undefined, nodeColor?: any, deemphasisColor?: string): void {

        if (!this.activeScene) return;
        const nodeMeshGroup = this.activeScene.getObjectByName('NodeMeshGroup')
        if (!nodeMeshGroup) return;
        nodeMeshGroup.traverse((object: any) => {
            if (object.userData?.nodeName && nodeNameSet.has(object.userData.nodeName)) {
                this.applyEmphasisState(object, emphasisState, assemblyName, nodeColor, deemphasisColor);
            }
        });
    }

    /**
     * Updates the Z-position (depth) of all nodes and edges in the scene.
     * Uses emphasis states to determine appropriate Z-offsets for visual layering.
     */
    updateGeometryPositions(): void {

        if (!this.activeScene) return;
        const nodeMeshGroup = this.activeScene.getObjectByName('NodeMeshGroup')
        if (!nodeMeshGroup) return;
        nodeMeshGroup.traverse((object: any) => {
            if (object.userData?.nodeName) {
                const nodeName = object.userData.nodeName;
                const zOffset = this.getZOffset(`node:${nodeName}`);
                const baseZ = object.userData.zOffset || GeometryFactory.NODE_LINE_Z_OFFSET
                object.position.z = zOffset - baseZ
            }
        });
    }

}

export default Look;
