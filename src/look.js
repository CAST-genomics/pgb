import * as THREE from 'three'
import lineMaterialResolutionService from "./lineMaterialResolutionService.js"
import GeometryFactory from "./geometryFactory.js"
import ParametricLine from "./parametricLine.js"
import materialService, {colorRampArrowMaterialFactory} from "./materialService.js"
import {LineMaterial} from "three/addons/lines/LineMaterial.js"
import GenomicService from "./genomicService.js"

class Look {

    // pixel units
    static NODE_LINE_WIDTH_PIXELS = 2*2;
    static NODE_LINE_DEEMPHASIS_WIDTH_PIXELS = 2*2;

    // world units
    static NODE_LINE_WIDTH = 16;
    static NODE_LINE_DEEMPHASIS_WIDTH = 16;

    constructor(name, config) {
        this.name = name

        this.genomicService = config.genomicService
        this.geometryManager = config.geometryManager
        this.assemblyWidget = config.assemblyWidget; // Access to assembly widget for selected assembly info

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

    updateBehavior(deltaTime, scene) {
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

        const {nodeName} = context

        const material = this.getNodeMaterial(nodeName);

        const mesh = new ParametricLine(geometry, material);

        // Set up user data
        mesh.userData = {
            nodeName,
            geometryKey: `node:${nodeName}`,
            type: 'node',
        };

        return mesh;
    }

    getNodeMaterial(nodeName) {

        const cacheKey = Look.getCacheKey(nodeName);

        // Check if we already have this material cached
        if (this.materialCache.has(cacheKey)) {
            return this.materialCache.get(cacheKey);
        }

        const material = new LineMaterial({
            color: this.getNodeColor(nodeName),
            linewidth: Look.NODE_LINE_WIDTH,
            worldUnits: true,
            opacity: 1,
            transparent: true
        });

        // Register with resolution service for automatic resolution updates
        lineMaterialResolutionService.registerMaterial(material);

        // Cache the material
        this.materialCache.set(cacheKey, material);

        return material;
    }

    getNodeColor(nodeName) {
        const str = 'getNodeColor() must be implemented by subclass'
        console.error(str)
        return null
    }

    createEdgeMesh(geometry, context) {

        const { startNode, endNode, edgeKey } = context;

        const [ startColor, endColor ] = this.getEdgeColors(startNode, endNode, edgeKey)
        const material = this.getEdgeMaterial(startColor, endColor)

        const mesh = new THREE.Mesh(geometry, material);

        mesh.userData =
            {
                nodeNameStart: startNode,
                nodeNameEnd: endNode,
                geometryKey: edgeKey,
                type: 'edge',
            };

        return mesh;
    }

    getEdgeMaterial(startColor, endColor) {
        return colorRampArrowMaterialFactory(startColor, endColor, materialService.getTexture('arrow-white'), 1);
    }

    getEdgeColors(startNode, endNode, edgeKey) {
        const str = 'getEdgeColors() must be implemented by subclass'
        console.error(str)
        return []
    }

    /**
     * Called when this look becomes active
     * Subclasses should override to enable event subscriptions
     */
    activate() {
        this.isActive = true;
        console.log(`${this.constructor.name} is now active`)
    }

    /**
     * Called when this look becomes inactive
     * Subclasses should override to disable event subscriptions
     */
    deactivate() {
        this.isActive = false;
    }

    createNodeTooltipContent(nodeObject) {
        const { nodeName } = nodeObject.userData;
        const assemblies = this.genomicService.getAssemblyListForNodeName(nodeName);

        // Group assemblies by assembly name, then sort within each group by haplotype
        const assemblyGroups = {};
        assemblies.forEach(assembly => {
            const parts = assembly.split('#');
            const assemblyName = parts[0];
            if (!assemblyGroups[assemblyName]) {
                assemblyGroups[assemblyName] = [];
            }
            assemblyGroups[assemblyName].push(assembly);
        });

        // Sort each group by haplotype and flatten into a single array
        const sortedAssemblies = Object.keys(assemblyGroups)
            .sort() // Sort assembly names alphabetically
            .flatMap(assemblyName =>
                assemblyGroups[assemblyName].sort((a, b) => {
                    const haplotypeA = a.split('#')[1];
                    const haplotypeB = b.split('#')[1];
                    return haplotypeA.localeCompare(haplotypeB);
                })
            );

        const selectedAssembly = this.assemblyWidget?.selectedAssembly;

        // Create table rows with 4 columns
        const tableRows = [];
        for (let i = 0; i < sortedAssemblies.length; i += 4) {
            const row = sortedAssemblies.slice(i, i + 4);
            let cells = row.map(assembly => {

                let isSelected
                if (selectedAssembly) {
                    isSelected = selectedAssembly && assembly === selectedAssembly.name
                } else {
                    isSelected = false
                }

                const colorStyle = true === isSelected ? `style="color: ${selectedAssembly.color}; font-weight: bold;"` : ''

                const [ assemblyName, haplotype ] = GenomicService.presentationAssemblyLabel(assembly);

                // HG00438&thinsp;&middot;&thinsp;h2
                const str = `${assemblyName}&middot;hap${haplotype}`
                return `<td class="assembly-cell" ${colorStyle}>${str}</td>`;
            }).join('');

            // Pad with empty cells if needed
            while (row.length < 4) {
                cells += '<td class="assembly-cell empty"></td>';
                row.push('');
            }
            tableRows.push(`<tr>${cells}</tr>`);
        }

        return `<div class="look-tooltip">
            <div class="node-section">
                <!-- <div class="node-title">Node: ${nodeName}</div> -->
                <div class="assembly-table-container">
                    <div class="assembly-table-title">Assemblies</div>
                    <table class="assembly-table">
                        ${tableRows.join('')}
                    </table>
                </div>
            </div>
        </div>`
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

    static getCacheKey(nodeName) {
        return `${this.constructor.name}:${nodeName}:normal`;
    }

}

export default Look;
