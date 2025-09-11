import Look from "./look.js"
import {colorComplements, getRandomVibrantAppleCrayonColor, lerpAppleCrayonColors} from "./utils/color.js"

class HeatmapLook extends Look {
    constructor(name, config) {
        super(name, config)
    }

    getNodeColor(nodeName) {
        const {superPopulationPercentage } = this.genomicService.nodeMetadata.get(nodeName)
        const lerped = lerpAppleCrayonColors(colorComplements.get('aqua'), 'aqua', superPopulationPercentage)
        return lerped
    }

    getEdgeColors(startNode, endNode, edgeKey) {
        const {superPopulationPercentage:spp0 } = this.genomicService.nodeMetadata.get(startNode)
        const {superPopulationPercentage:spp1 } = this.genomicService.nodeMetadata.get(endNode)

        const startColor = lerpAppleCrayonColors(colorComplements.get('aqua'), 'aqua', spp0)
        const endColor = lerpAppleCrayonColors(colorComplements.get('aqua'), 'aqua', spp1)

        return [ startColor, endColor ]
    }

    static createHeatmapLook(name, config) {
        return new HeatmapLook(name, config);
    }
}

export default HeatmapLook
