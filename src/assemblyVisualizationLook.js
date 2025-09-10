import * as THREE from 'three';
import ParametricLine from './parametricLine.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import Look from './look.js';
import {colorRampArrowMaterialFactory, MATERIAL_TYPES} from './materialService.js';
import materialService from './materialService.js';
import GeometryFactory from "./geometryFactory.js"
import eventBus from "./utils/eventBus.js"
import {getAppleCrayonColorByName} from "./utils/color.js"
import { assemblyWidget } from "./main.js"
import lineMaterialResolutionService from './lineMaterialResolutionService.js'

class AssemblyVisualizationLook extends Look {

    static ANIMATION_SPEED = 0.5;

    constructor(name, config) {
        super(name, config);

        this.emphasisStates = new Map();

        this.genomicService = config.genomicService;
        this.geometryManager = config.geometryManager;
        this.sceneManager = config.sceneManager;

        this.edgeArrowAnimationState =
            {
                uvOffset: 0,
                enabled: config.behaviors?.edgeArrowAnimation?.enabled ?? false
            };

        // Event subscription references - will be set up when activated
        this.deemphasizeUnsub = null;
        this.restoreUnsub = null;
    }

    static createAssemblyVisualizationLook(name, config) {

        const factoryConfig =
            {
                behaviors:
                    {
                        edgeArrowAnimation:
                            {
                                type: 'uvOffset',
                                speed: AssemblyVisualizationLook.ANIMATION_SPEED,
                                enabled: true
                            }
                    }
            };

        return new AssemblyVisualizationLook(name, {...factoryConfig, ...config });
    }

    /**
     * Create a node mesh from geometry
     */
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

