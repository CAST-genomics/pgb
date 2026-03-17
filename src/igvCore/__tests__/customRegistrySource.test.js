import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('igv-utils', async () => {
    const actual = await vi.importActual('igv-utils')
    return {
        ...actual,
        igvxhr: {
            loadJson: vi.fn(),
        },
    }
})

import { initialize } from '../genome/customRegistrySource.js'
import { igvxhr } from 'igv-utils'

const fixtureGenomes = [
    { id: 'custom1', name: 'Custom Genome 1', fastaURL: 'https://example.com/custom1.fa' },
    { id: 'custom2', name: 'Custom Genome 2', fastaURL: 'https://example.com/custom2.fa' },
]

beforeEach(() => {
    vi.clearAllMocks()
})

describe('customRegistrySource', () => {

    it('initialize(url) fetches from given URL and returns Map keyed by id', async () => {
        igvxhr.loadJson.mockResolvedValueOnce(fixtureGenomes)

        const map = await initialize('https://example.com/custom-genomes.json')

        expect(igvxhr.loadJson).toHaveBeenCalledWith('https://example.com/custom-genomes.json', {})
        expect(map).toBeInstanceOf(Map)
        expect(map.get('custom1')).toEqual(fixtureGenomes[0])
        expect(map.get('custom2')).toEqual(fixtureGenomes[1])
    })

    it('returns empty Map when URL is null (no fetch attempted)', async () => {
        const map = await initialize(null)

        expect(igvxhr.loadJson).not.toHaveBeenCalled()
        expect(map.size).toBe(0)
    })

    it('returns empty Map when URL is undefined (no fetch attempted)', async () => {
        const map = await initialize(undefined)

        expect(igvxhr.loadJson).not.toHaveBeenCalled()
        expect(map.size).toBe(0)
    })

    it('returns empty Map when fetch fails (no throw)', async () => {
        igvxhr.loadJson.mockRejectedValueOnce(new Error('Network error'))

        const map = await initialize('https://example.com/bad.json')

        expect(map).toBeInstanceOf(Map)
        expect(map.size).toBe(0)
    })

    it('accepts a single genome object (not wrapped in array) and returns a 1-entry Map', async () => {
        const singleGenome = { id: 'solo', name: 'Solo Genome', fastaURL: 'https://example.com/solo.fa' }
        igvxhr.loadJson.mockResolvedValueOnce(singleGenome)

        const map = await initialize('https://example.com/single-genome.json')

        expect(map).toBeInstanceOf(Map)
        expect(map.size).toBe(1)
        expect(map.get('solo')).toEqual(singleGenome)
    })

    it('returns empty Map when response is not a valid genome config or array', async () => {
        igvxhr.loadJson.mockResolvedValueOnce({ not: 'a genome' })

        const map = await initialize('https://example.com/bad-format.json')

        expect(map).toBeInstanceOf(Map)
        expect(map.size).toBe(0)
    })
})
