import Look from "./looks/look.js"
import RibbonMaterialFactory from "./ribbonMaterialFactory.js"

/**
 * Service to manage ribbon ShaderMaterial halfWidth uniform updates.
 * Ensures constant screen-pixel width for ribbon meshes across zoom levels.
 */
class LineMaterialResolutionService {
    constructor() {
        this.ribbonMaterials = new Set();
    }

    /**
     * Register a ribbon ShaderMaterial for halfWidth uniform updates
     * @param {THREE.ShaderMaterial} material - The ribbon material to register
     */
    registerRibbonMaterial(material) {
        if (material && material.uniforms?.halfWidth !== undefined) {
            this.ribbonMaterials.add(material);
        }
    }

    /**
     * Unregister a ribbon material from updates
     * @param {THREE.Material} material - The material to unregister
     */
    unregisterMaterial(material) {
        this.ribbonMaterials.delete(material);
    }

    update(camera, container){
        if (this.ribbonMaterials.size > 0) {
            const halfWidth = RibbonMaterialFactory.computeHalfWidth(camera, Look.NODE_LINE_WIDTH_PIXELS, container)
            for (const material of this.ribbonMaterials) {
                material.uniforms.halfWidth.value = halfWidth
            }
        }
    }

    clear(){
        this.ribbonMaterials.clear()
    }

    dispose() {
        this.ribbonMaterials.clear();
    }
}

// Create and export a singleton instance
const lineMaterialResolutionService = new LineMaterialResolutionService();
export default lineMaterialResolutionService;
