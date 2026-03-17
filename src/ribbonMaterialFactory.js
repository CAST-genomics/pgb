import * as THREE from 'three'
import ribbonVertexShader from '../shaders/ribbon.vert.glsl?raw'
import ribbonFragmentShader from '../shaders/ribbon.frag.glsl?raw'

class RibbonMaterialFactory {

    /**
     * Create a ShaderMaterial for ribbon mesh rendering.
     *
     * @param {THREE.Color|string|number} color - Diffuse color
     * @param {Object} [options]
     * @param {number} [options.opacity=1] - Opacity
     * @param {THREE.Texture} [options.alphaMap=null] - Alpha matte texture
     * @returns {THREE.ShaderMaterial}
     */
    static createMaterial(color, options = {}) {
        const { opacity = 1, alphaMap = null } = options

        const threeColor = color instanceof THREE.Color ? color.clone() : new THREE.Color(color)

        return new THREE.ShaderMaterial({
            uniforms: {
                diffuse: { value: threeColor },
                opacity: { value: opacity },
                halfWidth: { value: 0.0 },  // updated per frame by resolution service
                alphaMap: { value: alphaMap },
                useAlphaMap: { value: alphaMap ? 1.0 : 0.0 },
            },
            vertexShader: ribbonVertexShader,
            fragmentShader: ribbonFragmentShader,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: true,
        })
    }

    /**
     * Compute world-space half-width from screen pixels for an orthographic camera.
     *
     * @param {THREE.OrthographicCamera} camera
     * @param {number} pixelWidth - Desired width in screen pixels
     * @param {HTMLElement} container - The rendering container
     * @returns {number} Half-width in world units
     */
    static computeHalfWidth(camera, pixelWidth, container) {
        const worldPerPixel = (camera.top - camera.bottom) / (camera.zoom * container.clientHeight)
        return pixelWidth * worldPerPixel / 2
    }
}

export default RibbonMaterialFactory
