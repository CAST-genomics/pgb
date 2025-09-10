import * as THREE from 'three';
import ParametricLine from './parametricLine.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import Look from './look.js';
import { colorRampArrowMaterialFactory } from './materialService.js';
import materialService from './materialService.js';
import GeometryFactory from "./geometryFactory.js"
import {getAppleCrayonColorByName, getRandomAppleCrayonColor} from "./utils/color.js"
import { assemblyWidget } from "./main.js"
import lineMaterialResolutionService from './lineMaterialResolutionService.js'

class HeatmapLook extends Look {

    static ANIMATION_SPEED = 0.5;

    constructor(name, config) {
        super(name, config);

        this.genomicService = config.genomicService;
        this.geometryManager = config.geometryManager;

        this.edgeArrowAnimationState =
            {
                uvOffset: 0,
                enabled: config.behaviors?.edgeArrowAnimation?.enabled ?? false
            };

        // Event subscription references - will be set up when activated
        this.deemphasizeUnsub = null;
        this.restoreUnsub = null;
    }

    static createHeatmapLookLook(name, config) {

        const factoryConfig =
            {
                behaviors:
                    {
                        edgeArrowAnimation:
                            {
                                type: 'uvOffset',
                                speed: HeatmapLook.ANIMATION_SPEED,
                                enabled: true
                            }
                    }
            };

        return new HeatmapLook(name, {...factoryConfig, ...config });
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
            // color: getAppleCrayonColorByName('aqua'),
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

    getAssemblyMaterial(assembly, nodeName) {

        const cacheKey = `${this.constructor.name}:${nodeName}assembly:${assembly}`;

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

    /**
     * Override getZOffset to handle both nodes and edges with different Z-offsets
     */


    /**
     * Override updateAnimation to update arrow texture animation
     */
    updateBehavior(deltaTime, geometryManager) {

        if (!this.edgeArrowAnimationState.enabled) return;

        const behavior = this.behaviors.edgeArrowAnimation;

        if (behavior?.type === 'uvOffset') {
            const speed = behavior.speed * deltaTime;
            this.edgeArrowAnimationState.uvOffset = (this.edgeArrowAnimationState.uvOffset - speed) % 1.0;
        }

        this.#updateEdgeAnimation(geometryManager.edgesGroup)

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

    #updateEdgeAnimation(edgesGroup) {

        if (!this.edgeArrowAnimationState.enabled) return;

        const uvOffset = new THREE.Vector2(this.edgeArrowAnimationState.uvOffset, 0);

        let edgeCount = 0;
        edgesGroup.traverse((object) => {
            if (object.userData?.type === 'edge' && object.material && object.material.uniforms) {
                if (object.material.uniforms.uvOffset) {
                    object.material.uniforms.uvOffset.value.copy(uvOffset);
                    edgeCount++;
                }
            }
        });

    }

    /**
     * Activate this look - subscribe to events
     */
    activate() {
        super.activate();
    }

    /**
     * Deactivate this look - unsubscribe from events
     */
    deactivate() {
        super.deactivate();
    }

    dispose() {

        super.dispose()

        // Dispose of MaterialService cached materials
        materialService.dispose();

        this.emphasisStates.clear();
    }
}

export default HeatmapLook;
