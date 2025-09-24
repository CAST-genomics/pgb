import * as THREE from 'three'
import GeometryFactory from './geometryFactory.js';
import { buildArcLengthTable } from "./lineFactory.js"

class GeometryManager {

    constructor(genomicService) {

        this.genomicService = genomicService;

        this.geometryFactory = new GeometryFactory(genomicService);

        this.geometryData = null;
    }

    createGeometry(json) {
        this.geometryData = this.geometryFactory.createGeometryData(json);
    }

    createAllSceneNodeMeshes(scenes, lookManager){

        for (const [ sceneName, scene] of scenes.entries()){

            const group = new THREE.Group()
            group.name = "NodeMeshGroup"

            scene.add(group)

            const look = lookManager.looks.get(sceneName)

            for (const [nodeName, data] of this.geometryData.nodeGeometries) {
                const context = { type: 'node', nodeName };
                const mesh = look.createMesh(data.geometry, context)

                // Used during raycast.intersections to help calculate the "t" parameter
                // for a line. We treat lines as one-dimensional parametric lines.
                mesh.userData.arcLengthTable = buildArcLengthTable(mesh)
                group.add(mesh);
            }

            const cache = lookManager.getLook(sceneName).materialCache
            console.log(`For scene ${ sceneName }, created ${ group.children.length } node meshes with ${ cache.size } materials in the look cache`)
        }
    }

    createAllSceneEdgeMeshes(scenes, lookManager){
        for (const [ sceneName, scene] of scenes.entries()){

            const group = new THREE.Group()
            group.name = "EdgeMeshGroup"

            scene.add(group)

            const look = lookManager.looks.get(sceneName)

            for (const [edgeKey, data] of this.geometryData.edgeGeometries) {

                const { startNode, endNode } = data;
                const context = { type: 'edge', startNode, endNode, edgeKey };

                const mesh = look.createMesh(data.geometry, context);
                group.add(mesh);
            }
        }
    }

    getSpline(nodeName) {
        return this.geometryFactory.getSpline(nodeName);
    }

    /**
     * Clear all geometry data and groups without full disposal
     * This is useful when loading new data files
     */
    clear() {
        this.geometryData = null;
    }

    dispose() {
        this.geometryFactory.dispose()
        this.geometryData = null;
    }

}

export default GeometryManager;
