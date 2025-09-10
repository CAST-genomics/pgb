import lineMaterialResolutionService from "./lineMaterialResolutionService.js"
import GeometryFactory from "./geometryFactory.js"

/**
 * Base Look class that provides generic material and behavior management.
 * Subclasses implement specific mesh factory methods for their domain.
 */
class Look {

    // pixel unite
    static NODE_LINE_WIDTH_PIXELS = 2*2;
    static NODE_LINE_DEEMPHASIS_WIDTH_PIXELS = 2*2;

    // world units
    static NODE_LINE_WIDTH = 16;
    static NODE_LINE_DEEMPHASIS_WIDTH = 16;

    constructor(name, config) {
        this.name = name;
        this.behaviors = config.behaviors || {};
        this.zOffset = config.zOffset || 0;

        this.isActive = false; // Track if this look is currently active

        // Material cache to avoid creating duplicate materials
        this.materialCache = new Map();

    }

    getZOffset(objectId) {

        if (objectId.startsWith('node:')) {
            return GeometryFactory.NODE_LINE_Z_OFFSET;
        } else if (objectId.startsWith('edge:')) {
            return GeometryFactory.EDGE_LINE_Z_OFFSET;
        } else {
            console.error(`ERROR: object ID ${ objectId } is not valid.`)
            return GeometryFactory.NODE_LINE_Z_OFFSET;
        }

    }

    /**
     * Update animation state (called each frame)
     * Base implementation does nothing - subclasses override for specific animation
     */
    updateBehavior(deltaTime, geometryManager) {
        // Base class has no animation by default
        // Subclasses override this method for specific animation behaviors
    }

    createMesh(geometry, context) {
        if (context.type === 'node') {
            return this.createNodeMesh(geometry, context);
        } else if (context.type === 'edge') {
            return this.createEdgeMesh(geometry, context);
        }

        throw new Error(`Unknown context type: ${context.type}`);
    }

    createNodeMesh(geometry, context) {
        throw new Error('createNodeMesh() must be implemented by subclass');
    }

    createEdgeMesh(geometry, context) {
        throw new Error('createEdgeMesh() must be implemented by subclass');
    }

    /**
     * Called when this look becomes active
     * Subclasses should override to enable event subscriptions
     */
    activate() {
        this.isActive = true;
    }

    /**
     * Called when this look becomes inactive
     * Subclasses should override to disable event subscriptions
     */
    deactivate() {
        this.isActive = false;
    }

    /**
     * Generate tooltip content for a node
     * Base implementation returns null - subclasses override to provide custom content
     * @param {Object} nodeObject - The node object with userData
     * @returns {string|null} HTML content for the tooltip, or null if no tooltip should be shown
     */
    createNodeTooltipContent(nodeObject) {
        // Base class provides no tooltip content by default
        // Subclasses override this method to provide custom node tooltip content
        return null;
    }

    dispose() {

        this.deactivate(); // Ensure we unsubscribe before disposing

        // Unregister all cached materials from the resolution service
        for (const material of this.materialCache.values()) {
            lineMaterialResolutionService.unregisterMaterial(material);
        }

        // Clear the material cache
        this.materialCache.clear();
    }
}

export default Look;
