import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the two source modules
vi.mock('../genome/igvOrgRegistrySource.js', () => ({
    initialize: vi.fn(),
}))

vi.mock('../genome/customRegistrySource.js', () => ({
    initialize: vi.fn(),
}))

import {
    initializeGenomeRegistry,
    getGenomeConfig,
    isInitialized,
    resetRegistry,
    setCustomRegistryURL,
} from '../genome/genomeRegistry.js'
import { initialize as initIgvOrg } from '../genome/igvOrgRegistrySource.js'
import { initialize as initCustom } from '../genome/customRegistrySource.js'

const fixtureGenomes = [
    { id: 'hg38', name: 'Human (GRCh38/hg38)', twoBitURL: 'https://example.com/hg38.2bit', tracks: [] },
    { id: 'mm39', name: 'Mouse (GRCm39/mm39)', twoBitURL: 'https://example.com/mm39.2bit', tracks: [] },
]

beforeEach(() => {
    resetRegistry()
    vi.clearAllMocks()
    // Default: igv.org returns fixtures, custom returns empty
    initIgvOrg.mockResolvedValue(new Map(fixtureGenomes.map(g => [g.id, g])))
    initCustom.mockResolvedValue(new Map())
})

describe('genomeRegistry', () => {

    // Basic fetch and lookup
    describe('basic fetch and lookup', () => {

        it('initializeGenomeRegistry calls both sources', async () => {
            await initializeGenomeRegistry()

            expect(initIgvOrg).toHaveBeenCalledTimes(1)
            expect(initCustom).toHaveBeenCalledTimes(1)
        })

        it('getGenomeConfig returns matching config after init', async () => {
            await initializeGenomeRegistry()

            const config = getGenomeConfig('hg38')
            expect(config).toEqual(fixtureGenomes[0])
        })

        it('getGenomeConfig returns undefined for nonexistent id', async () => {
            await initializeGenomeRegistry()

            expect(getGenomeConfig('nonexistent')).toBeUndefined()
        })
    })

    // Singleton
    describe('singleton behavior', () => {

        it('second call to initializeGenomeRegistry does not re-fetch', async () => {
            await initializeGenomeRegistry()
            await initializeGenomeRegistry()

            expect(initIgvOrg).toHaveBeenCalledTimes(1)
            expect(initCustom).toHaveBeenCalledTimes(1)
        })
    })

    // Graceful degradation
    describe('graceful degradation', () => {

        it('igv.org source failure does not block custom results', async () => {
            const customGenome = { id: 'custom1', name: 'Custom' }
            initIgvOrg.mockResolvedValue(new Map())
            initCustom.mockResolvedValue(new Map([['custom1', customGenome]]))

            await initializeGenomeRegistry()

            expect(isInitialized()).toBe(true)
            expect(getGenomeConfig('custom1')).toEqual(customGenome)
        })

        it('custom source failure does not block igv.org results', async () => {
            initCustom.mockResolvedValue(new Map())

            await initializeGenomeRegistry()

            expect(isInitialized()).toBe(true)
            expect(getGenomeConfig('hg38')).toEqual(fixtureGenomes[0])
        })
    })

    // Alias resolution
    describe('alias resolution', () => {

        it('getGenomeConfig resolves GRCh38 alias to hg38', async () => {
            await initializeGenomeRegistry()

            expect(getGenomeConfig('GRCh38')).toEqual(fixtureGenomes[0])
        })

        it('getGenomeConfig resolves GRCm39 alias to mm39', async () => {
            await initializeGenomeRegistry()

            expect(getGenomeConfig('GRCm39')).toEqual(fixtureGenomes[1])
        })

        it('alias resolution works against merged Map (custom genome with alias)', async () => {
            const customHg38 = { id: 'hg38', name: 'Custom hg38' }
            initCustom.mockResolvedValue(new Map([['hg38', customHg38]]))

            await initializeGenomeRegistry()

            expect(getGenomeConfig('GRCh38')).toEqual(customHg38)
        })
    })

    // Pre-initialization guard
    describe('pre-initialization guard', () => {

        it('getGenomeConfig throws before init', () => {
            expect(() => getGenomeConfig('hg38')).toThrow('GenomeRegistry has not been initialized')
        })
    })

    // Facade: merge precedence
    describe('merge precedence', () => {

        it('custom config takes precedence over igv.org on ID collision', async () => {
            const customHg38 = { id: 'hg38', name: 'Custom hg38', fastaURL: 'https://example.com/custom.fa' }
            initCustom.mockResolvedValue(new Map([['hg38', customHg38]]))

            await initializeGenomeRegistry()

            expect(getGenomeConfig('hg38')).toEqual(customHg38)
        })
    })

    // setCustomRegistryURL
    describe('setCustomRegistryURL', () => {

        it('configures the custom source URL', async () => {
            setCustomRegistryURL('https://example.com/custom-genomes.json')

            await initializeGenomeRegistry()

            expect(initCustom).toHaveBeenCalledWith('https://example.com/custom-genomes.json')
        })

        it('custom source receives undefined when no URL is set', async () => {
            await initializeGenomeRegistry()

            expect(initCustom).toHaveBeenCalledWith(undefined)
        })
    })
})
