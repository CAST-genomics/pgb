import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock igv-utils
vi.mock('igv-utils', async () => {
    const actual = await vi.importActual('igv-utils')
    return {
        ...actual,
        igvxhr: {
            loadByteArray: vi.fn(),
            loadArrayBuffer: vi.fn(),
            loadString: vi.fn(),
        },
    }
})

// Mock indexFactory
vi.mock('../io/indexFactory.js', () => ({
    loadIndex: vi.fn(),
}))

// Mock BGZBlockLoader — use a function (not arrow) so it works with `new`
vi.mock('../io/bgzBlockLoader.js', () => {
    const MockBGZBlockLoader = vi.fn(function () {
        this.getData = vi.fn()
    })
    return { default: MockBGZBlockLoader }
})

// Mock BGZLineReader — use a function (not arrow) so it works with `new`
vi.mock('../io/bgzLineReader.js', () => {
    const MockBGZLineReader = vi.fn(function () {
        let calls = 0
        this.nextLine = async function () {
            if (calls === 0) {
                calls++
                return '##gff-version 3'
            }
            return undefined
        }
    })
    return { default: MockBGZLineReader }
})

import FeatureFileReader from '../io/featureFileReader.js'
import { igvxhr } from 'igv-utils'
import { loadIndex } from '../io/indexFactory.js'
import BGZBlockLoader from '../io/bgzBlockLoader.js'

beforeEach(() => {
    vi.clearAllMocks()
})

describe('FeatureFileReader', () => {

    describe('readFeatures without index', () => {

        it('falls back to loadFeaturesNoIndex when no indexURL', async () => {
            const gffData = 'chr1\t.\tgene\t100\t200\t.\t+\t.\tID=gene1'
            const encoded = new TextEncoder().encode(gffData)

            igvxhr.loadByteArray.mockResolvedValue(encoded)

            const reader = new FeatureFileReader({
                url: 'http://example.com/data.gff3',
                format: 'gff3',
            })

            const features = await reader.readFeatures('chr1', 0, 1000)

            expect(loadIndex).not.toHaveBeenCalled()
            expect(features.length).toBeGreaterThan(0)
            expect(reader.indexed).toBe(false)
        })
    })

    describe('readFeatures with index', () => {

        it('dispatches to loadFeaturesWithIndex when indexURL is present', async () => {
            const mockIndex = {
                tabix: true,
                sequenceIndexMap: { chr1: 0 },
                sequenceNames: ['chr1'],
                chunksForRange: vi.fn().mockReturnValue([
                    {
                        minv: { block: 100, offset: 0 },
                        maxv: { block: 200, offset: 0 },
                    }
                ]),
            }
            loadIndex.mockResolvedValue(mockIndex)

            // Mock BGZBlockLoader.getData to return GFF3 bytes
            const gffLine = 'chr1\t.\tgene\t100\t200\t.\t+\t.\tID=gene1\n'
            const gffBytes = new TextEncoder().encode(gffLine)
            const mockGetData = vi.fn().mockResolvedValue(gffBytes)
            BGZBlockLoader.mockImplementation(function () {
                this.getData = mockGetData
            })

            const reader = new FeatureFileReader({
                url: 'http://example.com/data.gff3.gz',
                indexURL: 'http://example.com/data.gff3.gz.tbi',
                format: 'gff3',
            })

            const features = await reader.readFeatures('chr1', 0, 1000)

            expect(loadIndex).toHaveBeenCalledWith(
                'http://example.com/data.gff3.gz.tbi',
                expect.objectContaining({ url: 'http://example.com/data.gff3.gz' })
            )
            expect(reader.indexed).toBe(true)
            expect(mockIndex.chunksForRange).toHaveBeenCalledWith(0, 0, 1000)
            expect(mockGetData).toHaveBeenCalled()
            expect(features.length).toBeGreaterThan(0)
        })

        it('returns empty array when chromosome is not in index', async () => {
            const mockIndex = {
                tabix: true,
                sequenceIndexMap: { chr1: 0 },
                sequenceNames: ['chr1'],
                chunksForRange: vi.fn().mockReturnValue([]),
            }
            loadIndex.mockResolvedValue(mockIndex)

            const mockGetData = vi.fn()
            BGZBlockLoader.mockImplementation(function () {
                this.getData = mockGetData
            })

            const reader = new FeatureFileReader({
                url: 'http://example.com/data.gff3.gz',
                indexURL: 'http://example.com/data.gff3.gz.tbi',
                format: 'gff3',
            })

            const features = await reader.readFeatures('chrUnknown', 0, 1000)

            expect(features).toEqual([])
            expect(mockGetData).not.toHaveBeenCalled()
        })
    })

    describe('readHeader with index', () => {

        it('uses BGZLineReader for tabix-indexed files', async () => {
            const mockIndex = {
                tabix: true,
                sequenceIndexMap: { chr1: 0 },
                sequenceNames: ['chr1'],
            }
            loadIndex.mockResolvedValue(mockIndex)

            const reader = new FeatureFileReader({
                url: 'http://example.com/data.gff3.gz',
                indexURL: 'http://example.com/data.gff3.gz.tbi',
                format: 'gff3',
            })

            const header = await reader.readHeader()

            expect(reader.sequenceNames).toEqual(new Set(['chr1']))
            expect(reader._blockLoader).toBeDefined()
        })
    })
})
