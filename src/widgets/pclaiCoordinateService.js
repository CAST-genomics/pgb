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
        this.aveRgb = new Map(); // nodeId -> {rgb: [r, g, b], color: THREE.Color}
        this.boundingBox = null; // { x: {min, max, centroid}, y: {min, max, centroid} }
        this.coordinateKeyRgbMap = new Map(); // coordinateKey -> {rgbString: string, rgbThreeJS: THREE.Color}

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
        this.coordinateKeyRgbMap.clear();

        const allXCoords = [];
        const allYCoords = [];
        let nodesProcessed = 0;

        // First pass: collect all RGB values for each coordinate key to find the most representative value
        const coordinateKeyRgbCollection = new Map(); // coordinateKey -> Map<roundedRGBString, {count, originalRGB}>

        // First pass: collect RGB values for each coordinate key
        for (const [nodeId, nodeData] of Object.entries(jsonData.node)) {
            const { pclai_coordinates } = nodeData;

            // Skip nodes with null, undefined, or empty pclai_coordinates
            if (!pclai_coordinates || typeof pclai_coordinates !== 'object' || Object.keys(pclai_coordinates).length === 0) {
                continue;
            }

            // Collect RGB values for each coordinate key
            for (const [coordinateKey, {RGB}] of Object.entries(pclai_coordinates)) {
                if (!Array.isArray(RGB) || RGB.length !== 3) {
                    continue;
                }

                const [r, g, b] = RGB;
                // Validate RGB values are valid numbers
                if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
                    continue;
                }

                // Round to integers for grouping similar values
                const roundedR = Math.round(r);
                const roundedG = Math.round(g);
                const roundedB = Math.round(b);
                const roundedRGBString = `${roundedR},${roundedG},${roundedB}`;

                if (!coordinateKeyRgbCollection.has(coordinateKey)) {
                    coordinateKeyRgbCollection.set(coordinateKey, new Map());
                }

                const rgbMap = coordinateKeyRgbCollection.get(coordinateKey);
                if (!rgbMap.has(roundedRGBString)) {
                    rgbMap.set(roundedRGBString, {
                        count: 0,
                        rgbSum: [0, 0, 0] // Sum of RGB values for averaging
                    });
                }
                const entry = rgbMap.get(roundedRGBString);
                entry.count++;
                entry.rgbSum[0] += r;
                entry.rgbSum[1] += g;
                entry.rgbSum[2] += b;
            }
        }

        // Determine the most representative RGB value for each coordinate key (most common rounded value)
        // Use the average RGB within the most common rounded group
        for (const [coordinateKey, rgbMap] of coordinateKeyRgbCollection.entries()) {
            let maxCount = 0;
            let mostRepresentativeRGB = null;

            for (const [roundedRGBString, {count, rgbSum}] of rgbMap.entries()) {
                if (count > maxCount) {
                    maxCount = count;
                    // Calculate average RGB for this group
                    mostRepresentativeRGB = [
                        rgbSum[0] / count,
                        rgbSum[1] / count,
                        rgbSum[2] / count
                    ];
                }
            }

            if (mostRepresentativeRGB) {
                const [r, g, b] = mostRepresentativeRGB;
                const rgbThreeJS = new THREE.Color(r / 255, g / 255, b / 255);
                const rgbString = `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
                this.coordinateKeyRgbMap.set(coordinateKey, { rgbString, rgbThreeJS });
            }
        }

        // Second pass: process coordinates and store node data
        for (const [nodeId, nodeData] of Object.entries(jsonData.node)) {
            const { pclai_coordinates, pclai_ave_rgb } = nodeData;

            // Process pclai_ave_rgb if present
            if (Array.isArray(pclai_ave_rgb) && pclai_ave_rgb.length === 3) {
                const [r, g, b] = pclai_ave_rgb;
                // Validate RGB values are valid numbers
                if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
                    const color = new THREE.Color(r / 255, g / 255, b / 255);
                    this.aveRgb.set(nodeId, color);
                }
            }

            // Skip nodes with null, undefined, or empty pclai_coordinates
            if (!pclai_coordinates || typeof pclai_coordinates !== 'object' || Object.keys(pclai_coordinates).length === 0) {
                continue;
            }

            const nodeCoordData = new Map();

            // Process each entry in pclai_coordinates
            for (const [coordinateKey, {coordinates, RGB}] of Object.entries(pclai_coordinates)) {

                if (!Array.isArray(coordinates) || coordinates.length !== 2 || !Array.isArray(RGB) || RGB.length !== 3) {
                    continue;
                }

                const [r, g, b] = RGB;
                const rgbThreeJS = new THREE.Color(r / 255, g / 255, b / 255);
                const rgbString = `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;

                const coordinateData = { coordinates, rgbThreeJS, rgbString };
                nodeCoordData.set(coordinateKey, coordinateData);

                // Collect coordinates for bounding box calculation
                const [x, y] = coordinates;
                allXCoords.push(x);
                allYCoords.push(y);
            }

            // Only store node if it has at least one valid coordinate entry
            if (nodeCoordData.size > 0) {
                console.log(`node ${ nodeId } assembly keys: ${ Array.from(nodeCoordData.keys()).join(', ') }`)
                this.coordinates.set(nodeId, nodeCoordData);
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
        console.log(`PCLACoordinateService: Built RGB map for ${this.coordinateKeyRgbMap.size} coordinate keys`);
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
     * Get the RGB color (both string and Three.js Color) for a specific coordinate key
     * @param {string} coordinateKey - The coordinate key (e.g., "HG00097#1")
     * @returns {Object|null} Object with {rgbString: string, rgbThreeJS: THREE.Color}, or null if not found
     */
    getRgbForCoordinateKey(coordinateKey) {
        const rgbData = this.coordinateKeyRgbMap.get(coordinateKey);
        if (!rgbData) {
            return null;
        }
        // Return a copy with cloned color to prevent external modification
        return {
            rgbString: rgbData.rgbString,
            rgbThreeJS: rgbData.rgbThreeJS.clone()
        };
    }

    /**
     * Get the RGB string for a specific coordinate key
     * @param {string} coordinateKey - The coordinate key (e.g., "HG00097#1")
     * @returns {string|null} RGB string (e.g., "rgb(222, 162, 255)"), or null if not found
     */
    getRgbStringForCoordinateKey(coordinateKey) {
        const rgbData = this.coordinateKeyRgbMap.get(coordinateKey);
        return rgbData ? rgbData.rgbString : null;
    }

    /**
     * Get the Three.js Color object for a specific coordinate key
     * @param {string} coordinateKey - The coordinate key (e.g., "HG00097#1")
     * @returns {THREE.Color|null} Three.js Color object, or null if not found
     */
    getRgbColorForCoordinateKey(coordinateKey) {
        const rgbData = this.coordinateKeyRgbMap.get(coordinateKey);
        if (!rgbData) {
            return null;
        }
        // Return a clone to prevent external modification
        return rgbData.rgbThreeJS.clone();
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
     * Check if the dataset contains any PCLAI coordinate data
     * @returns {boolean} True if any nodes have PCLAI coordinates loaded, false otherwise
     */
    hasPCLAIData() {
        return this.coordinates.size > 0;
    }

    /**
     * Clear all stored coordinate data
     */
    clear() {
        this.coordinates.clear();
        this.aveRgb.clear();
        this.boundingBox = null;
        this.coordinateKeyRgbMap.clear();
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

