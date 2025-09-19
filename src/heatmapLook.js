import Look from "./look.js"
import {colorComplements, getRandomVibrantAppleCrayonColor, lerpAppleCrayonColors, getHeatmapColorHSLInterpolation} from "./utils/color.js"
import {assemblyMetadataService } from "./assemblyMetadataService.js"

class HeatmapLook extends Look {
    constructor(name, config) {
        super(name, config)
    }

    getNodeColor(nodeName) {
        const {aggregateSuperpopulationFrequency } = this.genomicService.nodeMetadata.get(nodeName)
        const lerped = getHeatmapColorHSLInterpolation('aqua', colorComplements.get('aqua'), aggregateSuperpopulationFrequency)
        return lerped
    }

    getEdgeColors(startNode, endNode, edgeKey) {
        const {aggregateSuperpopulationFrequency:f0 } = this.genomicService.nodeMetadata.get(startNode)
        const {aggregateSuperpopulationFrequency:f1 } = this.genomicService.nodeMetadata.get(endNode)

        const startColor = getHeatmapColorHSLInterpolation('aqua', colorComplements.get('aqua'), f0)
        const endColor = getHeatmapColorHSLInterpolation('aqua', colorComplements.get('aqua'), f1)

        return [ startColor, endColor ]
    }

    createNodeTooltipContent(nodeObject) {
        const { nodeName } = nodeObject.userData;

        const demographicHTML = assemblyMetadataService.getDemographicBreakdownHTML(nodeName);

        return `<div><strong>Node:</strong> ${nodeName}</div>${demographicHTML}`;
    }

    static createHeatmapLook(name, config) {
        return new HeatmapLook(name, config);
    }
}

export default HeatmapLook
