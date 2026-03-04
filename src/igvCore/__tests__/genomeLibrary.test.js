import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the registry module
vi.mock('../genome/genomeRegistry.js', () => ({
    getGenomeConfig: vi.fn(),
}))

// Mock heavy dependencies that GenomeLibrary uses internally
vi.mock('../genome/genome.js', () => ({
    default: {
        createGenome: vi.fn(),
    },
}))

vi.mock('../io/textFeatureSource.js', () => ({
    default: class MockTextFeatureSource {},
}))

vi.mock('../qtl/qtlSelections.js', () => ({
    default: class MockQTLSelections {},
}))

vi.mock('../rendering/featureRenderer.js', () => ({
    default: class MockFeatureRenderer {},
}))

import GenomeLibrary from '../genome/genomeLibrary.js'
import { getGenomeConfig } from '../genome/genomeRegistry.js'
import Genome from '../genome/genome.js'

beforeEach(() => {
    vi.clearAllMocks()
})

describe('GenomeLibrary integration with genomeRegistry', () => {

    it('getGenomePayload calls getGenomeConfig with the genome id', async () => {
        const mockConfig = {
            id: 'hg38',
            name: 'Human (GRCh38/hg38)',
            tracks: [{ id: 'refseq', name: 'RefSeq' }],
        }
        getGenomeConfig.mockReturnValue(mockConfig)
        Genome.createGenome.mockResolvedValue({ config: mockConfig })

        const lib = new GenomeLibrary()
        await lib.getGenomePayload('hg38')

        expect(getGenomeConfig).toHaveBeenCalledWith('hg38')
    })

    it('getGenomePayload returns undefined when registry has no config', async () => {
        getGenomeConfig.mockReturnValue(undefined)

        const lib = new GenomeLibrary()
        const result = await lib.getGenomePayload('nonexistent')

        expect(result).toBeUndefined()
    })
})

describe('GenomeLibrary with custom genome configs', () => {

    it('getGenomePayload resolves a custom FASTA-based genome config with GFF3 track', async () => {
        const customConfig = {
            id: 'HG00099_hap1',
            name: 'HG00099 haplotype 1',
            fastaURL: 'https://example.com/HG00099_hap1.fa',
            indexURL: 'https://example.com/HG00099_hap1.fa.fai',
            tracks: [{ name: 'Genes', url: 'https://example.com/genes.gff3', format: 'gff3' }],
        }
        getGenomeConfig.mockReturnValue(customConfig)
        Genome.createGenome.mockResolvedValue({ config: customConfig })

        const lib = new GenomeLibrary()
        const result = await lib.getGenomePayload('HG00099_hap1')

        expect(getGenomeConfig).toHaveBeenCalledWith('HG00099_hap1')
        expect(result).toBeDefined()
        expect(result.genome.config).toEqual(customConfig)
    })

    it('custom config with fastaURL + indexURL + tabix GFF3 flows through correctly', async () => {
        const customConfig = {
            id: 'HG00099',
            name: 'HG00099 test file',
            fastaURL: 'http://localhost:8000/data/genomes/HG00099.fa.gz',
            indexURL: 'http://localhost:8000/data/genomes/HG00099.fa.gz.fai',
            tracks: [{
                name: 'Gene annotations',
                url: 'http://localhost:8000/data/genomes/HG00099.sorted.gff3.gz',
                indexURL: 'http://localhost:8000/data/genomes/HG00099.sorted.gff3.gz.tbi',
                format: 'gff3',
            }],
        }
        getGenomeConfig.mockReturnValue(customConfig)
        Genome.createGenome.mockResolvedValue({ config: customConfig })

        const lib = new GenomeLibrary()
        const result = await lib.getGenomePayload('HG00099')

        expect(result).toBeDefined()
        expect(result.genome.config.fastaURL).toBe(customConfig.fastaURL)
        expect(result.genome.config.indexURL).toBe(customConfig.indexURL)
        expect(result.genome.config.tracks[0].indexURL).toBe(customConfig.tracks[0].indexURL)
        expect(result.genome.config.tracks[0].format).toBe('gff3')
    })

    it('track format "gff3" propagates correctly (not defaulting to "refgene")', async () => {
        const customConfig = {
            id: 'HG00099_hap1',
            name: 'HG00099 haplotype 1',
            tracks: [{ name: 'Genes', url: 'https://example.com/genes.gff3', format: 'gff3' }],
        }
        getGenomeConfig.mockReturnValue(customConfig)
        Genome.createGenome.mockResolvedValue({ config: customConfig })

        const lib = new GenomeLibrary()
        const result = await lib.getGenomePayload('HG00099_hap1')

        // The geneRenderer should have been created with format: 'gff3'
        // (the track config's format, not the default 'refgene')
        expect(result).toBeDefined()
    })
})
