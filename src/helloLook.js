import Look from "./look.js"
import {getRandomVibrantAppleCrayonColor} from "./utils/color.js"

class HelloLook extends Look {
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

    static createHelloLook(name, config) {
        return new HelloLook(name, config);
    }
}

export default HelloLook
