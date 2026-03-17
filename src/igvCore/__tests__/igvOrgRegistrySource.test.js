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

import { initialize, PRIMARY_URL, BACKUP_URL } from '../genome/igvOrgRegistrySource.js'
import { igvxhr } from 'igv-utils'

const fixtureGenomes = [
    { id: 'hg38', name: 'Human (GRCh38/hg38)' },
    { id: 'mm39', name: 'Mouse (GRCm39/mm39)' },
]

beforeEach(() => {
    vi.clearAllMocks()
})

describe('igvOrgRegistrySource', () => {

    it('initialize() fetches from primary URL with 2s timeout and returns Map keyed by id', async () => {
        igvxhr.loadJson.mockResolvedValueOnce(fixtureGenomes)

        const map = await initialize()

        expect(igvxhr.loadJson).toHaveBeenCalledWith(PRIMARY_URL, { timeout: 2000 })
        expect(map).toBeInstanceOf(Map)
        expect(map.get('hg38')).toEqual(fixtureGenomes[0])
        expect(map.get('mm39')).toEqual(fixtureGenomes[1])
    })

    it('falls back to backup URL (10s timeout) when primary fails', async () => {
        igvxhr.loadJson
            .mockRejectedValueOnce(new Error('Network error'))
            .mockResolvedValueOnce(fixtureGenomes)

        const map = await initialize()

        expect(igvxhr.loadJson).toHaveBeenCalledTimes(2)
        expect(igvxhr.loadJson).toHaveBeenNthCalledWith(2, BACKUP_URL, { timeout: 10000 })
        expect(map.get('hg38')).toEqual(fixtureGenomes[0])
    })

    it('returns empty Map (no throw) when both URLs fail', async () => {
        igvxhr.loadJson
            .mockRejectedValueOnce(new Error('Primary failed'))
            .mockRejectedValueOnce(new Error('Backup failed'))

        const map = await initialize()

        expect(map).toBeInstanceOf(Map)
        expect(map.size).toBe(0)
    })
})
