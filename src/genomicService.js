import {app, locusInput} from "./main.js"
import LocusInput from "./locusInput.js"
import {getPerceptuallyDistinctColors} from "./utils/hsluv-utils.js"
import {colors32Distinct, colors64Distinct} from "./utils/color.js"
import {prettyPrint, uniqueRandomGenerator} from "./utils/utils.js"

class GenomicService {

    constructor() {
        this.metadata = new Map()
        this.assemblyPayload = new Map()
        this.nodeAssemblyStats = new Map()
        this.assemblySet = new Set()
        this.assemblyWalkMap = new Map()
        this.startNode = undefined
    }

    async createMetadata(json, pangenomeService, genomeLibrary, geometryManager, raycastService) {

        const { locus:locusString, node:nodes, sequence:sequences } = json

        this.locus = LocusInput.parseLocusString(locusString)

        // Internal to the app we use 0-indexed
        this.locus.startBP -= 1
        console.log(`locus length ${ prettyPrint(this.locus.endBP - this.locus.startBP) }`)

        this.startNode = undefined
        for (const [nodeName, { assembly }] of Object.entries(nodes)) {

            if (undefined === this.startNode) {
                this.startNode = nodeName
            }

            const assemblySet = new Set()
            for(const item of assembly){
                assemblySet.add(GenomicService.tripleKey(item))
            }

            const metadata =  { assemblySet, sequence: sequences[nodeName] }
            this.metadata.set(nodeName, metadata);

        }

        // Build assembly set
        this.assemblySet = new Set()
        for (const [ key, { assemblySet }] of this.metadata) {
            for (const item of assemblySet){
                this.assemblySet.add(item)
            }
        }

        // Build assembly walk map

        pangenomeService.setDefaultLocusStartBp(this.locus.startBP)

        for (const assemblyKey of this.assemblySet){

            const assessmentConfig =
                {
                    includeOffSpineComponents: "none",
                    maxPathsPerEvent: 1,
                    maxRegionHops: 64,
                    maxRegionNodes: 4000,
                    maxRegionEdges: 4000,
                    operationBudget: 500000,
                    locusStartBp: this.locus.startBP
                };

            const walkConfig =
                {
                    startPolicy: "preferArrowEndpoint", // or "forceFromNode" with startNodeId
                    directionPolicy: "edgeFlow",
                };

            const features = pangenomeService.getSpineFeatures(assemblyKey, assessmentConfig, walkConfig)

            const assemblySubgraph = pangenomeService.getAssemblySubgraph(assemblyKey);

            this.assemblyWalkMap.set(assemblyKey, { spineFeatures: features, assemblySubgraph })
        }

        const uniqueColors = getPerceptuallyDistinctColors(1 + this.assemblySet.size)
        const uniqueColorsRandomized = Array.from(uniqueRandomGenerator(uniqueColors, uniqueColors.length - 1));

        let i = 0;
        for (const assemblyKey of this.assemblySet) {
            this.assemblyPayload.set(assemblyKey, { color:uniqueColorsRandomized[ i ] });
            i++;
        }

    }

    getAssemblyListForNodeName(nodeName) {
        const metadata = this.metadata.get(nodeName);
        if (!metadata) {
            console.error(`GenomicService: Metadata not found for node: ${nodeName}`);
            return null;
        }
        return [ ...metadata.assemblySet ]
    }

    getAssemblyForNodeName(nodeName) {
        const metadata = this.metadata.get(nodeName);
        if (!metadata) {
            console.error(`GenomicService: Metadata not found for node: ${nodeName}`);
            return null;
        }
        return metadata.assembly;
    }

    getAssemblyColor(assembly) {
        return this.assemblyPayload.get(assembly).color;
    }

    getNodeNameSetWithAssembly(assembly) {

        const nodeNameSet = new Set()
        for (const nodeName of this.getNodeNameSet()) {
            const assemblies = [ ...this.metadata.get(nodeName).assemblySet ]
            if (new Set([ ...assemblies]).has(assembly)) {
                nodeNameSet.add (nodeName)
            }
        }

        return nodeNameSet.size > 0 ? nodeNameSet : undefined
    }

    getNodeNameSet() {
        return new Set(this.metadata.keys());
    }

    clear() {

        this.startNode = undefined

        this.metadata.clear()

        this.assemblyPayload.clear()

        this.nodeAssemblyStats.clear()

        this.assemblySet.clear()

        this.assemblyWalkMap.clear()

    }

    static tripleKey(a) {
        return `${a.assembly_name}#${a.haplotype}#${a.sequence_id}`
    }

}

export default GenomicService;
