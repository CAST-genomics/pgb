import LocusInput from "./locusInput.js"
import {prettyPrint} from "./utils/utils.js"
import { frequencyAnalysisService } from "./frequencyAnalysisService.js"
import {getAllSuperpopulationNames,getAllPopulationNames} from "./utils/populationUtils.js"

class GenomicService {

    constructor() {
        this.nodeMetadata = new Map()
        this.nodeAssemblyStats = new Map()
        this.assemblySet = new Set()
        this.assemblyWalkMap = new Map()
        this.startNode = undefined
    }

    async initialize(json, pangenomeService) {

        const { locus:locusString, node:nodes, sequence:sequences } = json

        this.locus = LocusInput.parseLocusString(locusString)

        // Internal to the app we use 0-indexed
        this.locus.startBP -= 1
        console.log(`locus length ${ prettyPrint(this.locus.endBP - this.locus.startBP) }`)

        this.startNode = undefined
        for (const [nodeName, { length, assembly, assembly_metadata }] of Object.entries(nodes)) {

            if (undefined === this.startNode) {
                this.startNode = nodeName
            }

            const assemblySet = new Set()
            for(const item of assembly){
                assemblySet.add(GenomicService.tripleKey(item))
            }

            const { frequency, count } = assembly_metadata
            this.nodeMetadata.set(nodeName, { assemblySet, frequency, count, length, sequence: sequences[nodeName] });

        }

        frequencyAnalysisService.analyzeGlobalDistributions(this.nodeMetadata, 'superpopulation', getAllSuperpopulationNames().map(({acronym}) => acronym))
        frequencyAnalysisService.analyzeGlobalDistributions(this.nodeMetadata, 'population', getAllPopulationNames().map(({acronym}) => acronym))

        this.assemblySet = new Set()
        for (const [ key, { assemblySet }] of this.nodeMetadata) {
            for (const item of assemblySet){
                this.assemblySet.add(item)
            }
        }

        console.log(`assembly set ${ this.assemblySet.size }`)

        pangenomeService.setDefaultLocusStartBp(this.locus.startBP)

        for (const assemblyKey of this.assemblySet){

            const sequenceId = assemblyKey.split('#')[2] ?? '';
            const isReference = (sequenceId === this.locus.chr);
            const effectiveLocusStartBp = isReference ? this.locus.startBP : 0;

            const assessmentConfig =
                {
                    includeOffSpineComponents: "none",
                    maxPathsPerEvent: 1,
                    maxRegionHops: 64,
                    maxRegionNodes: 4000,
                    maxRegionEdges: 4000,
                    operationBudget: 500000,
                    locusStartBp: effectiveLocusStartBp,
                    sequenceId: isReference ? this.locus.chr : assemblyKey,
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

    }

    getAssemblyListForNodeName(nodeName) {
        const metadata = this.nodeMetadata.get(nodeName);
        if (!metadata) {
            console.error(`GenomicService: Metadata not found for node: ${nodeName}`);
            return null;
        }
        return [ ...metadata.assemblySet ]
    }

    getAssemblyForNodeName(nodeName) {
        const metadata = this.nodeMetadata.get(nodeName);
        if (!metadata) {
            console.error(`GenomicService: Metadata not found for node: ${nodeName}`);
            return null;
        }
        return metadata.assembly;
    }

    getNodeNameSetWithAssembly(assembly) {

        const nodeNameSet = new Set()
        for (const nodeName of this.getNodeNameSet()) {
            const assemblies = [ ...this.nodeMetadata.get(nodeName).assemblySet ]
            if (new Set([ ...assemblies]).has(assembly)) {
                nodeNameSet.add (nodeName)
            }
        }

        return nodeNameSet.size > 0 ? nodeNameSet : undefined
    }

    getNodeNameSet() {
        return new Set(this.nodeMetadata.keys());
    }

    clear() {

        this.startNode = undefined

        this.nodeMetadata.clear()

        this.nodeAssemblyStats.clear()

        this.assemblySet.clear()

        this.assemblyWalkMap.clear()

        frequencyAnalysisService.clear()

    }

    static tripleKey(a) {
        return `${a.assembly_name}#${a.haplotype}#${a.sequence_id}`
    }

    static presentationAssemblyLabel(assemblyKey) {

        const [ assembly_name, haplotype, sequence_id ] = assemblyKey.split('#')
        return [ `${assembly_name}`, `${ haplotype }` ]
    }

}

export default GenomicService;
