import * as THREE from 'three';
import Look from "./look.ts"
import {assemblyMetadataService } from "../assemblyMetadataService.ts"
import {frequencyAnalysisService} from "../frequencyAnalysisService.js"
import {frequencyToColorContinuous} from "../utils/color/tufteHeatmapColors.js"
import { ylGnBu, ylOrRd, blues } from "../utils/color/color-ramps.js"

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
 */
/**
 * Narrows a scene child to a mesh carrying exactly one material — the shape
 * every node mesh in NodeMeshGroup has. Non-mesh children (helpers, feedback
 * dots) and multi-material meshes are skipped rather than blindly cast.
 */
function isSingleMaterialMesh(object: THREE.Object3D): object is THREE.Mesh<THREE.BufferGeometry, THREE.Material> {
    return (object as THREE.Mesh).isMesh === true && !Array.isArray((object as THREE.Mesh).material)
}

class HeatmapLook extends Look {

    constructor(name: string, config: any) {
        super(name, config)
    }

    static createHeatmapLook(name: string, config: any): HeatmapLook {
        return new HeatmapLook(name, config);
    }

    createNodeTooltipContent(nodeObject: THREE.Object3D): string {
        const { nodeName } = nodeObject.userData;
        return assemblyMetadataService.getPopulationTooltip(nodeName)
    }

    handleSelectionEvent(data: { acronym: string }, eventType: string): void {
        const { acronym } = data

        if (!this.activeScene) return
        const nodeMeshGroup = this.activeScene.getObjectByName('NodeMeshGroup')
        if (!nodeMeshGroup) return

        for (const child of nodeMeshGroup.children) {
            if (!isSingleMaterialMesh(child)) continue

            const nodeName = child.userData?.nodeName
            if (!nodeName) continue

            const mesh = child

            const { frequency } = this.genomicService.nodeMetadata.get(nodeName)

            let rawFrequency
            if (eventType === 'superpopulation') {
                rawFrequency = frequency.superpopulation[ acronym ]
            } else if (eventType === 'population') {
                rawFrequency = frequency.population[ acronym ]
            }

            // const color = new THREE.Color(ylOrRd.hex(rawFrequency))
            const color = frequencyToColorContinuous(rawFrequency)
            console.log(`frequency ${ rawFrequency }`)

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
            console.log('Population Look received superpopulation button deselection')
        });

        this.subscribe('population:deselected', () => {
            console.log('Population Look received population button deselection')
        });

        this.subscribe('superpopulation:selected', data => {
            this.handleSelectionEvent(data, 'superpopulation');
        });

        this.subscribe('population:selected', data => {
            this.handleSelectionEvent(data, 'population');
        });
    }

    dispose(): void {

        super.dispose()

    }

}

export default HeatmapLook
