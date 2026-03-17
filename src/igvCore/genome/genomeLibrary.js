import { knownGenomes } from './knownGenomes.js';
import Genome from './genome.js';
import TextFeatureSource from '../feature/textFeatureSource.js';
import QTLSelections from '../qtl/qtlSelections.js';
import FeatureRenderer from '../feature/featureRenderer.js';
import { genomeIDAliases } from './genomeIDAliases.js';

class GenomeLibrary {
    constructor() {
        // for (const [ key, value ] of Object.entries(knownGenomes)){
        //     const { name } = value
        //     console.log(`${ key }#${ name }`)
        // }
    }

    async getGenomePayload(genomeId) {

        const config = knownGenomes[genomeId] || knownGenomes[genomeIDAliases.get(genomeId)] || undefined;

        if (!config) {
            return undefined
        }

        const genome = await Genome.createGenome(config)

        const [ refseqSelectTrackConfig ] = genome.config.tracks
        const geneFeatureSource = new TextFeatureSource({ ...refseqSelectTrackConfig, type: "annotation", expandQuery: false }, genome)

        const browser = { genome, qtlSelections: new QTLSelections() }
        const geneRendererConfig = { format: "refgene", type: "annotation", displayMode: "COLLAPSED", browser }

        const geneRenderer = new FeatureRenderer(geneRendererConfig)

        return { genome, geneFeatureSource, geneRenderer }
    }
}

export default GenomeLibrary;
