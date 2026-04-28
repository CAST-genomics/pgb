/**
 * PCLACoordinateService - Manages and provides access to PCA local ancestry inference (PCLAI) coordinates
 * for genomic nodes. Builds per-coordinate-system runtime structures from a parsed DatasetModel and
 * exposes only the active system through its public surface, so widgets and looks see a single
 * coordinate space at a time.
 *
 * v3 datasets carry two coordinate systems ('hg38' and 'asm'); v1/v2 datasets are tagged 'hg38'.
 * Toggling between systems is a future UI concern — `setActiveSystem` is the seam.
 *
 * Implemented as a singleton to ensure single instance across the application.
 */
import * as THREE from 'three';
import eventBus from '../utils/eventBus.ts';

const DEFAULT_SYSTEM = 'hg38';

class PCLACoordinateService {
    constructor() {
        if (PCLACoordinateService.instance) {
            return PCLACoordinateService.instance;
        }

        // Per-system runtime caches:
        //   coordinatesBySystem: system -> Map<nodeId, Map<coordKey, { coordinates, rgbThreeJS, rgbString }>>
        //   coordinateKeysBySystem: system -> Set<coordKey>
        //   boundingBoxBySystem: system -> { x:{min,max,centroid}, y:{...} }
        this.coordinatesBySystem = new Map();
        this.coordinateKeysBySystem = new Map();
        this.boundingBoxBySystem = new Map();

        this.aveRgb = new Map(); // nodeId -> THREE.Color (system-independent)
        this.absentNodeSet = new Set(); // nodes with no valid pclai coords in any system

        this.activeSystem = DEFAULT_SYSTEM;

        PCLACoordinateService.instance = this;
    }

