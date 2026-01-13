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

        this.coordinates = new Map(); // nodeId -> Map<assemblyKey, coordinateData>
        this.aveRgb = new Map(); // nodeId -> {rgb: [r, g, b], color: THREE.Color}
        this.boundingBox = null; // { x: {min, max, centroid}, y: {min, max, centroid} }

        PCLACoordinateService.instance = this;
    }

    /**
     * Load PCA coordinates from JSON data
     * @param {Object} jsonData - The JSON data containing node information
     */
    loadCoordinates(jsonData) {
        this.coordinates.clear();
        this.aveRgb.clear();
        this.boundingBox = null;

        const allXCoords = [];
        const allYCoords = [];
        let nodesProcessed = 0;

        for (const [nodeId, nodeData] of Object.entries(jsonData.node)) {
            const pclaiCoords = nodeData.pclai_coordinates;
            const pclaiAveRgb = nodeData.pclai_ave_rgb;

            // Process pclai_ave_rgb if present
            if (Array.isArray(pclaiAveRgb) && pclaiAveRgb.length === 3) {
                const [r, g, b] = pclaiAveRgb;
                // Validate RGB values are valid numbers
                if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
                    const color = new THREE.Color(r / 255, g / 255, b / 255);
                    this.aveRgb.set(nodeId, color);
                }
            }

            // Skip nodes with null, undefined, or empty pclai_coordinates
            if (!pclaiCoords || typeof pclaiCoords !== 'object' || Object.keys(pclaiCoords).length === 0) {
                continue;
            }

            const nodeCoordinates = new Map();

            // Process each assembly entry in pclai_coordinates
            for (const [assemblyKey, assemblyData] of Object.entries(pclaiCoords)) {
                // Skip entries with missing or invalid data
                if (!assemblyData || typeof assemblyData !== 'object') {
                    continue;
                }

                const coords = assemblyData.coordinates;
                const rgb = assemblyData.RGB;

                // Validate coordinates array has exactly 2 elements [x, y]
                if (!Array.isArray(coords) || coords.length !== 2) {
                    continue;
                }

                // Validate RGB array has exactly 3 elements [r, g, b]
                if (!Array.isArray(rgb) || rgb.length !== 3) {
                    continue;
                }

                // Ensure all RGB values are valid numbers
                const [r, g, b] = rgb;
                if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
                    continue;
                }

                // Ensure all coordinate values are valid numbers
                const [x, y] = coords;
                if (!Number.isFinite(x) || !Number.isFinite(y)) {
                    continue;
                }

                // Convert RGB array to HTML color string
                const color = `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;

                // Store processed data
                nodeCoordinates.set(assemblyKey, {
                    coordinates: [x, y],
                    color: color,
                    assemblyKey: assemblyKey
                });

                // Collect coordinates for bounding box calculation
                allXCoords.push(x);
                allYCoords.push(y);
            }

            // Only store node if it has at least one valid coordinate entry
            if (nodeCoordinates.size > 0) {
                this.coordinates.set(nodeId, nodeCoordinates);
                nodesProcessed++;
            }
        }

        // Calculate bounding box from all collected coordinates
        if (allXCoords.length > 0 && allYCoords.length > 0) {
            const minX = Math.min(...allXCoords);
            const maxX = Math.max(...allXCoords);
            const minY = Math.min(...allYCoords);
            const maxY = Math.max(...allYCoords);

            this.boundingBox = {
                x: {
                    min: minX,
                    max: maxX,
                    centroid: (minX + maxX) / 2
                },
                y: {
                    min: minY,
                    max: maxY,
                    centroid: (minY + maxY) / 2
                }
            };
        }

        console.log(`PCLACoordinateService: Loaded coordinates for ${nodesProcessed} nodes`);
        if (this.boundingBox) {
            console.log(`PCLACoordinateService: Bounding box - x: [${this.boundingBox.x.min.toFixed(3)}, ${this.boundingBox.x.max.toFixed(3)}], y: [${this.boundingBox.y.min.toFixed(3)}, ${this.boundingBox.y.max.toFixed(3)}]`);
        }
    }

    /**
     * Get all assemblies with their coordinates and colors for a specific node
     * @param {string} nodeId - The node identifier (e.g., "5504+")
     * @returns {Map<string, Object>|null} Map of assemblyKey -> {coordinates: [x, y], color: "rgb(r, g, b)", assemblyKey}, or null if node not found
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
     * Get coordinates and color for a specific node and assembly
     * @param {string} nodeId - The node identifier (e.g., "5504+")
     * @param {string} assemblyKey - The assembly key (e.g., "HG00097#1")
     * @returns {Object|null} Object with {coordinates: [x, y], color: "rgb(r, g, b)", assemblyKey}, or null if not found
     */
    getCoordinatesForNodeAndAssembly(nodeId, assemblyKey) {
        const nodeCoords = this.coordinates.get(nodeId);
        if (!nodeCoords) {
            return null;
        }
        const assemblyData = nodeCoords.get(assemblyKey);
        if (!assemblyData) {
            return null;
        }
        // Return a copy to prevent external modification
        return { ...assemblyData };
    }

    /**
     * Get coordinate data for a specific node (alias for getCoordinatesForNode for backward compatibility)
     * @param {string} nodeId - The node identifier
     * @returns {Map<string, Object>|null} Map of assemblyKey -> coordinateData, or null if not found
     */
    getCoordinates(nodeId) {
        return this.getCoordinatesForNode(nodeId);
    }

    /**
     * Check if a node has coordinate data
     * @param {string} nodeId - The node identifier
     * @returns {boolean} True if node has coordinates, false otherwise
     */
    hasCoordinates(nodeId) {
        return this.coordinates.has(nodeId);
    }

    /**
     * Get all node IDs that have coordinate data
     * @returns {string[]} Array of node IDs
     */
    getAllNodeIds() {
        return Array.from(this.coordinates.keys());
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
     * Clear all stored coordinate data
     */
    clear() {
        this.coordinates.clear();
        this.aveRgb.clear();
        this.boundingBox = null;
    }

    /**
     * Get the singleton instance
     * @returns {PCLACoordinateService} The singleton instance
     */
    static getInstance() {
        if (!PCLACoordinateService.instance) {
            PCLACoordinateService.instance = new PCLACoordinateService();
        }
        return PCLACoordinateService.instance;
    }
}

// Create and export the singleton instance
const pclaiCoordinateService = new PCLACoordinateService();

export { PCLACoordinateService, pclaiCoordinateService };

