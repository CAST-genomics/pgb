import * as THREE from 'three';

/**
 * Service to manage LineMaterial resolution updates for worldUnits: false
 * This ensures proper rendering of Line2 objects across different screen sizes and pixel densities
 */
class LineMaterialResolutionService {
    constructor() {
        this.materials = new Set();
        this.size = new THREE.Vector2();
        this.isInitialized = false;
    }

    /**
     * Initialize the service with a renderer
     * @param {THREE.WebGLRenderer} renderer - The renderer to use for getting drawing buffer size
     */
    initialize(renderer) {
        this.renderer = renderer;
        this.isInitialized = true;

        // Update all registered materials with initial resolution
        this.updateAllMaterials();
    }

    /**
     * Handle window resize events
     * Call this from your app's resize handler
     */
    handleResize() {
        this.updateAllMaterials();
    }

    /**
     * Handle pixel ratio changes
     * Call this when you change the renderer's pixel ratio
     */
    handlePixelRatioChange() {
        this.updateAllMaterials();
    }

    /**
     * Register a LineMaterial to be updated on resolution changes
     * @param {THREE.LineMaterial} material - The LineMaterial to register
     */
    registerMaterial(material) {
        if (material && material.resolution) {
            this.materials.add(material);
            // Set initial resolution if we have a renderer
            if (this.isInitialized) {
                this.updateMaterialResolution(material);
            }
        }
    }

    /**
     * Unregister a LineMaterial from resolution updates
     * @param {THREE.LineMaterial} material - The LineMaterial to unregister
     */
    unregisterMaterial(material) {
        this.materials.delete(material);
    }

    /**
     * Update resolution for a specific material
     * @param {THREE.LineMaterial} material - The material to update
     */
    updateMaterialResolution(material) {
        if (material.resolution) {
            this.renderer.getDrawingBufferSize(this.size);
            material.resolution.copy(this.size);
        }
    }

    /**
     * Update resolution for all registered materials
     * Call this on window resize or pixel ratio changes
     */
    updateAllMaterials() {

        this.renderer.getDrawingBufferSize(this.size);

        this.materials.forEach(material => {
            if (material && material.resolution) {
                material.resolution.copy(this.size);
            }
        });
    }

    /**
     * Get the current drawing buffer size
     * @returns {THREE.Vector2} The current drawing buffer size
     */
    getCurrentSize() {
        this.renderer.getDrawingBufferSize(this.size);
        return this.size.clone();
    }

    /**
     * Update line width for all registered LineMaterials
     * @param {number} worldSize - The new line width in world units
     */
    updateAllLineWidths(worldSize) {
        this.materials.forEach(material => {
            if (material && typeof material.linewidth !== 'undefined') {
                material.linewidth = worldSize;
                material.needsUpdate = true;
            }
        });
    }

    /**
     * Dispose of the service and clear all registered materials
     */
    dispose() {
        this.materials.clear();
        this.renderer = null;
        this.isInitialized = false;
    }
}

// Create and export a singleton instance
const lineMaterialResolutionService = new LineMaterialResolutionService();
export default lineMaterialResolutionService;
