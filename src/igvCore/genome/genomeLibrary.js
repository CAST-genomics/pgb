import { getGenomeConfig } from './genomeRegistry.js';
import Genome from './genome.js';
import TextFeatureSource from '../io/textFeatureSource.js';
import BWSource from '../io/bigwig/bwSource.js';
import QTLSelections from '../qtl/qtlSelections.js';
import FeatureRenderer from '../rendering/featureRenderer.js';

const bbFormats = new Set(['bigwig', 'bw', 'bigbed', 'bb', 'biginteract', 'biggenepred', 'bignarrowpeak']);

class GenomeLibrary {
    constructor() {
    }

    async getGenomePayload(genomeId) {

        const config = getGenomeConfig(genomeId);

        if (!config) {
            return undefined
        }

        console.log(`GenomeLibrary: creating genome "${genomeId}" ...`)
        console.time(`GenomeLibrary: genome "${genomeId}" created`)
        const genome = await Genome.createGenome(config)
        console.timeEnd(`GenomeLibrary: genome "${genomeId}" created`)

        const [ refseqSelectTrackConfig ] = genome.config.tracks
        const trackFormat = refseqSelectTrackConfig.format ? refseqSelectTrackConfig.format.toLowerCase() : undefined
        const geneFeatureSource = bbFormats.has(trackFormat)
            ? new BWSource({ ...refseqSelectTrackConfig, type: "annotation" }, genome)
            : new TextFeatureSource({ ...refseqSelectTrackConfig, type: "annotation", expandQuery: false }, genome)

        const browser = { genome, qtlSelections: new QTLSelections() }
        const rendererFormat = trackFormat || "refgene"
        const geneRendererConfig = { format: rendererFormat, type: "annotation", displayMode: "COLLAPSED", browser }

        const geneRenderer = new FeatureRenderer(geneRendererConfig)

        return { genome, geneFeatureSource, geneRenderer }
    }
}

export default GenomeLibrary;
