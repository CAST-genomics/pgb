import Look from "./look.js"
import {colorComplements, getRandomVibrantAppleCrayonColor, lerpAppleCrayonColors} from "./utils/color.js"
import pangenomeResource from "./pangenomeResource.js"
import GenomicService from "./genomicService.js"

class HeatmapLook extends Look {
    constructor(name, config) {
        super(name, config)
    }

    getNodeColor(nodeName) {
        const {superPopulationPercentage } = this.genomicService.nodeMetadata.get(nodeName)
        const lerped = lerpAppleCrayonColors('aqua', colorComplements.get('aqua'), superPopulationPercentage)
        return lerped
    }

    getEdgeColors(startNode, endNode, edgeKey) {
        const {superPopulationPercentage:spp0 } = this.genomicService.nodeMetadata.get(startNode)
        const {superPopulationPercentage:spp1 } = this.genomicService.nodeMetadata.get(endNode)

        const startColor = lerpAppleCrayonColors('aqua', colorComplements.get('aqua'), spp0)
        const endColor = lerpAppleCrayonColors('aqua', colorComplements.get('aqua'), spp1)

        return [ startColor, endColor ]
    }

    createNodeTooltipContent(nodeObject) {
        const { nodeName } = nodeObject.userData;
        const assemblies = this.genomicService.getAssemblyListForNodeName(nodeName);
        const raw = GenomicService.getRayAssemblyNames(assemblies)

        // Get ancestry breakdown HTML from PangenomeResource
        const ancestryHTML = pangenomeResource.getAncestryBreakdownHTML(raw);

        return `<div><strong>Node:</strong> ${nodeName}</div>${ancestryHTML}`;
    }

    static createHeatmapLook(name, config) {
        return new HeatmapLook(name, config);
    }
}

export default HeatmapLook
