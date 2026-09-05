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

// The MANE tier is consulted first; a stub that knows nothing falls through to
// the web service, which is what these tests are about.
const makeBrowser = (maneTranscript = null) => ({
    genome: {
        id: 'hg38',
        getChromosomeName: chr => chr,
        getManeTranscript: async () => maneTranscript,
    },
})

describe('searchFeatures (seam test)', () => {

    // Regression: the gene lookup broke because it went straight to
    // igv.org/genomes/locus.php, which now answers in 3-6s and straddles the
    // client timeout. igv.js does not have this problem because it resolves the
    // common gene name from an indexed MANE bigBed first. So do we.
    it('resolves from MANE transcripts without touching the web service', async () => {
        igvxhr.loadString.mockClear()
        const mane = {chr: 'chr11', start: 108222802, end: 108369102, name: 'ATM'}

        const result = await searchFeatures(makeBrowser(mane), 'atm')

        expect(result).toBe(mane)
        expect(igvxhr.loadString).not.toHaveBeenCalled()
    })

    it('resolves a gene name to a locus via web service', async () => {
        // Mock the IGV search service response format: "GENE\tchr:start-end\tsource"
        igvxhr.loadString.mockResolvedValueOnce('BRCA2\tchr13:32,315,474-32,400,266\trefseq')

        const browser = makeBrowser()

        const result = await searchFeatures(browser, 'brca2')

        expect(result).toBeDefined()
        expect(result.chr).toBe('chr13')
        expect(result.start).toBe(32315473) // 1-based to 0-based (coords: 0 in DEFAULT_SEARCH_CONFIG)
        expect(result.end).toBe(32400266)
    })

    it('returns undefined when web service returns empty result', async () => {
        igvxhr.loadString.mockResolvedValueOnce('')

        const browser = makeBrowser()

        const result = await searchFeatures(browser, 'NONEXISTENT_GENE')
        expect(result).toBeUndefined()
    })

    // Regression: the upstream locus service now answers in 3-6s, straddling
    // the client timeout. searchFeatures used to swallow that, which made a
    // timeout indistinguishable from an unknown gene -- so the locus input
    // blamed what the user typed ("Invalid input format") for a lookup that
    // never happened. A failed lookup must surface as a failure.
    it('throws when the web service fails, rather than reporting no such gene', async () => {
        igvxhr.loadString.mockImplementationOnce(() => { throw new Error('Timed out') })

        const browser = makeBrowser()

        let thrown
        try {
            await searchFeatures(browser, 'brca2')
        } catch (error) {
            thrown = error
        }
        expect(thrown?.message).toBe('Timed out')
    })

    it('allows the slow upstream service more than five seconds', async () => {
        igvxhr.loadString.mockResolvedValueOnce('')

        const browser = makeBrowser()

        await searchFeatures(browser, 'brca2')

        const [, options] = igvxhr.loadString.mock.calls.at(-1)
        expect(options.timeout).toBeGreaterThan(5000)
    })
})