    /**
     * Load PCA coordinates from a parsed DatasetModel.
     *
     * Builds per-system runtime structures and resets the active system to the
     * default ('hg38'). Index-derived facts (bounding box, coordinate keys,
     * absent nodes) are read from `dataset.index`.
     */
    loadCoordinates(dataset) {
        this.coordinatesBySystem.clear();
        this.coordinateKeysBySystem.clear();
        this.boundingBoxBySystem.clear();
        this.aveRgb.clear();

        // Per-system index → service caches.
        for (const [system, keys] of dataset.index.pclaiCoordinateKeysBySystem) {
            this.coordinateKeysBySystem.set(system, keys);
        }
        for (const [system, bbox] of dataset.index.pclaiBoundingBoxBySystem) {
            this.boundingBoxBySystem.set(system, bbox);
        }
        this.absentNodeSet = dataset.index.pclaiAbsentNodes;

        // Build per-system runtime THREE.Color maps.
        for (const [nodeId, node] of dataset.nodes) {

            if (Array.isArray(node.pclaiAveRgb) && node.pclaiAveRgb.length === 3) {
                const [r, g, b] = node.pclaiAveRgb;
                if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
                    const color = new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
                    this.aveRgb.set(nodeId, color);
                }
            }

            if (!node.pclaiCoordinatesBySystem) continue;

            for (const [system, sysMap] of node.pclaiCoordinatesBySystem) {
                if (!sysMap || sysMap.size === 0) continue;

                const nodeCoordData = new Map();
                for (const [coordinateKey, entries] of sysMap) {
                    const entry = entries[0];
                    if (!entry || !Array.isArray(entry.coordinates) || entry.coordinates.length !== 2 || !Array.isArray(entry.rgb) || entry.rgb.length !== 3) {
                        continue;
                    }

                    const [r, g, b] = entry.rgb;
                    const rgbThreeJS = new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
                    const rgbString = `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;

                    nodeCoordData.set(coordinateKey, { coordinates: entry.coordinates, rgbThreeJS, rgbString });
                }

                if (nodeCoordData.size === 0) continue;

                let perSystem = this.coordinatesBySystem.get(system);
                if (!perSystem) {
                    perSystem = new Map();
                    this.coordinatesBySystem.set(system, perSystem);
                }
                perSystem.set(nodeId, nodeCoordData);
            }
        }

        // Default the active system to 'hg38' if it has data; otherwise pick
        // the first system with data; otherwise leave default.
        const available = this.getAvailableSystems();
        if (available.includes(DEFAULT_SYSTEM)) {
            this.activeSystem = DEFAULT_SYSTEM;
        } else if (available.length > 0) {
            this.activeSystem = available[0];
        } else {
            this.activeSystem = DEFAULT_SYSTEM;
        }

        const activeMap = this._activeCoordinatesMap();
        const activeBox = this.boundingBoxBySystem.get(this.activeSystem);
        console.log(`PCLACoordinateService: Loaded coordinates for ${activeMap.size} nodes (system="${this.activeSystem}", available=${JSON.stringify(available)}), ${this.absentNodeSet.size} absent nodes`);
        if (activeBox) {
            console.log(`PCLACoordinateService: Bounding box - x: [${activeBox.x.min.toFixed(3)}, ${activeBox.x.max.toFixed(3)}], y: [${activeBox.y.min.toFixed(3)}, ${activeBox.y.max.toFixed(3)}]`);
        }
    }

    // ── Coordinate-system selection ─────────────────────────────────

    getActiveSystem() {
        return this.activeSystem;
    }

    /**
     * Return the list of systems that actually have data for this dataset.
     * The future UI toggle uses this to decide whether to render the control.
     */
    getAvailableSystems() {
        const out = [];
        for (const [system, perNode] of this.coordinatesBySystem) {
            if (perNode && perNode.size > 0) out.push(system);
        }
        return out;
    }

    /**
     * Switch the active coordinate system. No-op if the system has no data
     * or is already active. Publishes 'pclai-system-changed' so downstream
     * looks/widgets can refresh.
     */
    setActiveSystem(systemId) {
        if (systemId === this.activeSystem) return;
        if (!this.getAvailableSystems().includes(systemId)) return;
        this.activeSystem = systemId;
        eventBus.publish('pclai-system-changed', { system: systemId });
    }

    _activeCoordinatesMap() {
        return this.coordinatesBySystem.get(this.activeSystem) || new Map();
    }

    /**
     * Get all assemblies with their coordinates and colors for a specific node
     * @param {string} nodeId - The node identifier (e.g., "5504+")
     * @returns {Map<string, Object>|null} Map of coordnateKey -> {coordinates: [x, y], color: "rgb(r, g, b)", coordnateKey}, or null if node not found
     */
    getCoordinatesForNode(nodeId) {
        const nodeCoords = this._activeCoordinatesMap().get(nodeId);
        if (!nodeCoords) {
            return null;
        }
        return new Map(nodeCoords);
    }

    /**
     * Get a map of node IDs to Three.js Color objects for a specific coordinate key
     * @param {string} coordinateKey - The coordinate key (e.g., "HG00097#1")
     * @returns {Map<string, THREE.Color>}
     */
    getNodeColorMapForCoordinateKey(coordinateKey) {
        const nodeColorMap = new Map();
        for (const [nodeId, nodeCoords] of this._activeCoordinatesMap().entries()) {
            const coordinateData = nodeCoords.get(coordinateKey);
            if (coordinateData) {
                nodeColorMap.set(nodeId, coordinateData.rgbThreeJS.clone());
            }
        }
        return nodeColorMap;
    }

    /**
     * Get coordinate structures for a specific coordinate key across all nodes
     * @param {string} coordinateKey - The coordinate key (e.g., "HG00097#1")
     * @returns {Map<string, Object>}
     */
    getCoordinatesForCoordinateKey(coordinateKey) {
        const coordinateStructures = new Map();
        for (const [nodeId, nodeCoords] of this._activeCoordinatesMap().entries()) {
            const coordinateData = nodeCoords.get(coordinateKey);
            if (coordinateData) {
                coordinateStructures.set(nodeId, {
                    coordinates: [...coordinateData.coordinates],
                    rgbThreeJS: coordinateData.rgbThreeJS.clone(),
                    rgbString: coordinateData.rgbString
                });
            }
        }
        return coordinateStructures;
    }

    /**
     * Get all node IDs that have PCLAI coordinates in the active system.
     * @returns {string[]}
     */
    getNodeIdsWithPCLAICoordinates() {
        return Array.from(this._activeCoordinatesMap().keys());
    }

    /**
     * Get node IDs that contain a specific coordinate key (active system only).
     * @param {string} coordinateKey
     * @returns {string[]}
     */
    getNodeIdsWithCoordinateKey(coordinateKey) {
        const nodeIds = [];
        for (const [nodeId, nodeCoords] of this._activeCoordinatesMap().entries()) {
            if (nodeCoords.has(coordinateKey)) {
                nodeIds.push(nodeId);
            }
        }
        return nodeIds;
    }

    /**
     * Get all coordinate keys (union across all nodes in the active system).
     * @returns {string[]}
     */
    getAllCoordinateKeys() {
        const keys = this.coordinateKeysBySystem.get(this.activeSystem);
        return keys ? Array.from(keys) : [];
    }

    /**
     * Get the bounding box of the active system, or null if no coordinates loaded.
     */
    getBoundingBox() {
        const box = this.boundingBoxBySystem.get(this.activeSystem);
        if (!box) return null;
        return {
            x: { ...box.x },
            y: { ...box.y },
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
        return [...aveRgbData.rgb];
    }

    /**
     * Check if a node has average RGB data
     */
    hasAveRgb(nodeId) {
        return this.aveRgb.has(nodeId);
    }

    /**
     * Check if the dataset contains any PCLAI coordinate data in the active system.
     */
    hasPCLAIData() {
        return this._activeCoordinatesMap().size > 0;
    }

    static presentationLabel(coordinateKey) {
        const [ assembly_name, haplotype ] = coordinateKey.split('#')
        return [ `${assembly_name}`, `${ haplotype }` ]
    }

    /**
     * Get the set of node IDs that have no pclai_coordinates in any system.
     * @returns {Set<string>}
     */
    getAbsentNodeSet() {
        return this.absentNodeSet;
    }

    /**
     * Clear all stored coordinate data
     */
    clear() {
        this.coordinatesBySystem.clear();
        this.coordinateKeysBySystem.clear();
        this.boundingBoxBySystem.clear();
        this.aveRgb.clear();
        this.absentNodeSet = new Set();
        this.activeSystem = DEFAULT_SYSTEM;
    }
}

const pclaiCoordinateService = new PCLACoordinateService();

export { PCLACoordinateService, pclaiCoordinateService };
