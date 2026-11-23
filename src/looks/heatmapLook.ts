import * as THREE from 'three';
import Look from "./look.ts"
import {assemblyMetadataService } from "../assemblyMetadataService.ts"
import {frequencyAnalysisService} from "../frequencyAnalysisService.js"
import {frequencyToColorContinuous} from "../utils/color/tufteHeatmapColors.js"
import { ylGnBu, ylOrRd, blues, devon, cetL12 } from "../utils/color/color-ramps.js"
import RibbonMaterialFactory from "../ribbonMaterialFactory.js"
import { PopulationBreakdown } from "../populationBreakdown.ts"

/**
 * Parameter-binding events (the Look's "shader uniforms" — inputs that drive
 * its appearance while active). Subscribed in `activate()`, drained in
 * `Look.deactivate()`.
 *
 *   superpopulation:selected    — color nodes by frequency within the chosen
 *                                 superpopulation (from PopulationWidget).
 *                                 Payload: { acronym }.
 *   superpopulation:deselected  — clear superpopulation heatmap colors.
 *                                 Payload: {}.
 *   population:selected         — color nodes by frequency within the chosen
 *                                 population (from PopulationWidget).
 *                                 Payload: { acronym }.
 *   population:deselected       — clear population heatmap colors.
 *                                 Payload: {}.
 *   graph:clearing              — the graph is being rebuilt: close the
 *                                 population breakdown.
 *   node click (RaycastService) — left-click on a node opens the population
 *                                 breakdown for it (#174). Not an event-bus
 *                                 event; registered through the raycaster's
 *                                 click hook, released with the bus
 *                                 subscriptions on deactivate.
 *
 * HeatmapLook is active for as long as the Population widget is up, selection
 * or not: with nothing selected the nodes wear the default color.
 *
 * Population breakdown (CONTEXT.md). One at a time; clicking the node already
 * shown is a no-op; background clicks leave it open. While open, the node it
 * describes carries a halo of its own — deliberately not the cyan
 * track-pointer dot, which follows the annotation track and moves while the
 * user scrubs; the halo stays put. The selected population's row is bold and
 * follows the selection live; a superpopulation selection bolds none.
 */
/**
 * Narrows a scene child to a mesh carrying exactly one material — the shape
 * every node mesh in NodeMeshGroup has. Non-mesh children (helpers, feedback
 * dots) and multi-material meshes are skipped rather than blindly cast.
 */
/**
 * The slice of RaycastService HeatmapLook binds to: its click hook. Left-click
 * arrives as a `pointerup` with button 0; right-click arrives both as a
 * `pointerup` with button 2 and as a `contextmenu`. `intersection` is null on
 * a background click.
 */
interface NodeClickSource {
    registerClickHandler(handler: (intersection: NodeClickIntersection | null, event: { type: string; button: number }) => void): () => void
}

interface NodeClickIntersection {
    object: THREE.Object3D
}

/** The halo on the node the breakdown describes, and what to restore on removal. */
interface BreakdownMark {
    mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>
    node: THREE.Mesh
    nodeRenderOrder: number
}

function isSingleMaterialMesh(object: THREE.Object3D): object is THREE.Mesh<THREE.BufferGeometry, THREE.Material> {
    return (object as THREE.Mesh).isMesh === true && !Array.isArray((object as THREE.Mesh).material)
}

class HeatmapLook extends Look {

    static BREAKDOWN_MARK_NAME = 'PopulationBreakdownMark'
    // Warm against the single-hue blue heatmap ramp and the ivory background;
    // distinct from the cyan track-pointer dot.
    static BREAKDOWN_MARK_COLOR = '#ff8c1a'
    // Total on-screen width of the halo; the node ribbon sits centered in it.
    static BREAKDOWN_MARK_WIDTH_PIXELS = Look.NODE_LINE_WIDTH_PIXELS + 4
    static BREAKDOWN_MARGIN_PX = 12

    raycastService: NodeClickSource | undefined
    graphContainer: HTMLElement | null
    private breakdown: PopulationBreakdown | null = null
    private breakdownMark: BreakdownMark | null = null
    private selectedPopulationAcronym: string | null = null

    constructor(name: string, config: any) {
        super(name, config)
        this.raycastService = config.raycastService
        this.graphContainer = config.graphContainer ?? null
    }

    static createHeatmapLook(name: string, config: any): HeatmapLook {
        return new HeatmapLook(name, config);
    }

    /** Node and Length. No State row: under HeatmapLook it would always read "normal". */
    createNodeTooltipContent(nodeObject: THREE.Object3D): string {
        return this.createNodeDetailsTooltip(nodeObject, { showState: false })
    }

    handleSelectionEvent(data: { acronym: string }, eventType: string): void {
        const { acronym } = data

        this.selectedPopulationAcronym = eventType === 'population' ? acronym : null
        this.breakdown?.setSelectedPopulation(this.selectedPopulationAcronym)

        this.paintNodes(nodeName => {
            const { frequency } = this.genomicService.nodeMetadata.get(nodeName)

            let rawFrequency
            if (eventType === 'superpopulation') {
                rawFrequency = frequency.superpopulation[ acronym ]
            } else if (eventType === 'population') {
                rawFrequency = frequency.population[ acronym ]
            }

            // const color = frequencyToColorContinuous(rawFrequency)
            // Guard: ramp.color(undefined) indexes rgbStops[NaN] and throws.
            return cetL12.color(rawFrequency ?? 0)
        })
    }

    /**
     * Nothing selected: every node back to the default color. The Population
     * widget stays up (and this Look active) through a deselection.
     */
    handleDeselectionEvent(): void {
        this.selectedPopulationAcronym = null
        this.breakdown?.setSelectedPopulation(null)

        const defaultColor = new THREE.Color(Look.DEFAULT_NODE_COLOR)
        this.paintNodes(() => defaultColor)
    }

