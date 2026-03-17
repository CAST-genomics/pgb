import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('igv-utils', async () => {
    const actual = await vi.importActual('igv-utils')
    return {
        ...actual,
        igvxhr: {
            load: vi.fn(),
        },
    }
})

import IndexedFasta from '../genome/indexedFasta.js'
import { igvxhr } from 'igv-utils'

beforeEach(() => {
    vi.clearAllMocks()
})

// A typical .fai file has 5 tab-separated columns per line:
// NAME  LENGTH  OFFSET  BASES_PER_LINE  BYTES_PER_LINE
const FAI_DATA = [
    'chr1\t1000\t6\t50\t51',
    'chr2\t500\t1063\t50\t51',
].join('\n')

describe('IndexedFasta', () => {

    describe('getIndex', () => {

        it('parses .fai file into index entries', async () => {
            igvxhr.load.mockResolvedValue(FAI_DATA)

            const fasta = new IndexedFasta({
                fastaURL: 'http://example.com/genome.fa',
                indexURL: 'http://example.com/genome.fa.fai',
            })

            const index = await fasta.getIndex()

            expect(index.chr1).toEqual({
                size: 1000,
                position: 6,
                basesPerLine: 50,
                bytesPerLine: 51,
            })
            expect(index.chr2).toEqual({
                size: 500,
                position: 1063,
                basesPerLine: 50,
                bytesPerLine: 51,
            })
        })

        it('populates chromosomes Map with Chromosome objects', async () => {
            igvxhr.load.mockResolvedValue(FAI_DATA)

            const fasta = new IndexedFasta({
                fastaURL: 'http://example.com/genome.fa',
                indexURL: 'http://example.com/genome.fa.fai',
            })

            await fasta.init()

            expect(fasta.chromosomes.size).toBe(2)
            const chr1 = fasta.chromosomes.get('chr1')
            expect(chr1.name).toBe('chr1')
            expect(chr1.order).toBe(0)
            expect(chr1.bpLength).toBe(1000)

            const chr2 = fasta.chromosomes.get('chr2')
            expect(chr2.name).toBe('chr2')
            expect(chr2.order).toBe(1)
            expect(chr2.bpLength).toBe(500)
        })

        it('exposes chromosomeNames as an array', async () => {
            igvxhr.load.mockResolvedValue(FAI_DATA)

            const fasta = new IndexedFasta({
                fastaURL: 'http://example.com/genome.fa',
                indexURL: 'http://example.com/genome.fa.fai',
            })

            await fasta.init()

            expect(fasta.chromosomeNames).toEqual(['chr1', 'chr2'])
            expect(fasta.getFirstChromosomeName()).toBe('chr1')
        })

        it('caches index on subsequent calls', async () => {
            igvxhr.load.mockResolvedValue(FAI_DATA)

            const fasta = new IndexedFasta({
                fastaURL: 'http://example.com/genome.fa',
                indexURL: 'http://example.com/genome.fa.fai',
            })

            await fasta.getIndex()
            await fasta.getIndex()

            // Should only fetch once
            expect(igvxhr.load).toHaveBeenCalledTimes(1)
        })
    })

    describe('readSequence', () => {

        it('calculates correct byte range and fetches via HTTP range request', async () => {
            // .fai: chr1 has 1000 bases, offset 6, 50 bases/line, 51 bytes/line
            igvxhr.load
                .mockResolvedValueOnce(FAI_DATA)       // .fai load
                .mockResolvedValueOnce('ACGTACGTAC')   // sequence range load

            const fasta = new IndexedFasta({
                fastaURL: 'http://example.com/genome.fa',
                indexURL: 'http://example.com/genome.fa.fai',
            })

            const seq = await fasta.readSequence('chr1', 0, 10)

            expect(seq).toBe('ACGTACGTAC')
            // Second call should be the range request for the sequence
            expect(igvxhr.load).toHaveBeenCalledTimes(2)
            const rangeCall = igvxhr.load.mock.calls[1]
            expect(rangeCall[0]).toBe('http://example.com/genome.fa')
            expect(rangeCall[1]).toEqual(expect.objectContaining({
                range: expect.objectContaining({ start: 6, size: 10 })
            }))
        })

        it('strips line endings from FASTA data spanning multiple lines', async () => {
            // Request bases 45-55 which spans a line boundary (50 bases/line)
            // offset=6, basesPerLine=50, bytesPerLine=51
            // startLine = floor(45/50) = 0, base0 = 0, offset = 45
            // startByte = 6 + 0*51 + 45 = 51
            // endLine = floor(55/50) = 1, base1 = 50, offset1 = 5
            // endByte = 6 + 1*51 + 5 - 1 = 61
            // byteCount = 61 - 51 + 1 = 11
            // The 11 bytes include 5 bases + \n + 5 bases = "AAAAA\nBBBBB"
            igvxhr.load
                .mockResolvedValueOnce(FAI_DATA)
                .mockResolvedValueOnce('AAAAA\nBBBBB')

            const fasta = new IndexedFasta({
                fastaURL: 'http://example.com/genome.fa',
                indexURL: 'http://example.com/genome.fa.fai',
            })

            const seq = await fasta.readSequence('chr1', 45, 55)

            // Should strip the newline
            expect(seq).toBe('AAAAABBBBB')
        })

        it('returns null for unknown chromosome', async () => {
            igvxhr.load.mockResolvedValue(FAI_DATA)

            const fasta = new IndexedFasta({
                fastaURL: 'http://example.com/genome.fa',
                indexURL: 'http://example.com/genome.fa.fai',
            })

            const seq = await fasta.readSequence('chrUnknown', 0, 100)

            expect(seq).toBeNull()
        })
    })
})
