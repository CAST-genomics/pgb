import * as THREE from 'three';
import LineFactory, { ARC_PARAMS } from './lineFactory.js';
import { buildNodeRibbonGeometry } from './ribbonNode.ts';
import {prettyPrint} from "./utils/utils.js"

class GeometryFactory {

    static EDGE_LINE_Z_OFFSET = -12;

    // #spineSkipCount: this edge is not drawn at all.
    static EDGE_HIDDEN = -1;

    constructor(genomicService) {
        this.genomicService = genomicService;
        this.splines = new Map();
        this.geometryCache = new Map(); // Cache geometries by node name
    }

    createGeometryData(dataset) {
        this.splines.clear();
        this.geometryCache.clear();

        const bbox = this.#calculateBoundingBox(dataset);

        this.#createSplines(bbox, dataset.nodes);

        this.#createNodeGeometries(dataset.nodes);

        this.#createEdgeGeometries(dataset.edges, this.#spineTopology(dataset));

        const result = {
            splines: this.splines,
            nodeGeometries: this.getNodeGeometries(),
            edgeGeometries: this.getEdgeGeometries(),
            bbox
        };

        const nodeCount = `${ prettyPrint(this.getNodeNameSet().size) }`
        const edgeCount = `${ prettyPrint(this.getEdgeNameSet().size) }`
        const nodeXYZCount = `${ prettyPrint(GeometryFactory.getTotalLine2Points(this.geometryCache)) }`

        // console.log(`created: nodes ${ nodeCount } nodeXYZ ${ nodeXYZCount } edges ${ edgeCount }`)
        console.log(`created: nodes ${ nodeCount } edges ${ edgeCount }`)

        return result;
    }

    /**
     * Create splines from node coordinates
     */
    #createSplines(bbox, nodes) {
        for (const [nodeName, node] of nodes) {
            // Build spline from coordinates recentered around origin
            const coordinates = node.ogdfCoordinates.map(({ x, y }) =>
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
        for (const [nodeName, node] of nodes) {
            const spline = this.splines.get(nodeName);
            if (!spline) continue;

            const geometry = buildNodeRibbonGeometry(spline);

            const payload =
                {
                    type: 'node',
                    geometry,
                    spline,
                    nodeName,
                    assembly: this.genomicService.nodeMetadata.get(nodeName)?.assembly
                };

            this.geometryCache.set(`node:${nodeName}`, payload);
        }
    }

    /**
     * The spine's topology, when the dataset was laid out linearly. Null in force mode.
     *
     * `order` is the backend's own spine walk, position by node id, and is the only
     * source trusted to say which spine nodes are adjacent. A walk recomputed here from
     * the edge list cannot answer that question: it is a shortest path, so it takes
     * every skip edge as a shortcut and drops the nodes they bypass.
     *
     * Linear responses predating the backend's `spine.nodes` attribute fall back to
     * that recomputed walk for membership alone — enough to keep hiding spine-to-spine
     * edges the way they always were. No arcs are drawn from it: an order this code
     * does not trust must not be the thing that decides what counts as a skip.
     */
    #spineTopology(dataset) {
        const { mode, spineAssembly, spineNodes } = dataset.layout || {};
        if (mode !== 'linear') {
            return null;
        }

        if (spineNodes && spineNodes.length > 0) {
            const order = new Map(spineNodes.map((id, index) => [id, index]));
            return { nodeIds: new Set(spineNodes), order };
        }

        if (!spineAssembly) {
            return null;
        }

        const assemblyKey = this.genomicService.resolveAssemblyKey(spineAssembly);
        const walk = assemblyKey && this.genomicService.assemblyWalkMap.get(assemblyKey);
        if (!walk) {
            return null;
        }

        return { nodeIds: new Set(walk.spineFeatures.spine.nodes.map(({ id }) => id)), order: null };
    }

    /**
     * How an edge between two spine nodes should be drawn, as a count of the spine
     * nodes it jumps over:
     *
     *   0             draw it straight — at least one endpoint is off the spine
     *   EDGE_HIDDEN   do not draw it at all
     *   n > 0         draw it as an arc over n spine nodes
     *
     * The spine is laid out as a straight run of abutting nodes, so an edge joining two
     * *adjacent* spine nodes adds nothing but overdraw along that run, and is hidden. An
     * edge joining two spine nodes the spine does not place next to each other is a
     * skip: it carries real structure the straight run cannot show, so it arcs.
     * Direction is not part of the test — a backwards skip is still a skip.
     */
    #spineSkipCount(spine, startNodeName, endNodeName) {
        if (!spine || !spine.nodeIds.has(startNodeName) || !spine.nodeIds.has(endNodeName)) {
            return 0;
        }

        if (!spine.order) {
            return GeometryFactory.EDGE_HIDDEN;
        }

        const gap = Math.abs(spine.order.get(endNodeName) - spine.order.get(startNodeName));

        return gap === 1 ? GeometryFactory.EDGE_HIDDEN : gap - 1;
    }

    /**
     * Create edge line geometries without materials
     *
     * @param {{ nodeIds: Set<string>, order: Map<string, number>|null }|null} spine -
     * the spine topology, per #spineTopology. Null in force mode, where every edge is
     * drawn straight. Edges with at least one off-spine endpoint carry the graph's
     * branching structure and are always drawn straight; #spineSkipCount decides the
     * rest.
     */
    #createEdgeGeometries(edges, spine) {

        // Successive arcs alternate above and below the spine, so two skips over the
        // same stretch of it stay legible instead of stacking. `edges` arrives in the
        // backend's order, which follows the spine, so alternating them as they are
        // drawn alternates them along the spine.
        let arcSide = ARC_PARAMS.START_SIDE;

        for (const { startingNode, endingNode } of edges) {

            const startNodeName = this.getActualSignedNodeName(startingNode);
            const endNodeName = this.getActualSignedNodeName(endingNode);

            const skippedNodeCount = this.#spineSkipCount(spine, startNodeName, endNodeName);
            if (skippedNodeCount === GeometryFactory.EDGE_HIDDEN) {
                continue;
            }

            const startParam = this.getSplineParameter(startingNode, 'starting');
            const startSpline = this.splines.get(startNodeName);
            const xyzStart = startSpline.getPoint(startParam);
            xyzStart.z = GeometryFactory.EDGE_LINE_Z_OFFSET;

            const endParam = this.getSplineParameter(endingNode, 'ending');
            const endSpline = this.splines.get(endNodeName);
            const xyzEnd = endSpline.getPoint(endParam);
            xyzEnd.z = GeometryFactory.EDGE_LINE_Z_OFFSET;


            let geometry;
            if (skippedNodeCount > 0) {
                geometry = LineFactory.createSkipArcGeometry(xyzStart, xyzEnd, skippedNodeCount, arcSide);
                arcSide *= -1;
            } else {
                geometry = LineFactory.createEdgeRectGeometry(xyzStart, xyzEnd);
            }

            const payload =
                {
                    type: 'edge',
                    geometry,
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
    #calculateBoundingBox(dataset) {
        const acc = [];
        for (const [, node] of dataset.nodes) {
            const xyzList = node.ogdfCoordinates.map(({ x, y }) => [x, y]);
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
            if (data.type === 'node' && data.geometry?.userData.sampleCount) {
                totalPoints += data.geometry.userData.sampleCount
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
