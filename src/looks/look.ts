import * as THREE from 'three'
import RibbonNode from "../ribbonNode.ts"
import RibbonMaterialFactory from "../ribbonMaterialFactory.js"
import materialService, {arrowMaterialFactory} from "../materialService.js"
import {rubinColorsHexStrings} from "../utils/color/color.js"
import {prettyPrint} from "../utils/utils.js"
import eventBus from "../utils/eventBus.ts"
import type { EventMap } from "../utils/eventMap.ts"

class Look {

    static DEFAULT_NODE_COLOR = rubinColorsHexStrings.get('rubinGray')
    static DEFAULT_EDGE_COLOR = rubinColorsHexStrings.get('rubinGray')

    // Apparent line width in screen pixels (constant regardless of zoom).
    // Converted to world units per frame by tickRibbonResolution() in ribbonNode.ts.
    static NODE_LINE_WIDTH_PIXELS = 2*2;

    name: string
    genomicService: any
    geometryManager: any
    assemblyWidget: any
    activeScene: any
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

        const mesh = RibbonNode.create(geometry, spline, material)

        mesh.userData.nodeName = nodeName
        mesh.userData.geometryKey = `node:${nodeName}`
        mesh.userData.type = 'node'

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
            colorToUse = color ? color.clone() : new THREE.Color()
        } else {
            colorToUse = nodeColor instanceof THREE.Color ? nodeColor : new THREE.Color(nodeColor)
        }

        const material = RibbonMaterialFactory.createMaterial(colorToUse)
        this.materialCache.set(cacheKey, material)

        return material
    }

    /**
     * Gets or creates a ribbon deemphasis material for a node.
     */
    getNodeRibbonDeemphasisMaterial(nodeName: string, deemphasisColor: string): any {
        const cacheKey = `ribbon:${nodeName}:deemphasis:${deemphasisColor}`

        if (this.materialCache.has(cacheKey)) {
            return this.materialCache.get(cacheKey)
        }

        const material = RibbonMaterialFactory.createMaterial(deemphasisColor)
        this.materialCache.set(cacheKey, material)

        return material
    }

    /**
     * Gets or creates a ribbon absence material for a node.
     */
    getNodeRibbonAbsenceMaterial(nodeName: string, absenceColor: string): any {
        const cacheKey = `ribbon:${nodeName}:absence:${absenceColor}`

        if (this.materialCache.has(cacheKey)) {
            return this.materialCache.get(cacheKey)
        }

        const material = RibbonMaterialFactory.createMaterial(absenceColor)
        this.materialCache.set(cacheKey, material)

        return material
    }

    /**
     * Gets or creates a ribbon off-walk material for a node — used in Assembly
     * Walk mode for nodes that carry the selected assembly but lie off the
     * monotonic walk. Visual partner of the gray veil painted on the
     * annotation track (annotationCanvas.renderDeEmphasisOverlay).
     */
    getNodeRibbonOffWalkMaterial(nodeName: string, offWalkColor: string): any {
        const cacheKey = `ribbon:${nodeName}:offwalk:${offWalkColor}`

        if (this.materialCache.has(cacheKey)) {
            return this.materialCache.get(cacheKey)
        }

        const material = RibbonMaterialFactory.createMaterial(offWalkColor)
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

        // Material registration is owned by RibbonNode now; nodes get
        // unregistered via clearRibbonRegistry() at dataset-reload time.
        this.materialCache.clear()
    }

    /**
     * Unified partition of all nodes into emphasized / off-walk / absent / remainder.
     *
     * - Nodes in `emphasizedSet` become 'emphasized' with `emphasisColor`.
     * - Nodes in `offWalkSet` become 'off-walk' with `offWalkColor`. Used in
     *   Assembly Walk mode for nodes that carry the selected assembly but lie
     *   off its monotonic walk (mirrors the gray veil on the annotation track).
     * - Nodes in `absentSet` become 'absent'.
     * - All remaining nodes become 'deemphasized' if any nodes are emphasized,
     *   or 'normal' if nothing is emphasized (the "PCA widget open, no dot
     *   selected" case).
     */
    setNodeEmphasis(
        assemblyName: string | undefined,
        emphasizedSet: Set<string>,
        emphasisColor: any,
        absentSet: Set<string> | undefined,
        deemphasisColor: string | undefined,
        absenceColor: string | undefined,
        offWalkSet?: Set<string>,
        offWalkColor?: string,
    ): void {

        this.emphasisStates.clear()

        const allNodes = this.geometryManager.geometryFactory.getNodeNameSet()
        const absent = absentSet || new Set<string>()
        const offWalk = offWalkSet || new Set<string>()
        const remainder = allNodes.difference(emphasizedSet).difference(absent).difference(offWalk)
        const remainderState = emphasizedSet.size > 0 ? 'deemphasized' : 'normal'

        for (const nodeName of absent) {
            this.setEmphasisState(nodeName, 'absent')
        }
        for (const nodeName of offWalk) {
            this.setEmphasisState(nodeName, 'off-walk')
        }
        for (const nodeName of remainder) {
            this.setEmphasisState(nodeName, remainderState)
        }
        for (const nodeName of emphasizedSet) {
            this.setEmphasisState(nodeName, 'emphasized')
        }

        this.updateNodeEmphasis(absent, 'absent', undefined, undefined, undefined, absenceColor)
        if (offWalk.size > 0) {
            this.updateNodeEmphasis(offWalk, 'off-walk', undefined, undefined, undefined, undefined, offWalkColor)
        }
        this.updateNodeEmphasis(remainder, remainderState, undefined, undefined, deemphasisColor)
        if (emphasizedSet.size > 0) {
            this.updateNodeEmphasis(emphasizedSet, 'emphasized', assemblyName, emphasisColor)
        }
    }

    /**
     * Restores nodes to their normal (non-emphasized) state.
     */
    restoreNodes(nodeSet: Set<string>): void {

        for (const nodeName of nodeSet) {
            this.setEmphasisState(nodeName, 'normal');
        }

        this.updateNodeEmphasis(nodeSet, 'normal', undefined, undefined);
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
    applyEmphasisState(mesh: any, emphasisState: string, assemblyName: string | undefined, nodeColor?: any, deemphasisColor?: string, absenceColor?: string, offWalkColor?: string): void {
        if (!mesh.userData) return;

        if (emphasisState === 'deemphasized') {
            mesh.material = this.getNodeRibbonDeemphasisMaterial(mesh.userData.nodeName, deemphasisColor!);
        } else if (emphasisState === 'emphasized') {
            mesh.material = this.getNodeRibbonEmphasisMaterial(assemblyName!, mesh.userData.nodeName, nodeColor);
        } else if (emphasisState === 'absent') {
            mesh.material = this.getNodeRibbonAbsenceMaterial(mesh.userData.nodeName, absenceColor!);
        } else if (emphasisState === 'off-walk') {
            mesh.material = this.getNodeRibbonOffWalkMaterial(mesh.userData.nodeName, offWalkColor!);
        } else if (emphasisState === 'normal') {
            mesh.material = this.getNodeRibbonMaterial(mesh.userData.nodeName);
        } else {
            console.warn('DANGER! Should not get here')
        }

        // Draw emphasized nodes last so they visually cover any overlapping
        // deemphasized / absent / normal neighbours. Three.js sorts meshes by
        // renderOrder ascending; higher values draw on top.
        mesh.renderOrder = emphasisState === 'emphasized' ? 1 : 0;
    }

    /**
     * Updates the emphasis state for a set of nodes in the scene.
     * Traverses the NodeMeshGroup and applies the emphasis state to matching nodes.
     */
    updateNodeEmphasis(nodeNameSet: Set<string>, emphasisState: string, assemblyName: string | undefined, nodeColor?: any, deemphasisColor?: string, absenceColor?: string, offWalkColor?: string): void {

        if (!this.activeScene) return;
        const nodeMeshGroup = this.activeScene.getObjectByName('NodeMeshGroup')
        if (!nodeMeshGroup) return;
        nodeMeshGroup.traverse((object: any) => {
            if (object.userData?.nodeName && nodeNameSet.has(object.userData.nodeName)) {
                this.applyEmphasisState(object, emphasisState, assemblyName, nodeColor, deemphasisColor, absenceColor, offWalkColor);
            }
        });
    }

}

export default Look;
