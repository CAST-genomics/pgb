import Look from "./look.js"
import {assemblyMetadataService } from "../assemblyMetadataService.js"
import {frequencyAnalysisService} from "../frequencyAnalysisService.js"
import {frequencyToColorContinuous} from "../utils/color/tufteHeatmapColors.js"
import eventBus from "../utils/eventBus.js"

class PCAChartLook extends Look {

    constructor(name, config) {
        super(name, config)
    }

    static createPCAChartLook(name, config) {
        return new PCAChartLook(name, config);
    }

    handleSelectionEvent(data, eventType) {
        const { acronym } = data

        for (const nodeName of [...this.geometryManager.geometryFactory.getNodeNameSet()]){

            const { frequency } = this.genomicService.nodeMetadata.get(nodeName)
            const { superpopulation } = frequency

            let rawFrequency = superpopulation[ acronym ]

            const key = Look.getCacheKey(nodeName)
            const material = this.materialCache.get(key)

            const color = frequencyToColorContinuous(rawFrequency)
            material.color.copy(color)

            material.needsUpdate = true

        }
    }

}

export default PCAChartLook
