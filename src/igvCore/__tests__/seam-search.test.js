import { describe, it, expect, vi } from 'vitest'

// Mock igvxhr before importing search module
vi.mock('igv-utils', async () => {
    const actual = await vi.importActual('igv-utils')
    return {
        ...actual,
        igvxhr: {
            loadString: vi.fn(),
        },
    }
})

import { searchFeatures } from '../search/geneSearch.js'
import { igvxhr } from 'igv-utils'

describe('searchFeatures (seam test)', () => {

    it('resolves a gene name to a locus via web service', async () => {
        // Mock the IGV search service response format: "GENE\tchr:start-end\tsource"
        igvxhr.loadString.mockResolvedValueOnce('BRCA2\tchr13:32,315,474-32,400,266\trefseq')

        const browser = {
            genome: {
                id: 'hg38',
                getChromosomeName: chr => chr,
            },
        }

        const result = await searchFeatures(browser, 'brca2')

        expect(result).toBeDefined()
        expect(result.chr).toBe('chr13')
        expect(result.start).toBe(32315473) // 1-based to 0-based (coords: 0 in DEFAULT_SEARCH_CONFIG)
        expect(result.end).toBe(32400266)
    })

    it('returns undefined when web service returns empty result', async () => {
        igvxhr.loadString.mockResolvedValueOnce('')

        const browser = {
            genome: {
                id: 'hg38',
                getChromosomeName: chr => chr,
            },
        }

        const result = await searchFeatures(browser, 'NONEXISTENT_GENE')
        expect(result).toBeUndefined()
    })

    it('returns undefined when web service throws', async () => {
        igvxhr.loadString.mockRejectedValueOnce(new Error('Network error'))

        const browser = {
            genome: {
                id: 'hg38',
                getChromosomeName: chr => chr,
            },
        }

        const result = await searchFeatures(browser, 'brca2')
        expect(result).toBeUndefined()
    })
})
