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

        let nodeCount = 0
        for (const nodeName of [...this.geometryManager.geometryFactory.getNodeNameSet()]){

            ++nodeCount
            continue;


            const { frequency } = this.genomicService.nodeMetadata.get(nodeName)
            const { superpopulation } = frequency

            let rawFrequency = superpopulation[ acronym ]

            const key = Look.getCacheKey(nodeName)
            const material = this.materialCache.get(key)

            const color = frequencyToColorContinuous(rawFrequency)
            material.color.copy(color)

            material.needsUpdate = true

        }

        console.log(`node count ${nodeCount}`)
    }

    activate() {
        super.activate();

        this.deemphasizeUnsub = eventBus.subscribe('assembly:emphasis', data => {
            const { assembly, nodeSet, edgeSet } = data
            this.setNodeAndEdgeEmphasis(assembly.name, nodeSet, edgeSet);
        });

        this.restoreUnsub = eventBus.subscribe('assembly:normal', data => {
            const { nodeSet, edgeSet } = data
            this.restoreLinesandEdgesViaZOffset(nodeSet, edgeSet)
        });
    }

    deactivate() {
        super.deactivate();

        if (this.deemphasizeUnsub) {
            this.deemphasizeUnsub();
            this.deemphasizeUnsub = null;
        }

        if (this.restoreUnsub) {
            this.restoreUnsub();
            this.restoreUnsub = null;
        }
    }

}

export default PCAChartLook
