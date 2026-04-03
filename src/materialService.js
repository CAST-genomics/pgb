import * as THREE from 'three';
import vertexShader from '../shaders/animated-arrow.vert.glsl?raw';
import fragmentShader from '../shaders/animated-arrow.frag.glsl?raw';
import arrowFragmentShader from '../shaders/arrow.frag.glsl?raw';
import { createGradientTexture } from './utils/textureService.js';
import textureService from './utils/textureService.js';
import { textures } from './utils/textureLibrary.js';
class MaterialService {

    constructor() {
    }

    /**
     * Initialize the texture service with the texture library
     * @returns {Promise<void>}
     */
    async initializeTextureService(textures) {
        await textureService.initialize(textures);
    }

    async initialize() {
        await this.initializeTextureService({ textures });
    }

    getTexture(name) {
        return textureService.getTexture(name);
    }

    clear(){
    }

    dispose() {
    }
}

/**
 * Creates a material that blends between two colors using a gradient texture
 * while maintaining the shape of the provided hero texture.
 *
 * @param {THREE.Color} startColor - The color at the start of the gradient
 * @param {THREE.Color} endColor - The color at the end of the gradient
 * @param {THREE.Texture} heroTexture - The texture to use for the arrow shape (e.g., arrow-white)
 * @param {number} [opacity=1] - The opacity of the material (0.0 to 1.0)
 * @param {string} [materialType] - Optional material type identifier
 * @returns {THREE.ShaderMaterial} The configured material instance
 */
function colorRampArrowMaterialFactory(startColor, endColor, heroTexture, opacity = 1) {

    // Configure hero texture wrapping
    heroTexture.wrapS = THREE.RepeatWrapping;
    heroTexture.wrapT = THREE.RepeatWrapping;
    heroTexture.needsUpdate = true;

    const uniforms =
        {
        startColor:
            {
                value: new THREE.Color(startColor)
            },
        endColor:
            {
                value: new THREE.Color(endColor)
            },
        map:
            {
                value: heroTexture
            },
        gradientMap:
            {
                value: createGradientTexture()
            },
        opacity:
            {
                value: opacity
            }
    }

    return new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, transparent:true, side:THREE.DoubleSide, alphaTest:0.1, depthWrite:true });
}

/**
 * Creates an arrow material with a single color and the arrow texture shape.
 *
 * @param {THREE.Color|string} color - The arrow color
 * @param {THREE.Texture} heroTexture - The texture for the arrow shape (e.g., arrow-white)
 * @param {number} [opacity=1] - The opacity (0.0 to 1.0)
 * @returns {THREE.ShaderMaterial}
 */
function arrowMaterialFactory(color, heroTexture, opacity = 1) {

    heroTexture.wrapS = THREE.RepeatWrapping;
    heroTexture.wrapT = THREE.RepeatWrapping;
    heroTexture.needsUpdate = true;

    const uniforms = {
        color: { value: new THREE.Color(color) },
        map: { value: heroTexture },
        opacity: { value: opacity }
    }

    return new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader: arrowFragmentShader, transparent: true, side: THREE.DoubleSide, alphaTest: 0.1, depthWrite: true });
}

// Create and export a singleton instance
const materialService = new MaterialService(textureService);
export default materialService;

export { arrowMaterialFactory, colorRampArrowMaterialFactory }