    /**
     * Create an edge mesh from geometry
     */
    createEdgeMesh(geometry, context) {

        const { startNode, endNode, edgeKey } = context;

        // const startColor = this.genomicService.getAssemblyColor(`${startNode}`)
        // const endColor = this.genomicService.getAssemblyColor(`${endNode}`)
        const startColor = getAppleCrayonColorByName('steel')
        const endColor = getAppleCrayonColorByName('steel')
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

    getNodeMaterial(nodeName) {

        const cacheKey = `${this.constructor.name}:${nodeName}:normal`;

        // Check if we already have this material cached
        if (this.materialCache.has(cacheKey)) {
            return this.materialCache.get(cacheKey);
        }

        const material = new LineMaterial({
            color: getAppleCrayonColorByName('ocean'),
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

    getNodeEmphasisMaterial(assembly, nodeName) {

        const cacheKey = `${this.constructor.name}:${nodeName}:assembly:${assembly}`;

        // Check if we already have this material cached
        if (this.materialCache.has(cacheKey)) {
            return this.materialCache.get(cacheKey);
        }

        const material = new LineMaterial({
            color: this.genomicService.getAssemblyColor(assembly),
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

    getEdgeMaterial(startColor, endColor) {
        return colorRampArrowMaterialFactory(startColor, endColor, materialService.getTexture('arrow-white'), 1);
    }

    setNodeAndEdgeEmphasis(assembly, nodeSet, edgeSet) {

        this.emphasisStates.clear()

        const deemphasisNodeSet = this.geometryManager.geometryFactory.getNodeNameSet().difference(nodeSet);

        for (const nodeName of deemphasisNodeSet) {
            this.setEmphasisState(nodeName, 'deemphasized');
        }

        this.#updateNodeEmphasis(deemphasisNodeSet, 'deemphasized', undefined);
        this.#updateNodeEmphasis(nodeSet, 'emphasized', assembly);

        const deemphasisEdgeSet = this.geometryManager.geometryFactory.getEdgeNameSet().difference(edgeSet);

        for (const edgeKey of deemphasisEdgeSet) {
            this.setEmphasisState(edgeKey, 'deemphasized');
        }

        this.#updateEdgeEmphasis(deemphasisEdgeSet, 'deemphasized', undefined);
        this.#updateEdgeEmphasis(edgeSet, 'emphasized', assembly);

        this.#updateGeometryPositions();
    }

    restoreLinesandEdgesViaZOffset(nodeSet, edgeSet) {

        for (const nodeName of nodeSet) {
            this.setEmphasisState(nodeName, 'normal');
        }

        for (const key of edgeSet) {
            this.setEmphasisState(key, 'normal');
        }

        this.#updateNodeEmphasis(nodeSet, 'normal', undefined);
        this.#updateEdgeEmphasis(edgeSet, 'normal', undefined);

        this.#updateGeometryPositions();
    }

    /**
     * Override getZOffset to handle both nodes and edges with different Z-offsets
     */
    getZOffset(objectId) {

        if (objectId.startsWith('node:')) {
            // Node emphasis behavior
            const nodeName = objectId.replace('node:', '');
            const state = this.emphasisStates.get(nodeName) || 'normal';
            switch (state) {
                case 'deemphasized':
                    return GeometryFactory.NODE_LINE_DEEMPHASIS_Z_OFFSET;
                case 'emphasized':
                    return GeometryFactory.NODE_LINE_Z_OFFSET;
                case 'normal':
                    return GeometryFactory.NODE_LINE_Z_OFFSET;
                default:
                    console.error(`getZOffset: object ${ objectId } has invalid emphasis state`);
                    return GeometryFactory.EDGE_LINE_Z_OFFSET;
            }
        } else if (objectId.startsWith('edge:')) {

            const state = this.emphasisStates.get(objectId) || 'normal';
            switch (state) {
                case 'deemphasized':
                    return GeometryFactory.EDGE_LINE_Z_OFFSET - 4;
                case 'emphasized':
                    return GeometryFactory.EDGE_LINE_Z_OFFSET;
                case 'normal':
                    return GeometryFactory.EDGE_LINE_Z_OFFSET;
                default:
                    console.error(`getZOffset: object ${ objectId } has invalid emphasis state`);
                    return GeometryFactory.EDGE_LINE_Z_OFFSET;
            }
        }

        // Fallback to parent implementation
        return super.getZOffset(objectId);
    }

    setEmphasisState(nodeName, state) {
        this.emphasisStates.set(nodeName, state);
    }

    applyEmphasisState(mesh, emphasisState, assembly) {
        if (!mesh.userData) return;

        const { type } = mesh.userData;

        if (emphasisState === 'deemphasized') {
            if (type === 'node') {
                mesh.material = materialService.getNodeDeemphasisMaterial(mesh.userData.nodeName);
            } else if (type === 'edge') {
                mesh.material = materialService.getEdgeDeemphasisMaterial();
            }
        } else if (emphasisState === 'emphasized') {

            if (type === 'node') {
                mesh.material = this.getNodeEmphasisMaterial(assembly, mesh.userData.nodeName);
            } else if (type === 'edge') {
                mesh.material = materialService.getEdgeEmphasisMaterial(this.genomicService.getAssemblyColor(assembly));
            }

        }  else if (emphasisState === 'normal') {

            if (type === 'node') {
                mesh.material = this.getNodeMaterial(mesh.userData.nodeName);
            } else if (type === 'edge') {
                // TODO: Handle 'normal' edge material
                const startColor = getAppleCrayonColorByName('steel')
                const endColor = getAppleCrayonColorByName('steel')
                mesh.material = this.getEdgeMaterial(startColor, endColor)

            }

        } else {
            console.warn('DANGER! Should not get here')
        }

        // Immediately update resolution for LineMaterials to fix raycasting issues
        if (mesh.material && mesh.material.resolution) {
            lineMaterialResolutionService.updateMaterialResolution(mesh.material);
        }
    }

    /**
     * Override updateAnimation to update arrow texture animation
     */
    updateBehavior(deltaTime, scene) {

        if (!this.edgeArrowAnimationState.enabled) {
            return;
        }

        const behavior = this.behaviors.edgeArrowAnimation;

        if (behavior?.type === 'uvOffset') {
            const speed = behavior.speed * deltaTime;
            this.edgeArrowAnimationState.uvOffset = (this.edgeArrowAnimationState.uvOffset - speed) % 1.0;
        }

        const edgeMeshGroup = scene.getObjectByName('EdgeMeshGroup')
        this.#updateEdgeAnimation(edgeMeshGroup)

    }

    setAnimationEnabled(enabled) {
        this.edgeArrowAnimationState.enabled = enabled;
    }

    isAnimationEnabled() {
        return this.edgeArrowAnimationState.enabled;
    }

    createNodeTooltipContent(nodeObject) {
        const { nodeName } = nodeObject.userData;
        const nativeAssemblies = this.genomicService.getAssemblyListForNodeName(nodeName);
        const set = new Set([ ...nativeAssemblies ])
        const onlySelectedAssembles = [ ...set].filter(assembly => assemblyWidget.selectedAssemblies.has(assembly))
        const str = onlySelectedAssembles.map(assembly => `<div><strong>Assembly:</strong> ${assembly}</div>`)
        return `<div><strong>Node:</strong> ${nodeName}</div>${ str.join('') }`
    }

    // createNodeTooltipContent(nodeObject) {
    //     const { nodeName } = nodeObject.userData;
    //     return `<div><strong>Node:</strong> ${nodeName}</div>`
    // }

    #updateEdgeAnimation(edgeMeshesGroup) {

        if (!this.edgeArrowAnimationState.enabled) return;

        const uvOffset = new THREE.Vector2(this.edgeArrowAnimationState.uvOffset, 0);

        let edgeCount = 0;
        edgeMeshesGroup.traverse(object => {

            if (object.material){

                if (MATERIAL_TYPES.DEEMPHASIS !== object.material.materialType) {

                    if (object.userData?.type === 'edge' && object.material.uniforms) {
                        if (object.material.uniforms.uvOffset) {
                            object.material.uniforms.uvOffset.value.copy(uvOffset);
                            edgeCount++;
                        }
                    }

                }

            }
        });

    }

    #updateEdgeEmphasis(edgeSet, emphasisState, assembly) {

        const edgeMeshGroup = this.sceneManager.getActiveScene().getObjectByName('EdgeMeshGroup')
        edgeMeshGroup.traverse((object) => {
            if (object.userData?.type === 'edge') {
                if (edgeSet.has(object.userData.geometryKey)) {
                    this.applyEmphasisState(object, emphasisState, assembly);
                }
            }
        })

    }

    #updateNodeEmphasis(nodeNameSet, emphasisState, assembly) {

        const nodeMeshGroup = this.sceneManager.getActiveScene().getObjectByName('NodeMeshGroup')
        nodeMeshGroup.traverse((object) => {
            if (object.userData?.nodeName && nodeNameSet.has(object.userData.nodeName)) {
                this.applyEmphasisState(object, emphasisState, assembly);
            }
        });
    }

    #updateGeometryPositions() {

        const nodeMeshGroup = this.sceneManager.getActiveScene().getObjectByName('NodeMeshGroup')
        nodeMeshGroup.traverse((object) => {
            if (object.userData?.nodeName) {
                const nodeName = object.userData.nodeName;
                const zOffset = this.getZOffset(`node:${nodeName}`);

                // Update geometry Z coordinates
                if (object.geometry.attributes.instanceStart) {
                    const instanceStart = object.geometry.attributes.instanceStart.array;
                    const instanceEnd = object.geometry.attributes.instanceEnd.array;

                    for (let i = 0; i < instanceStart.length; i += 3) {
                        instanceStart[i + 2] = zOffset;
                        instanceEnd[i + 2] = zOffset;
                    }

                    // Only needed for dashed lines
                    // if (object.computeLineDistances) {
                    //     object.computeLineDistances();
                    // }

                    object.geometry.attributes.instanceStart.needsUpdate = true;
                    object.geometry.attributes.instanceEnd.needsUpdate = true;
                }
            }
        });

        const edgeMeshGroup = this.sceneManager.getActiveScene().getObjectByName('EdgeMeshGroup')
        edgeMeshGroup.traverse((object) => {
            if (object.userData?.type === 'edge') {
                const edgeKey = object.userData.geometryKey;
                object.position.z = this.getZOffset(edgeKey);
            }
        });
    }

    /**
     * Activate this look - subscribe to events
     */
    activate() {
        super.activate();

        // Subscribe to assembly interaction events
        this.deemphasizeUnsub = eventBus.subscribe('assembly:emphasis', data => {
            const { assembly, nodeSet, edgeSet } = data
            this.setNodeAndEdgeEmphasis(assembly, nodeSet, edgeSet);
        });

        this.restoreUnsub = eventBus.subscribe('assembly:normal', data => {
            const { nodeSet, edgeSet } = data
            this.restoreLinesandEdgesViaZOffset(nodeSet, edgeSet)
        });
    }

    /**
     * Deactivate this look - unsubscribe from events
     */
    deactivate() {
        super.deactivate();

        // Unsubscribe from events
        if (this.deemphasizeUnsub) {
            this.deemphasizeUnsub();
            this.deemphasizeUnsub = null;
        }

        if (this.restoreUnsub) {
            this.restoreUnsub();
            this.restoreUnsub = null;
        }
    }

    dispose() {

        super.dispose()

        // Dispose of MaterialService cached materials
        materialService.dispose();

        this.emphasisStates.clear();
    }
}

export default AssemblyVisualizationLook;
