import Look from "./look.js"
import {assemblyMetadataService } from "../assemblyMetadataService.js"
import {frequencyAnalysisService} from "../frequencyAnalysisService.js"
import {frequencyToColorContinuous} from "../utils/color/tufteHeatmapColors.js"
import eventBus from "../utils/eventBus.js"

class PopulationLook extends Look {

    constructor(name, config) {
        super(name, config)
    }

    static createPopulationLook(name, config) {
        return new PopulationLook(name, config);
    }

    createNodeTooltipContent(nodeObject) {
        const { nodeName } = nodeObject.userData;
        return assemblyMetadataService.getPopulationTooltip(nodeName)
    }

    handleSelectionEvent(data, eventType) {
        const { acronym } = data

        for (const nodeName of [...this.geometryManager.geometryFactory.getNodeNameSet()]){

            const { frequency } = this.genomicService.nodeMetadata.get(nodeName)

            let rawFrequency
            let enhancedFrequency
            if (eventType === 'superpopulation') {
                const { superpopulation } = frequency
                rawFrequency = superpopulation[ acronym ]
            } else if (eventType === 'population') {
                const { population } = frequency
                rawFrequency = population[ acronym ]
                enhancedFrequency = frequencyAnalysisService.getEnhancedFrequency(acronym, eventType, this.genomicService.nodeMetadata.get(nodeName))
            }

            // let frequencyToUse
            // if (undefined === enhancedFrequency) {
            //     frequencyToUse = rawFrequency
            // } else {
            //     frequencyToUse = enhancedFrequency
            // }

            // const color = getHeatmapColorHSLInterpolation('aqua', colorComplements.get('aqua'), frequencyToUse)
            // const color = frequencyToColorDiscrete(frequencyToUse)
            const color = frequencyToColorContinuous(rawFrequency)

            const key = Look.getCacheKey(nodeName)
            const material = this.materialCache.get(key)
            material.color.copy(color)
            material.needsUpdate = true

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

export default PopulationLook
