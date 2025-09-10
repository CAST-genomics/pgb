import * as THREE from 'three';
import LineFactory, {adaptiveSplineDivisions, fixedSplineDivisions} from './lineFactory.js';
import {prettyPrint} from "./utils/utils.js"
import {calculateBasicStats, calculatePercentiles} from "./utils/stats.js"

class GeometryFactory {

    static EDGE_LINE_Z_OFFSET = -12;
    static NODE_LINE_Z_OFFSET = -8;
    static NODE_LINE_DEEMPHASIS_Z_OFFSET = -16;

    constructor(genomicService) {
        this.genomicService = genomicService;
        this.splines = new Map();
        this.geometryCache = new Map(); // Cache geometries by node name
    }

    createGeometryData(json, isMinigraphCactus) {
        this.splines.clear();
        this.geometryCache.clear();

        const bbox = this.#calculateBoundingBox(json);

        // pretty print the bbox
        console.log(`bbox: ${ prettyPrint(bbox.x.min) } ${ prettyPrint(bbox.x.max) } ${ prettyPrint(bbox.y.min) } ${ prettyPrint(bbox.y.max) }`)

        this.#createSplines(bbox, json.node);

        this.#createNodeGeometries(json.node);

        if (!isMinigraphCactus){
            this.#createEdgeGeometries(json.edge);
        }

        const result = {
            splines: this.splines,
            nodeGeometries: this.getNodeGeometries(),
            edgeGeometries: this.getEdgeGeometries(),
            bbox
        };

        const nodeCount = `${ prettyPrint(this.getNodeNameSet().size) }`
        const edgeCount = `${ prettyPrint(this.getEdgeNameSet().size) }`
        const nodeXYZCount = `${ prettyPrint(GeometryFactory.getTotalLine2Points(this.geometryCache)) }`

        console.log(`created: nodes ${ nodeCount } nodeXYZ ${ nodeXYZCount } edges ${ edgeCount }`)

        return result;
    }

