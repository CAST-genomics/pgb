import * as THREE from 'three'
import GeometryFactory from './geometryFactory.js';
import { buildArcLengthTable } from "./lineFactory.js"

class GeometryManager {

    constructor(genomicService) {

        this.genomicService = genomicService;



        this.geometryFactory = new GeometryFactory(genomicService);

        this.linesGroup = new THREE.Group();
        this.edgesGroup = new THREE.Group();

        this.geometryData = null;
    }

    createGeometry(json, look) {

        this.geometryData = this.geometryFactory.createGeometryData(json);

        this.linesGroup.clear();
        this.edgesGroup.clear();

        this.#createNodeMeshes(look);
        this.#createEdgeMeshes(look);
    }

    #createNodeMeshes(look) {
        for (const [nodeName, data] of this.geometryData.nodeGeometries) {
            const context = { type: 'node', nodeName };
            const mesh = look.createMesh(data.geometry, context)

            // Used during raycast.intersections to help calculate the "t" parameter
            // for a line. We treat lines as one-dimensional parametric lines.
            mesh.userData.arcLengthTable = buildArcLengthTable(mesh)

            this.linesGroup.add(mesh);
        }
    }

    #createEdgeMeshes(look) {
        for (const [edgeKey, data] of this.geometryData.edgeGeometries) {

            const { startNode, endNode } = data;
            const context = { type: 'edge', startNode, endNode, edgeKey };

            const mesh = look.createMesh(data.geometry, context);
            this.edgesGroup.add(mesh);
        }
    }

    getSpline(nodeName) {
        return this.geometryFactory.getSpline(nodeName);
    }

    getLine(nodeName){

        const line = this.linesGroup.children.find(child => child.userData.nodeName === nodeName)
        return line
    }

    addToScene(scene) {
        scene.add(this.linesGroup);
        scene.add(this.edgesGroup);
    }

    /**
     * Clear all geometry data and groups without full disposal
     * This is useful when loading new data files
     */
    clear() {
        // Remove from scene
        this.linesGroup.parent?.remove(this.linesGroup);
        this.edgesGroup.parent?.remove(this.edgesGroup);

        // Clear the groups
        this.linesGroup.clear();
        this.edgesGroup.clear();

        // Clear the geometry data
        this.geometryData = null;
    }

    dispose() {
        // Unsubscribe from events
        if (this.deemphasizeUnsub) {
            this.deemphasizeUnsub();
        }
        if (this.restoreUnsub) {
            this.restoreUnsub();
        }

        // Dispose of geometry factory
        this.geometryFactory.dispose();

        // Remove from scene
        this.linesGroup.parent?.remove(this.linesGroup);
        this.edgesGroup.parent?.remove(this.edgesGroup);

        // Dispose of all geometries and materials
        for (const group of [this.linesGroup, this.edgesGroup]) {
            group.traverse((object) => {
                if (object.geometry) {
                    object.geometry.dispose();
                }

                if (object.material) {
                    if (Array.isArray(object.material)) {
                        for (const material of object.material) {
                            material.dispose();
                        }
                    } else {
                        object.material.dispose();
                    }
                }
            });

            group.clear();
        }

        // Clear the maps
        this.geometryData = null;
    }

}

export default GeometryManager;
