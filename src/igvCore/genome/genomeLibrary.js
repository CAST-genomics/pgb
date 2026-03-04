import { getGenomeConfig } from './genomeRegistry.js';
import Genome from './genome.js';
import TextFeatureSource from '../io/textFeatureSource.js';
import QTLSelections from '../qtl/qtlSelections.js';
import FeatureRenderer from '../rendering/featureRenderer.js';

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
        const geneFeatureSource = new TextFeatureSource({ ...refseqSelectTrackConfig, type: "annotation", expandQuery: false }, genome)

        const browser = { genome, qtlSelections: new QTLSelections() }
        const trackFormat = refseqSelectTrackConfig.format || "refgene"
        const geneRendererConfig = { format: trackFormat, type: "annotation", displayMode: "COLLAPSED", browser }

        const geneRenderer = new FeatureRenderer(geneRendererConfig)

        return { genome, geneFeatureSource, geneRenderer }
    }
}

export default GenomeLibrary;
