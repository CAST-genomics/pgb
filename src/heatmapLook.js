import Look from "./look.js"
import {colorComplements, getRandomVibrantAppleCrayonColor, lerpAppleCrayonColors, getHeatmapColorHSLInterpolation} from "./utils/color.js"
import {assemblyMetadataService } from "./assemblyMetadataService.js"
import eventBus from "./utils/eventBus.js"
import materialService from "./materialService.js"

class HeatmapLook extends Look {
    constructor(name, config) {
        super(name, config)
        this.interpolant = null
    }

    getNodeColor(nodeName) {
        const {aggregateSuperpopulationFrequency, frequency } = this.genomicService.nodeMetadata.get(nodeName)
        return getHeatmapColorHSLInterpolation('aqua', colorComplements.get('aqua'), aggregateSuperpopulationFrequency)
    }

    getEdgeColors(startNode, endNode, edgeKey) {

        const {aggregateSuperpopulationFrequency:spf0, frequency:f0 } = this.genomicService.nodeMetadata.get(startNode)
        const startColor = getHeatmapColorHSLInterpolation('aqua', colorComplements.get('aqua'), spf0)

        const {aggregateSuperpopulationFrequency:spf1, frequency:f1 } = this.genomicService.nodeMetadata.get(endNode)
        const endColor = getHeatmapColorHSLInterpolation('aqua', colorComplements.get('aqua'), spf1)

        return [ startColor, endColor ]
    }

    createNodeTooltipContent(nodeObject) {
        const { nodeName } = nodeObject.userData;
        return assemblyMetadataService.getDemographicBreakdownHTML(nodeName)
    }

    static createHeatmapLook(name, config) {
        return new HeatmapLook(name, config);
    }

    activate() {
        super.activate();

        this.superpopDeselectUnsub = eventBus.subscribe('superpopulation:deselected', data => {
            console.log('Heatmap received superpopulation button deselection')
        });

        this.superpopSelectUnsub = eventBus.subscribe('superpopulation:selected', data => {
            console.log('Heatmap received superpopulation button selection')
        });
    }

    deactivate() {
        super.deactivate();

        if (this.superpopDeselectUnsub) {
            this.superpopDeselectUnsub();
            this.superpopDeselectUnsub = null;
        }

        if (this.superpopSelectUnsub) {
            this.superpopSelectUnsub();
            this.superpopSelectUnsub = null;
        }
    }

    dispose() {

        super.dispose()

    }

}

export default HeatmapLook
