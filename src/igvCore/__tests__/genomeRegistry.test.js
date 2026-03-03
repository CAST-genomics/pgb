import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock igvxhr before importing registry module
vi.mock('igv-utils', async () => {
    const actual = await vi.importActual('igv-utils')
    return {
        ...actual,
        igvxhr: {
            loadJson: vi.fn(),
        },
    }
})

import {
    initializeGenomeRegistry,
    getGenomeConfig,
    isInitialized,
    resetRegistry,
} from '../genome/genomeRegistry.js'
import { igvxhr } from 'igv-utils'

const fixtureGenomes = [
    { id: 'hg38', name: 'Human (GRCh38/hg38)', twoBitURL: 'https://example.com/hg38.2bit', tracks: [] },
    { id: 'mm39', name: 'Mouse (GRCm39/mm39)', twoBitURL: 'https://example.com/mm39.2bit', tracks: [] },
]

beforeEach(() => {
    resetRegistry()
    vi.clearAllMocks()
})

describe('genomeRegistry', () => {

    // Round 1: Basic fetch and lookup
    describe('basic fetch and lookup', () => {

        it('initializeGenomeRegistry fetches from primary URL with 2s timeout', async () => {
            igvxhr.loadJson.mockResolvedValueOnce(fixtureGenomes)

            await initializeGenomeRegistry()

            expect(igvxhr.loadJson).toHaveBeenCalledWith(
                'https://igv.org/genomes/genomes3.json',
                { timeout: 2000 }
            )
        })

        it('getGenomeConfig returns matching config after init', async () => {
            igvxhr.loadJson.mockResolvedValueOnce(fixtureGenomes)

            await initializeGenomeRegistry()

            const config = getGenomeConfig('hg38')
            expect(config).toEqual(fixtureGenomes[0])
        })

        it('getGenomeConfig returns undefined for nonexistent id', async () => {
            igvxhr.loadJson.mockResolvedValueOnce(fixtureGenomes)

            await initializeGenomeRegistry()

            expect(getGenomeConfig('nonexistent')).toBeUndefined()
        })
    })

    // Round 2: Singleton
    describe('singleton behavior', () => {

        it('second call to initializeGenomeRegistry does not re-fetch', async () => {
            igvxhr.loadJson.mockResolvedValueOnce(fixtureGenomes)

            await initializeGenomeRegistry()
            await initializeGenomeRegistry()

            expect(igvxhr.loadJson).toHaveBeenCalledTimes(1)
        })
    })

    // Round 3: Fallback to backup URL
    describe('fallback to backup URL', () => {

        it('when primary rejects, fetches from backup URL with 10s timeout', async () => {
            igvxhr.loadJson
                .mockRejectedValueOnce(new Error('Network error'))
                .mockResolvedValueOnce(fixtureGenomes)

            await initializeGenomeRegistry()

            expect(igvxhr.loadJson).toHaveBeenCalledTimes(2)
            expect(igvxhr.loadJson).toHaveBeenNthCalledWith(2,
                'https://raw.githubusercontent.com/igvteam/igv/master/resources/genomes3.json',
                { timeout: 10000 }
            )
            expect(getGenomeConfig('hg38')).toEqual(fixtureGenomes[0])
        })
    })

    // Round 4: Graceful degradation
    describe('graceful degradation when both URLs fail', () => {

        it('isInitialized is true and getGenomeConfig returns undefined', async () => {
            igvxhr.loadJson
                .mockRejectedValueOnce(new Error('Primary failed'))
                .mockRejectedValueOnce(new Error('Backup failed'))

            await initializeGenomeRegistry()

            expect(isInitialized()).toBe(true)
            expect(getGenomeConfig('hg38')).toBeUndefined()
        })

        it('does not throw', async () => {
            igvxhr.loadJson
                .mockRejectedValueOnce(new Error('Primary failed'))
                .mockRejectedValueOnce(new Error('Backup failed'))

            await expect(initializeGenomeRegistry()).resolves.not.toThrow()
        })
    })

    // Round 5: Alias resolution
    describe('alias resolution', () => {

        it('getGenomeConfig resolves GRCh38 alias to hg38', async () => {
            igvxhr.loadJson.mockResolvedValueOnce(fixtureGenomes)

            await initializeGenomeRegistry()

            expect(getGenomeConfig('GRCh38')).toEqual(fixtureGenomes[0])
        })

        it('getGenomeConfig resolves GRCm39 alias to mm39', async () => {
            igvxhr.loadJson.mockResolvedValueOnce(fixtureGenomes)

            await initializeGenomeRegistry()

            expect(getGenomeConfig('GRCm39')).toEqual(fixtureGenomes[1])
        })
    })

    // Round 6: Pre-initialization guard
    describe('pre-initialization guard', () => {

        it('getGenomeConfig throws before init', () => {
            expect(() => getGenomeConfig('hg38')).toThrow('GenomeRegistry has not been initialized')
        })
    })
})
