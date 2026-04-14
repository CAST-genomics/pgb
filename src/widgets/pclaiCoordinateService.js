/**
 * PCLACoordinateService - Manages and provides access to PCA local ancestry inference (PCLAI) coordinates
 * for genomic nodes. Processes pclai_coordinates property from JSON data, calculates bounding box statistics,
 * and converts RGB values to HTML-compatible color strings. Also processes pclai_ave_rgb property which contains
 * the average RGB values from associated PCLAI coordinates.
 * Implemented as a singleton to ensure single instance across the application.
 */
import * as THREE from 'three';

class PCLACoordinateService {
    constructor() {
        if (PCLACoordinateService.instance) {
            return PCLACoordinateService.instance;
        }

        this.coordinates = new Map(); // nodeId -> Map<coordnateKey, coordinateData>
        this.aveRgb = new Map(); // nodeId -> THREE.Color
        // The following three are populated from dataset.index on loadCoordinates().
        this.boundingBox = null; // { x: {min, max, centroid}, y: {min, max, centroid} }
        this.coordinateKeys = new Set(); // union of coordinate keys across nodes
        this.absentNodeSet = new Set(); // nodes with no valid pclai_coordinates

        PCLACoordinateService.instance = this;
    }

    /**
     * Load PCA coordinates from a parsed DatasetModel.
     *
     * Dataset-derived facts (bounding box, coordinate-key union, absent-node
     * set) are read from `dataset.index`. This service only builds the
     * runtime-only structures the index can't express: per-node THREE.Color
     * maps and the pclai_ave_rgb color map.
     */
    loadCoordinates(dataset) {
        this.coordinates.clear();
        this.aveRgb.clear();

        // Index-derived state
        this.boundingBox = dataset.index.pclaiBoundingBox;
        this.coordinateKeys = dataset.index.pclaiCoordinateKeys;
        this.absentNodeSet = dataset.index.pclaiAbsentNodes;

        // Build runtime THREE.Color maps — can't live in the index.
        for (const [nodeId, node] of dataset.nodes) {

            if (Array.isArray(node.pclaiAveRgb) && node.pclaiAveRgb.length === 3) {
                const [r, g, b] = node.pclaiAveRgb;
                if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
                    // Data file RGB values are sRGB — tag them so Three.js converts to linear working space
                    const color = new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
                    this.aveRgb.set(nodeId, color);
                }
            }

            if (!node.pclaiCoordinates || node.pclaiCoordinates.size === 0) continue;

            const nodeCoordData = new Map();

            for (const [coordinateKey, entries] of node.pclaiCoordinates) {
                const entry = entries[0];
                if (!entry || !Array.isArray(entry.coordinates) || entry.coordinates.length !== 2 || !Array.isArray(entry.rgb) || entry.rgb.length !== 3) {
                    continue;
                }

                const [r, g, b] = entry.rgb;
                const rgbThreeJS = new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
                const rgbString = `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;

                nodeCoordData.set(coordinateKey, { coordinates: entry.coordinates, rgbThreeJS, rgbString });
            }

            if (nodeCoordData.size > 0) {
                this.coordinates.set(nodeId, nodeCoordData);
            }
        }

        console.log(`PCLACoordinateService: Loaded coordinates for ${this.coordinates.size} nodes, ${this.absentNodeSet.size} absent nodes`);
        if (this.boundingBox) {
            console.log(`PCLACoordinateService: Bounding box - x: [${this.boundingBox.x.min.toFixed(3)}, ${this.boundingBox.x.max.toFixed(3)}], y: [${this.boundingBox.y.min.toFixed(3)}, ${this.boundingBox.y.max.toFixed(3)}]`);
        }
    }

    /**
     * Get all assemblies with their coordinates and colors for a specific node
     * @param {string} nodeId - The node identifier (e.g., "5504+")
     * @returns {Map<string, Object>|null} Map of coordnateKey -> {coordinates: [x, y], color: "rgb(r, g, b)", coordnateKey}, or null if node not found
     */
    getCoordinatesForNode(nodeId) {
        const nodeCoords = this.coordinates.get(nodeId);
        if (!nodeCoords) {
            return null;
        }
        // Return a copy to prevent external modification
        return new Map(nodeCoords);
    }

    /**
     * Get a map of node IDs to Three.js Color objects for a specific coordinate key
     * Returns a map where each node that has the given coordinate key is mapped to its corresponding Three.js Color.
     * @param {string} coordinateKey - The coordinate key (e.g., "HG00097#1")
     * @returns {Map<string, THREE.Color>} Map of nodeId -> THREE.Color for nodes that have the coordinate key
     */
    getNodeColorMapForCoordinateKey(coordinateKey) {
        const nodeColorMap = new Map();

        // Iterate through all nodes that have PCLAI coordinates
        for (const [nodeId, nodeCoords] of this.coordinates.entries()) {
            // Check if this node has the requested coordinate key
            const coordinateData = nodeCoords.get(coordinateKey);
            if (coordinateData) {
                // Clone the Three.js Color to prevent external modification
                nodeColorMap.set(nodeId, coordinateData.rgbThreeJS.clone());
            }
        }

        return nodeColorMap;
    }

    /**
     * Get coordinate structures for a specific coordinate key across all nodes
     * Traverses every node and returns the coordinate structures (coordinates, RGB values) for the given coordinate key.
     * @param {string} coordinateKey - The coordinate key (e.g., "HG00097#1")
     * @returns {Map<string, Object>} Map of nodeId -> {coordinates: [x, y], rgbThreeJS: THREE.Color, rgbString: string} for nodes that have the coordinate key
     */
    getCoordinatesForCoordinateKey(coordinateKey) {
        const coordinateStructures = new Map();

        // Iterate through all nodes that have PCLAI coordinates
        for (const [nodeId, nodeCoords] of this.coordinates.entries()) {
            // Check if this node has the requested coordinate key
            const coordinateData = nodeCoords.get(coordinateKey);
            if (coordinateData) {
                // Return a copy of the coordinate structure to prevent external modification
                coordinateStructures.set(nodeId, {
                    coordinates: [...coordinateData.coordinates], // Copy the coordinates array
                    rgbThreeJS: coordinateData.rgbThreeJS.clone(), // Clone the Three.js Color
                    rgbString: coordinateData.rgbString // String is immutable, no need to copy
                });
            }
        }

        return coordinateStructures;
    }

    /**
     * Get all node IDs that have PCLAI coordinates
     * Returns a list of node IDs that are guaranteed to have PCLAI coordinate data.
     * Any node ID in this list will have non-null data when retrieving coordinate information.
     * @returns {string[]} Array of node IDs that have PCLAI coordinates
     */
    getNodeIdsWithPCLAICoordinates() {
        return Array.from(this.coordinates.keys());
    }

    /**
     * Get node IDs that contain a specific coordinate key
     * Returns a list of node IDs that have the specified coordinate key in their PCLAI coordinates.
     * Only nodes that contain the given coordinate key are included in the result.
     * @param {string} coordinateKey - The coordinate key to search for (e.g., "HG00097#1")
     * @returns {string[]} Array of node IDs that contain the specified coordinate key
     */
    getNodeIdsWithCoordinateKey(coordinateKey) {
        const nodeIds = [];

        // Iterate through all nodes that have PCLAI coordinates
        for (const [nodeId, nodeCoords] of this.coordinates.entries()) {
            // Check if this node has the requested coordinate key
            if (nodeCoords.has(coordinateKey)) {
                nodeIds.push(nodeId);
            }
        }

        return nodeIds;
    }

    /**
     * Get all coordinate keys (union across all nodes)
     * Returns a list of all coordinate keys found in any node's PCLAI coordinates structure.
     * This is the union of all coordinate keys across all nodes.
     * @returns {string[]} Array of all coordinate keys
     */
    getAllCoordinateKeys() {
        return Array.from(this.coordinateKeys);
    }

    /**
     * Get the bounding box of all coordinates
     * @returns {Object|null} Bounding box object with x and y min/max/centroid, or null if no coordinates loaded
     */
    getBoundingBox() {
        if (!this.boundingBox) {
            return null;
        }
        // Return a copy to prevent external modification
        return {
            x: { ...this.boundingBox.x },
            y: { ...this.boundingBox.y }
        };
    }

    /**
     * Get the average RGB color as a Three.js Color object for a specific node
     * @param {string} nodeId - The node identifier (e.g., "5504+")
     * @returns {THREE.Color|null} Three.js Color object, or null if not found
     */
    getAveRgbColor(nodeId) {
        const aveRgbData = this.aveRgb.get(nodeId);
        if (!aveRgbData) {
            return null;
        }
        // Return a clone to prevent external modification
        return aveRgbData.color.clone();
    }

    /**
     * Get the average RGB array for a specific node
     * @param {string} nodeId - The node identifier (e.g., "5504+")
     * @returns {number[]|null} RGB array [r, g, b], or null if not found
     */
    getAveRgbArrayForNode(nodeId) {
        const aveRgbData = this.aveRgb.get(nodeId);
        if (!aveRgbData) {
            return null;
        }
        // Return a copy to prevent external modification
        return [...aveRgbData.rgb];
    }

    /**
     * Check if a node has average RGB data
     * @param {string} nodeId - The node identifier
     * @returns {boolean} True if node has average RGB data, false otherwise
     */
    hasAveRgb(nodeId) {
        return this.aveRgb.has(nodeId);
    }

    /**
     * Check if the dataset contains any PCLAI coordinate data
     * @returns {boolean} True if any nodes have PCLAI coordinates loaded, false otherwise
     */
    hasPCLAIData() {
        return this.coordinates.size > 0;
    }

    static presentationLabel(coordinateKey) {
        const [ assembly_name, haplotype ] = coordinateKey.split('#')
        return [ `${assembly_name}`, `${ haplotype }` ]
    }

    /**
     * Get the set of node IDs that have no pclai_coordinates
     * @returns {Set<string>} Set of absent node IDs
     */
    getAbsentNodeSet() {
        return this.absentNodeSet;
    }

    /**
     * Clear all stored coordinate data
     */
    clear() {
        this.coordinates.clear();
        this.aveRgb.clear();
        this.boundingBox = null;
        this.coordinateKeys = new Set();
        this.absentNodeSet = new Set();
    }
}

// Create and export the singleton instance
const pclaiCoordinateService = new PCLACoordinateService();

export { PCLACoordinateService, pclaiCoordinateService };

