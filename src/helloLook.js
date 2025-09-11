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

}

export default HelloLook