    private paintNodes(colorForNode: (nodeName: string) => THREE.Color): void {

        if (!this.activeScene) return
        const nodeMeshGroup = this.activeScene.getObjectByName('NodeMeshGroup')
        if (!nodeMeshGroup) return

        for (const child of nodeMeshGroup.children) {
            if (!isSingleMaterialMesh(child)) continue

            const nodeName = child.userData?.nodeName
            if (!nodeName) continue

            const mesh = child
            const color = colorForNode(nodeName)

            // Ribbon nodes carry a ShaderMaterial whose color lives in a uniform;
            // any other material exposes .color directly.
            const { material } = mesh
            const diffuse = material instanceof THREE.ShaderMaterial ? material.uniforms.diffuse : undefined
            if (diffuse) {
                diffuse.value.copy(color)
            } else if ('color' in material) {
                (material.color as THREE.Color).copy(color)
            }
            material.needsUpdate = true
        }
    }

    activate(activeScene: THREE.Scene): void {
        super.activate(activeScene);

        this.subscribe('superpopulation:deselected', () => {
            this.handleDeselectionEvent()
        });

        this.subscribe('population:deselected', () => {
            this.handleDeselectionEvent()
        });

        this.subscribe('superpopulation:selected', data => {
            this.handleSelectionEvent(data, 'superpopulation');
        });

        this.subscribe('population:selected', data => {
            this.handleSelectionEvent(data, 'population');
        });

        this.subscribe('graph:clearing', () => {
            this.closeBreakdown()
        });

        if (this.raycastService) {
            this.unsubs.push(this.raycastService.registerClickHandler(
                (intersection, event) => this.onNodeClick(intersection, event)))
        }
    }

    deactivate(): void {
        this.closeBreakdown()
        this.selectedPopulationAcronym = null
        super.deactivate()
    }

    dispose(): void {

        super.dispose()

        this.breakdown?.destroy()
        this.breakdown = null
    }

    /**
     * Left-click on a node opens the breakdown for it. Everything else — right
     * button (which also arrives here, as a pointerup and as a contextmenu),
     * edges, empty background — leaves the breakdown as it is.
     */
    private onNodeClick(intersection: NodeClickIntersection | null, event: { type: string; button: number }): void {
        if (event.type !== 'pointerup' || event.button !== 0) return

        const node = intersection?.object
        if (!(node instanceof THREE.Mesh) || node.userData.type !== 'node') return

        const nodeName: string = node.userData.nodeName
        if (this.breakdown?.nodeName === nodeName) return

        this.openBreakdown(nodeName, node)
    }

    private openBreakdown(nodeName: string, nodeMesh: THREE.Mesh): void {
        if (!this.breakdown) {
            this.breakdown = new PopulationBreakdown({
                defaultPosition: panel => this.breakdownDefaultPosition(panel),
                onClose: () => this.removeBreakdownMark(),
            })
        }

        this.breakdown.show(
            nodeName,
            assemblyMetadataService.getPopulationBreakdownRows(nodeName),
            this.selectedPopulationAcronym)

        this.removeBreakdownMark()
        this.addBreakdownMark(nodeMesh)
    }

    private closeBreakdown(): void {
        this.breakdown?.close()
        this.removeBreakdownMark()
    }

    /** Upper right of the graph area, below the locus caption at its top. */
    private breakdownDefaultPosition(panel: HTMLElement): { left: number; top: number } {
        const margin = HeatmapLook.BREAKDOWN_MARGIN_PX
        const container = this.graphContainer
        if (!container) {
            return { left: margin, top: margin }
        }

        const area = container.getBoundingClientRect()
        const caption = container.querySelector('.pgb-locus-display')
        const below = caption ? caption.getBoundingClientRect().bottom : area.top
        return {
            left: Math.max(area.left + margin, area.right - panel.offsetWidth - margin),
            top: below + margin,
        }
    }

    /**
     * The halo: a wider ribbon over the node's own geometry, drawn just under
     * the marked node and over every other one. Lives outside NodeMeshGroup so
     * the raycaster never sees it, and sizes itself per frame rather than
     * joining the ribbon registry's tick.
     */
    private addBreakdownMark(nodeMesh: THREE.Mesh): void {
        if (!this.activeScene) return

        const material = RibbonMaterialFactory.createMaterial(HeatmapLook.BREAKDOWN_MARK_COLOR)
        material.depthWrite = false

        const mark = new THREE.Mesh(nodeMesh.geometry, material)
        mark.name = HeatmapLook.BREAKDOWN_MARK_NAME
        mark.renderOrder = 1
        mark.matrixAutoUpdate = false
        nodeMesh.updateWorldMatrix(true, false)
        mark.matrix.copy(nodeMesh.matrixWorld)
        mark.onBeforeRender = (renderer, _scene, camera) => {
            // The graph camera is orthographic, as for the node ribbons.
            material.uniforms.halfWidth.value = RibbonMaterialFactory.computeHalfWidth(
                camera as THREE.OrthographicCamera, HeatmapLook.BREAKDOWN_MARK_WIDTH_PIXELS, renderer.domElement)
        }

        this.breakdownMark = { mesh: mark, node: nodeMesh, nodeRenderOrder: nodeMesh.renderOrder }
        nodeMesh.renderOrder = 2
        this.activeScene.add(mark)
    }

    private removeBreakdownMark(): void {
        if (!this.breakdownMark) return
        const { mesh, node, nodeRenderOrder } = this.breakdownMark

        node.renderOrder = nodeRenderOrder
        mesh.removeFromParent()
        mesh.material.dispose()
        this.breakdownMark = null
    }

}

export default HeatmapLook
