import * as THREE from 'three';
import Look from './look.js';
import eventBus from "../utils/eventBus.js"
import {MATERIAL_TYPES} from '../materialService.js';
import materialService from '../materialService.js';
import GeometryFactory from "../geometryFactory.js"

class NodeEmphasisLook extends Look {

    static ANIMATION_SPEED = 0.5;

    constructor(name, config) {
        super(name, config);

        this.sceneManager = config.sceneManager

        this.edgeArrowAnimationState =
            {
                uvOffset: 0,
                enabled: config.behaviors?.edgeArrowAnimation?.enabled ?? false
            };
    }

    static createNodeEmphasisLook(name, config) {

        const factoryConfig =
            {
                behaviors:
                    {
                        edgeArrowAnimation:
                            {
                                type: 'uvOffset',
                                speed: NodeEmphasisLook.ANIMATION_SPEED,
                                enabled: true
                            }
                    }
            };

        return new NodeEmphasisLook(name, {...factoryConfig, ...config });
    }

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

    /**
     * Activate this look - subscribe to events
     */
    activate() {
        super.activate();

        // Subscribe to assembly interaction events
        this.deemphasizeAssemblyUnsub = eventBus.subscribe('assembly:emphasis', data => {
            const { assembly, nodeSet, edgeSet } = data
            this.setNodeAndEdgeEmphasis(assembly.name, nodeSet, edgeSet, Look.NODE_EMPHASIS_COLOR);
        });

        this.restoreAssemblyUnsub = eventBus.subscribe('assembly:normal', data => {
            const { nodeSet, edgeSet } = data
            this.restoreLinesandEdgesViaZOffset(nodeSet, edgeSet)
        });

        this.deemphasizePCAChartUnsub = eventBus.subscribe('pcaChart:emphasis', data => {
            const { assembly, nodeSet, edgeSet } = data
            this.setNodeAndEdgeEmphasis(assembly.name, nodeSet, edgeSet, Look.DEFAULT_NODE_COLOR);
        });

        this.restorePCAChartUnsub = eventBus.subscribe('pcaChart:normal', data => {
            const { nodeSet, edgeSet } = data
            this.restoreLinesandEdgesViaZOffset(nodeSet, edgeSet)
        });

    }

    /**
     * Deactivate this look - unsubscribe from events
     */
    deactivate() {
        super.deactivate();

        if (this.deemphasizeAssemblyUnsub) {
            this.deemphasizeAssemblyUnsub();
            this.deemphasizeAssemblyUnsub = null;
        }

        if (this.restoreAssemblyUnsub) {
            this.restoreAssemblyUnsub();
            this.restoreAssemblyUnsub = null;
        }

        if (this.deemphasizePCAChartUnsub) {
            this.deemphasizePCAChartUnsub();
            this.deemphasizePCAChartUnsub = null;
        }

        if (this.restorePCAChartUnsub) {
            this.restorePCAChartUnsub();
            this.restorePCAChartUnsub = null;
        }
    }

    dispose() {

        super.dispose()

        // Dispose of MaterialService cached materials
        materialService.dispose();

        this.emphasisStates.clear();
    }
}

export default NodeEmphasisLook;
