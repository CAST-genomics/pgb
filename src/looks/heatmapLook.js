import * as THREE from 'three';
import Look from "./look.js"
import {assemblyMetadataService } from "../assemblyMetadataService.js"
import {frequencyAnalysisService} from "../frequencyAnalysisService.js"
import {frequencyToColorContinuous} from "../utils/color/tufteHeatmapColors.js"
import { ylGnBu, ylOrRd, blues } from "../utils/color/color-ramps.js"
import eventBus from "../utils/eventBus.ts"

class HeatmapLook extends Look {

    constructor(name, config) {
        super(name, config)
    }

    static createHeatmapLook(name, config) {
        return new HeatmapLook(name, config);
    }

    createNodeTooltipContent(nodeObject) {
        const { nodeName } = nodeObject.userData;
        return assemblyMetadataService.getPopulationTooltip(nodeName)
    }

    handleSelectionEvent(data, eventType) {
        const { acronym } = data

        const nodeMeshGroup = this.sceneManager.getActiveScene().getObjectByName('NodeMeshGroup')
        if (!nodeMeshGroup) return

        for (const mesh of nodeMeshGroup.children) {
            const nodeName = mesh.userData?.nodeName
            if (!nodeName) continue

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

            if (mesh.material.uniforms?.diffuse) {
                mesh.material.uniforms.diffuse.value.copy(color)
            } else {
                mesh.material.color.copy(color)
            }
            mesh.material.needsUpdate = true
        }
    }

    activate() {
        super.activate();

        // Handle deselection events for both superpopulation and population
        this.superpopDeselectUnsub = eventBus.subscribe('superpopulation:deselected', data => {
            console.log('Population Look received superpopulation button deselection')
        });

        this.popDeselectUnsub = eventBus.subscribe('population:deselected', data => {
            console.log('Population Look received population button deselection')
        });

        // Handle selection events for both superpopulation and population with shared handler
        this.superpopSelectUnsub = eventBus.subscribe('superpopulation:selected', data => {
            this.handleSelectionEvent(data, 'superpopulation');
        });

        this.popSelectUnsub = eventBus.subscribe('population:selected', data => {
            this.handleSelectionEvent(data, 'population');
        });
    }

    deactivate() {
        super.deactivate();

        if (this.superpopDeselectUnsub) {
            this.superpopDeselectUnsub();
            this.superpopDeselectUnsub = null;
        }

        if (this.popDeselectUnsub) {
            this.popDeselectUnsub();
            this.popDeselectUnsub = null;
        }

        if (this.superpopSelectUnsub) {
            this.superpopSelectUnsub();
            this.superpopSelectUnsub = null;
        }

        if (this.popSelectUnsub) {
            this.popSelectUnsub();
            this.popSelectUnsub = null;
        }
    }

    dispose() {

        super.dispose()

    }

}

export default HeatmapLook
