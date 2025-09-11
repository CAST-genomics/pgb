import Look from "./look.js"
import {getRandomVibrantAppleCrayonColor} from "./utils/color.js"

class HeatmapLook extends Look {
    constructor(name, config) {
        super(name, config)
    }

    getNodeColor() {
        return getRandomVibrantAppleCrayonColor()
    }

    getEdgeColors() {
        const startColor = getRandomVibrantAppleCrayonColor()
        const endColor = getRandomVibrantAppleCrayonColor()
        return [ startColor, endColor ]
    }

    static createHeatmapLook(name, config) {
        return new HeatmapLook(name, config);
    }
}

export default HeatmapLook
