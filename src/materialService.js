import * as THREE from 'three';
import vertexShader from '../shaders/animated-arrow.vert.glsl?raw';
import fragmentShader from '../shaders/animated-arrow.frag.glsl?raw';
import { createGradientTexture } from './utils/textureService.js';
import textureService from './utils/textureService.js';
import { textures } from './utils/textureLibrary.js';
import {getAppleCrayonColorByName} from "./utils/color/color.js"
import {LineMaterial} from "three/addons/lines/LineMaterial.js"
import Look from "./look.js"
import lineMaterialResolutionService from './lineMaterialResolutionService.js'

// Material type constants
const MATERIAL_TYPES =
    {
        DEEMPHASIS: 'deemphasisMaterial',
        EMPHASIS: 'emphasisMaterial'
    };

class MaterialService {

    constructor() {
        // Cache for LineMaterials to avoid creating duplicates
        this.lineMaterialCache = new Map();
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

    getEdgeDeemphasisMaterial() {
        return colorRampArrowMaterialFactory(getAppleCrayonColorByName('mercury'), getAppleCrayonColorByName('mercury'), this.getTexture('arrow-white'), 1, MATERIAL_TYPES.DEEMPHASIS);
    }

    getEdgeEmphasisMaterial(color) {
        return colorRampArrowMaterialFactory(color, color, this.getTexture('arrow-white'), 1, MATERIAL_TYPES.EMPHASIS);
    }

    getNodeDeemphasisMaterial(nodeName) {
        const cacheKey = `${nodeName}:deemphasis`;

        // Check if we already have this material cached
        if (this.lineMaterialCache.has(cacheKey)) {
            return this.lineMaterialCache.get(cacheKey);
        }

        const material = new LineMaterial({
            color: getAppleCrayonColorByName('mercury'),
            linewidth: Look.NODE_LINE_DEEMPHASIS_WIDTH,
            worldUnits: true,
            opacity: 1,
            transparent: true,
            // depthWrite: false
        });
        material.materialType = MATERIAL_TYPES.DEEMPHASIS;

        // Register with resolution service for automatic resolution updates
        lineMaterialResolutionService.registerMaterial(material);

        // Cache the material
        this.lineMaterialCache.set(cacheKey, material);

        return material;
    }

    getTexture(name) {
        return textureService.getTexture(name);
    }

    clear(){

        console.log(`MaterialService clear material cache pre ${ this.lineMaterialCache.size }`)
        this.lineMaterialCache.clear()
        console.log(`MaterialService clear material cache post ${ this.lineMaterialCache.size }`)
    }

    /**
     * Dispose of all cached LineMaterials and clear the cache
     */
    dispose() {
        // Unregister all cached LineMaterials from the resolution service
        for (const material of this.lineMaterialCache.values()) {
            lineMaterialResolutionService.unregisterMaterial(material);
        }

        // Clear the LineMaterial cache
        this.lineMaterialCache.clear();
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
function colorRampArrowMaterialFactory(startColor, endColor, heroTexture, opacity = 1, materialType = null) {

    // Configure hero texture wrapping
    heroTexture.wrapS = THREE.RepeatWrapping;
    heroTexture.wrapT = THREE.RepeatWrapping;
    heroTexture.needsUpdate = true;

    const uniforms = {
        startColor: { value: startColor },
        endColor: { value: endColor },
        map: { value: heroTexture },
        gradientMap: { value: createGradientTexture() },
        uvOffset: { value: new THREE.Vector2(0.0, 0.0) },
        opacity: { value: opacity }
    }

    // Create the shader material
    const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, transparent:true, side:THREE.DoubleSide, alphaTest:0.1, depthWrite:true });

    // Set material type if provided
    if (materialType) {
        material.materialType = materialType;
    }

    return material;
}

/**
 * Creates a basic material for an arrow with a single color tint.
 *
 * @param {THREE.Texture} heroTexture - The texture to use for the arrow shape (e.g., arrow-white)
 * @param {THREE.Color} color - The color to tint the arrow
 * @returns {THREE.MeshBasicMaterial} The configured material instance
 */
function arrowMaterialFactory(heroTexture, color) {

    const material = new THREE.MeshBasicMaterial({
        color,
        map: heroTexture,
        side: THREE.DoubleSide,
        transparent: true,
        alphaTest: 0.1,
        opacity: 1,
        depthWrite: true,
    });

    // Enable texture wrapping
    material.map.wrapS = THREE.RepeatWrapping;
    material.map.wrapT = THREE.RepeatWrapping;

    return material;
}

// Create and export a singleton instance
const materialService = new MaterialService(textureService);
export default materialService;

export { arrowMaterialFactory, colorRampArrowMaterialFactory, MATERIAL_TYPES }
