import * as THREE from 'three'
import GeometryFactory from './geometryFactory.js';
import { buildArcLengthTable } from "./lineFactory.js"

class GeometryManager {

    constructor(genomicService) {

        this.genomicService = genomicService;



        this.geometryFactory = new GeometryFactory(genomicService);

        this.nodeMeshesGroup = new THREE.Group();
        this.edgeMeshesGroup = new THREE.Group();

        this.geometryData = null;
    }

    createGeometry(json, look) {

        this.geometryData = this.geometryFactory.createGeometryData(json);

        this.nodeMeshesGroup.clear();
        this.edgeMeshesGroup.clear();

        this.#createNodeMeshes(look);

        this.#createEdgeMeshes(look);
    }

    createAllSceneNodeMeshes(scenes, lookManager, nodeGeometries){
        for (const [ sceneName, scene] of scenes.entries()){
            const look = lookManager.looks.get(sceneName)

            for (const [nodeName, data] of nodeGeometries) {
                const context = { type: 'node', nodeName };
                const mesh = look.createMesh(data.geometry, context)

                // Used during raycast.intersections to help calculate the "t" parameter
                // for a line. We treat lines as one-dimensional parametric lines.
                mesh.userData.arcLengthTable = buildArcLengthTable(mesh)
                scene.add(mesh);
            }
        }
    }

    createAllSceneEdgeMeshes(scenes, lookManager, edgeGeometries){
        for (const [ sceneName, scene] of scenes.entries()){
            const look = lookManager.looks.get(sceneName)

            for (const [edgeKey, data] of edgeGeometries) {

                const { startNode, endNode } = data;
                const context = { type: 'edge', startNode, endNode, edgeKey };

                const mesh = look.createMesh(data.geometry, context);
                scene.add(mesh);
            }
        }
    }

    #createNodeMeshes(look) {
        for (const [nodeName, data] of this.geometryData.nodeGeometries) {
            const context = { type: 'node', nodeName };
            const mesh = look.createMesh(data.geometry, context)

            // Used during raycast.intersections to help calculate the "t" parameter
            // for a line. We treat lines as one-dimensional parametric lines.
            mesh.userData.arcLengthTable = buildArcLengthTable(mesh)

            this.nodeMeshesGroup.add(mesh);
        }
    }

    #createEdgeMeshes(look) {
        for (const [edgeKey, data] of this.geometryData.edgeGeometries) {

            const { startNode, endNode } = data;
            const context = { type: 'edge', startNode, endNode, edgeKey };

            const mesh = look.createMesh(data.geometry, context);
            this.edgeMeshesGroup.add(mesh);
        }
    }
    
    getSpline(nodeName) {
        return this.geometryFactory.getSpline(nodeName);
    }

    getLine(nodeName){
        return this.nodeMeshesGroup.children.find(child => child.userData.nodeName === nodeName)
    }

    addToScene(scene) {
        scene.add(this.nodeMeshesGroup);
        scene.add(this.edgeMeshesGroup);
    }

    /**
     * Clear all geometry data and groups without full disposal
     * This is useful when loading new data files
     */
    clear() {
        // Remove from scene
        this.nodeMeshesGroup.parent?.remove(this.nodeMeshesGroup);
        this.edgeMeshesGroup.parent?.remove(this.edgeMeshesGroup);

        // Clear the groups
        this.nodeMeshesGroup.clear();
        this.edgeMeshesGroup.clear();

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
        this.nodeMeshesGroup.parent?.remove(this.nodeMeshesGroup);
        this.edgeMeshesGroup.parent?.remove(this.edgeMeshesGroup);

        // Dispose of all geometries and materials
        for (const group of [this.nodeMeshesGroup, this.edgeMeshesGroup]) {
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
