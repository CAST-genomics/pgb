import * as THREE from 'three';
import Look from './look.js';
import eventBus from "../utils/eventBus.js"
import {MATERIAL_TYPES} from '../materialService.js';
import materialService from '../materialService.js';
import GeometryFactory from "../geometryFactory.js"

class AssemblyVisualizationLook extends Look {

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

    isAnimationEnabled() {
        return this.edgeArrowAnimationState.enabled;
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

    // createNodeTooltipContent(nodeObject) {
    //     const { nodeName } = nodeObject.userData;
    //     const assemblies = this.genomicService.getAssemblyListForNodeName(nodeName);
    //
    //     // Group assemblies by assembly name, then sort within each group by haplotype
    //     const assemblyGroups = {};
    //     assemblies.forEach(assembly => {
    //         const parts = assembly.split('#');
    //         const assemblyName = parts[0];
    //         if (!assemblyGroups[assemblyName]) {
    //             assemblyGroups[assemblyName] = [];
    //         }
    //         assemblyGroups[assemblyName].push(assembly);
    //     });
    //
    //     // Sort each group by haplotype and flatten into a single array
    //     const sortedAssemblies = Object.keys(assemblyGroups)
    //         .sort() // Sort assembly names alphabetically
    //         .flatMap(assemblyName =>
    //             assemblyGroups[assemblyName].sort((a, b) => {
    //                 const haplotypeA = a.split('#')[1];
    //                 const haplotypeB = b.split('#')[1];
    //                 return haplotypeA.localeCompare(haplotypeB);
    //             })
    //         );
    //
    //     const selectedAssembly = this.assemblyWidget?.selectedAssembly;
    //
    //     // Create table rows with 4 columns
    //     const tableRows = [];
    //     for (let i = 0; i < sortedAssemblies.length; i += 4) {
    //         const row = sortedAssemblies.slice(i, i + 4);
    //         let cells = row.map(assembly => {
    //
    //             let isSelected
    //             if (selectedAssembly) {
    //                 isSelected = selectedAssembly && assembly === selectedAssembly.name
    //             } else {
    //                 isSelected = false
    //             }
    //
    //             const colorStyle = true === isSelected ? `style="color: #dc3545; font-weight: bold;"` : ''
    //
    //             const [ assemblyName, haplotype ] = GenomicService.presentationAssemblyLabel(assembly);
    //
    //             // HG00438&thinsp;&middot;&thinsp;h2
    //             const str = `${assemblyName}&middot;hap${haplotype}`
    //             return `<td class="assembly-cell" ${colorStyle}>${str}</td>`;
    //         }).join('');
    //
    //         // Pad with empty cells if needed
    //         while (row.length < 4) {
    //             cells += '<td class="assembly-cell empty"></td>';
    //             row.push('');
    //         }
    //         tableRows.push(`<tr>${cells}</tr>`);
    //     }
    //
    //     return `<div class="look-tooltip">
    //         <div class="node-section">
    //             <!-- <div class="node-title">Node: ${nodeName}</div> -->
    //             <div class="assembly-table-container">
    //                 <div class="assembly-table-title">Assemblies</div>
    //                 <table class="assembly-table">
    //                     ${tableRows.join('')}
    //                 </table>
    //             </div>
    //         </div>
    //     </div>`
    // }

    /**
     * Activate this look - subscribe to events
     */
    activate() {
        super.activate();

        // Subscribe to assembly interaction events
        this.deemphasizeUnsub = eventBus.subscribe('assembly:emphasis', data => {
            const { assembly, nodeSet, edgeSet } = data
            this.setNodeAndEdgeEmphasis(assembly.name, nodeSet, edgeSet);
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