    /**
     * Create splines from node coordinates
     */
    #createSplines(bbox, nodes) {
        for (const [nodeName, nodeData] of Object.entries(nodes)) {
            const { ogdf_coordinates } = nodeData;

            // Build spline from coordinates recentered around origin
            const coordinates = ogdf_coordinates.map(({ x, y }) =>
                new THREE.Vector3(x - bbox.x.centroid, y - bbox.y.centroid, 0)
            );
            const spline = new THREE.CatmullRomCurve3(coordinates);

            this.splines.set(nodeName, spline);
        }
    }

    /**
     * Create node line geometries without materials
     */
    #createNodeGeometries(nodes) {
        for (const [nodeName, nodeData] of Object.entries(nodes)) {
            const spline = this.splines.get(nodeName);
            if (!spline) continue;

            const payload =
                {
                    type: 'node',
                    // geometry: LineFactory.createNodeLineGeometry(spline, adaptiveSplineDivisions(spline, 4), GeometryFactory.NODE_LINE_Z_OFFSET),
                    geometry: LineFactory.createNodeLineGeometry(spline, fixedSplineDivisions(spline, 32), GeometryFactory.NODE_LINE_Z_OFFSET),
                    spline,
                    nodeName,
                    assembly: this.genomicService.nodeMetadata.get(nodeName)?.assembly
                };

            this.geometryCache.set(`node:${nodeName}`, payload);
        }
    }

    /**
     * Create edge line geometries without materials
     */
    #createEdgeGeometries(edges) {

        for (const { starting_node, ending_node } of Object.values(edges)) {

            const startNodeName = this.getActualSignedNodeName(starting_node);
            const startParam = this.getSplineParameter(starting_node, 'starting');
            const startSpline = this.splines.get(startNodeName);
            const xyzStart = startSpline.getPoint(startParam);
            xyzStart.z = GeometryFactory.EDGE_LINE_Z_OFFSET;

            const endNodeName = this.getActualSignedNodeName(ending_node);
            const endParam = this.getSplineParameter(ending_node, 'ending');
            const endSpline = this.splines.get(endNodeName);
            const xyzEnd = endSpline.getPoint(endParam);
            xyzEnd.z = GeometryFactory.EDGE_LINE_Z_OFFSET;


            const payload =
                {
                    type: 'edge',
                    geometry: LineFactory.createEdgeRectGeometry(xyzStart, xyzEnd),
                    startPoint: xyzStart,
                    endPoint: xyzEnd,
                    startNode: startNodeName,
                    endNode: endNodeName
                };

            // Use the proper node name for key design. This will allow
            // direct retrieval of the associated nodes.
            const edgeKey = `edge:${startNodeName}:${endNodeName}`;
            this.geometryCache.set(edgeKey, payload);
        }
    }

    /**
     * Get the actual signed node name that exists in the graph
     * This method finds the correct signed node name for spline lookup
     * @param {string} signedNodeRef - The signed node reference (e.g., "2918+" or "2918-")
     * @returns {string} The actual signed node name that exists in the graph
     * @throws {Error} If no matching node is found
     */
    getActualSignedNodeName(signedNodeRef) {
        const { nodeName } = this.#parseSignedNode(signedNodeRef);

        // Look for the node with this base name in our graph
        for (const key of this.geometryCache.keys()) {

            if (key.startsWith('node:')){
                const [ prefix, signedNode ] = key.split(':')
                const { nodeName: existingNodeName } = this.#parseSignedNode(signedNode);
                if (existingNodeName === nodeName) {
                    return signedNode; // Return the actual signed node name from the graph
                }
            }
        }

        throw new Error(`No node found with base name ${nodeName} for reference ${signedNodeRef}`);
    }

    #parseSignedNode(signedNode) {
        const match = signedNode.match(/^(.+?)([+-])$/);
        if (!match) {
            throw new Error(`Invalid signed node format: ${signedNode}`);
        }
        return { nodeName: match[1], sign: match[2] };
    }

    /**
     * Get the actual sign of a node from its signed name
     * @param {string} signedNodeName - The signed node name (e.g., "1234+", "5678-")
     * @returns {string} The node's actual sign ('+' or '-')
     */
    getNodeSign(signedNodeName) {
        const { sign } = this.#parseSignedNode(signedNodeName);
        return sign;
    }

    /**
     * Get the spline parameter (0 or 1) for a signed node reference
     * This implements the sign interpretation rule for geometry creation
     * @param {string} signedNodeRef - The signed node reference (e.g., "2918+" or "2918-")
     * @param {string} nodeType - Either "starting" or "ending" to determine the rule
     * @returns {number} 0 or 1 for spline.getPoint() parameter
     */
    getSplineParameter(signedNodeRef, nodeType) {
        const { nodeName, sign: edgeSign } = this.#parseSignedNode(signedNodeRef);
        // Get the actual signed node name and then its sign
        const actualSignedNodeName = this.getActualSignedNodeName(signedNodeRef);
        const nodeSign = this.getNodeSign(actualSignedNodeName);

        if (!nodeSign) {
            throw new Error(`Node sign not found for ${actualSignedNodeName}`);
        }

        // Determine if signs are opposite (edge sign ≠ node sign)
        const signsOpposite = edgeSign !== nodeSign;

        if (nodeType === 'starting') {
            // This is a starting_node. If the sign is opposite to the node sign
            // use node.start xyz (0). If the sign is the same, use node.end xyz (1)
            return signsOpposite ? 0 : 1;
        } else if (nodeType === 'ending') {
            // This is an ending_node. If the sign is opposite to the node sign
            // use node.end xyz (1). If the sign is the same, use node.start xyz (0)
            return signsOpposite ? 1 : 0;
        } else {
            throw new Error(`Invalid nodeType: ${nodeType}. Must be 'starting' or 'ending'`);
        }
    }

    /**
     * Get all node geometries
     */
    getNodeGeometries() {
        const nodeGeometries = new Map();
        for (const [key, data] of this.geometryCache.entries()) {
            if (data.type === 'node') {
                nodeGeometries.set(data.nodeName, data);
            }
        }
        return nodeGeometries;
    }

    /**
     * Get all edge geometries
     */
    getEdgeGeometries() {
        const edgeGeometries = new Map();
        for (const [key, data] of this.geometryCache.entries()) {
            if (data.type === 'edge') {
                edgeGeometries.set(key, data);
            }
        }
        return edgeGeometries;
    }

    // return a set of all nodeGeometry keys
    getNodeNameSet(){
        return new Set([ ...this.getNodeGeometries().keys() ])
    }

    // return a set of all edge keys
    getEdgeNameSet(){
        return new Set([ ...this.getEdgeGeometries().keys() ])
    }

    /**
     * Get spline by node name
     */
    getSpline(nodeName) {
        return this.splines.get(nodeName);
    }

    /**
     * Calculate bounding box from JSON data
     */
    #calculateBoundingBox(json) {
        const acc = [];
        for (const { ogdf_coordinates } of Object.values(json.node)) {
            const xyzList = ogdf_coordinates.map(({ x, y }) => [x, y]);
            acc.push(...xyzList);
        }

        const [xCoords, yCoords] = acc.reduce((result, [x, y]) => {
            result[0].push(x);
            result[1].push(y);
            return result;
        }, [[], []]);

        const minX = Math.min(...xCoords);
        const maxX = Math.max(...xCoords);
        const minY = Math.min(...yCoords);
        const maxY = Math.max(...yCoords);

        return {
            x: { min: minX, max: maxX, centroid: (minX + maxX) / 2 },
            y: { min: minY, max: maxY, centroid: (minY + maxY) / 2 }
        };
    }

    /**
     * Static method to count total xyz points in Line2 objects from geometryCache
     * @param {Map} geometryCache - The geometry cache containing node and edge data
     * @returns {number} Total number of xyz points in Line2 objects (LineGeometry)
     */
    static getTotalLine2Points(geometryCache) {
        let totalPoints = 0;

        for (const [key, data] of geometryCache.entries()) {
            if (data.type === 'node' && data.geometry) {
                totalPoints += (1 + data.geometry.attributes.instanceStart.count)
            }
        }

        return totalPoints;
    }

    /**
     * Dispose of all geometries
     */
    dispose() {
        this.geometryCache.forEach(data => {
            if (data.geometry) {
                data.geometry.dispose();
            }
        });
        this.geometryCache.clear();
        this.splines.clear();
    }
}

export default GeometryFactory;
