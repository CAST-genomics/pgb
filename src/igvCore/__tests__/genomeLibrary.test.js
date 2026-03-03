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
