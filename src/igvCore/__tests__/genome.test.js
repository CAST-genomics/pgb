import { describe, it, expect } from 'vitest'

// Test the Genome model methods that PGB actually uses, using a minimal mock
// that avoids the full async init() path (which requires network I/O for sequences, aliases, etc.)

import Genome from '../genome/genome.js'

function createMinimalGenome() {
    // Construct a Genome with just enough state for the methods PGB uses
    const genome = new Genome({
        id: 'hg38',
        name: 'Human (GRCh38/hg38)',
    })

    // Manually populate chromosome map (normally done in async init())
    genome.chromosomes = new Map([
        ['chr1', { name: 'chr1', bpLength: 248956422 }],
        ['chr13', { name: 'chr13', bpLength: 114364328 }],
        ['chr17', { name: 'chr17', bpLength: 83257441 }],
    ])

    // Provide a minimal chromAlias that returns the canonical name
    genome.chromAlias = {
        getChromosomeName: (chr) => {
            // Simple alias: strip 'chr' prefix or add it
            if (genome.chromosomes.has(chr)) return chr
            if (genome.chromosomes.has('chr' + chr)) return 'chr' + chr
            return chr
        },
        getChromosomeAlias: (chr) => chr,
    }

    return genome
}

describe('Genome — PGB-used methods', () => {

    describe('getChromosome', () => {

        it('returns chromosome object by canonical name', () => {
            const genome = createMinimalGenome()
            const chr = genome.getChromosome('chr13')
            expect(chr).toBeDefined()
            expect(chr.name).toBe('chr13')
            expect(chr.bpLength).toBe(114364328)
        })

        it('returns undefined for unknown chromosome', () => {
            const genome = createMinimalGenome()
            expect(genome.getChromosome('chrZ')).toBeUndefined()
        })

        it('resolves alias via chromAlias', () => {
            const genome = createMinimalGenome()
            const chr = genome.getChromosome('17')
            expect(chr).toBeDefined()
            expect(chr.name).toBe('chr17')
        })
    })

    describe('getChromosomeName', () => {

        it('returns canonical name for known chromosome', () => {
            const genome = createMinimalGenome()
            expect(genome.getChromosomeName('chr1')).toBe('chr1')
        })

        it('resolves alias to canonical name', () => {
            const genome = createMinimalGenome()
            expect(genome.getChromosomeName('13')).toBe('chr13')
        })

        it('returns input for unknown chromosome', () => {
            const genome = createMinimalGenome()
            expect(genome.getChromosomeName('chrUn')).toBe('chrUn')
        })
    })

    describe('genome.id and genome.name', () => {

        it('exposes id and name from config', () => {
            const genome = createMinimalGenome()
            expect(genome.id).toBe('hg38')
            expect(genome.name).toBe('Human (GRCh38/hg38)')
        })
    })
})
