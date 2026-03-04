import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseTabixIndex, reg2bins, optimizeChunks } from '../io/tabixIndex.js'

// Helper: build a minimal valid tabix binary buffer
// Tabix format (after ungzip):
//   int32 magic (21578324)
//   int32 n_ref
//   int32 format, col_seq, col_beg, col_end, meta, skip, l_nm
//   null-terminated sequence names
//   per sequence: int32 n_bin, then bins, then int32 n_intv, then linear index
function buildTabixBuffer({ seqNames, bins = {}, linearIndex = [] }) {
    // Calculate size
    let namesLen = 0
    for (const name of seqNames) namesLen += name.length + 1 // null terminator

    // We'll build a simple index with one sequence and one bin containing one chunk
    const nref = seqNames.length

    // Calculate total buffer size
    // Header: 4 (magic) + 4 (nref) + 7*4 (format params) + namesLen
    // Per ref: 4 (nbin) + per bin: 4 (binNumber) + 4 (nchnk) + per chunk: 16 (2 vpointers)
    //        + 4 (nintv) + per interval: 8 (vpointer)
    let size = 4 + 4 + 28 + namesLen
    for (let r = 0; r < nref; r++) {
        const refBins = bins[r] || []
        size += 4 // nbin
        for (const bin of refBins) {
            size += 4 + 4 + bin.chunks.length * 16
        }
        const refLinear = linearIndex[r] || []
        size += 4 + refLinear.length * 8
    }

    const buffer = new ArrayBuffer(size)
    const dv = new DataView(buffer)
    let pos = 0

    const writeInt = (v) => { dv.setInt32(pos, v, true); pos += 4 }
    const writeVPointer = (block, offset) => {
        // VPointer encoding: 2 bytes offset (little-endian), then bytes 2-6 for block
        dv.setUint8(pos, offset & 0xff)
        dv.setUint8(pos + 1, (offset >> 8) & 0xff)
        dv.setUint8(pos + 2, block & 0xff)
        dv.setUint8(pos + 3, (block >> 8) & 0xff)
        dv.setUint8(pos + 4, (block >> 16) & 0xff)
        dv.setUint8(pos + 5, (block >> 24) & 0xff)
        dv.setUint8(pos + 6, 0)
        dv.setUint8(pos + 7, 0)
        pos += 8
    }

    // Magic
    writeInt(21578324)
    // nref
    writeInt(nref)
    // format params (7 ints)
    writeInt(2) // format: GFF
    writeInt(1) // col_seq
    writeInt(4) // col_beg
    writeInt(5) // col_end
    writeInt(35) // meta: '#'
    writeInt(0)  // skip
    writeInt(namesLen) // l_nm

    // Sequence names (null-terminated)
    for (const name of seqNames) {
        for (let i = 0; i < name.length; i++) {
            dv.setUint8(pos++, name.charCodeAt(i))
        }
        dv.setUint8(pos++, 0) // null terminator
    }

    // Per-reference data
    for (let r = 0; r < nref; r++) {
        const refBins = bins[r] || []
        writeInt(refBins.length)

        for (const bin of refBins) {
            writeInt(bin.binNumber)
            writeInt(bin.chunks.length)
            for (const chunk of bin.chunks) {
                writeVPointer(chunk.cs.block, chunk.cs.offset)
                writeVPointer(chunk.ce.block, chunk.ce.offset)
            }
        }

        const refLinear = linearIndex[r] || []
        writeInt(refLinear.length)
        for (const vp of refLinear) {
            writeVPointer(vp.block, vp.offset)
        }
    }

    return buffer
}

describe('tabixIndex', () => {

    describe('parseTabixIndex', () => {

        it('parses binary buffer into index with sequenceIndexMap, indices, and tabix flag', () => {
            const buffer = buildTabixBuffer({
                seqNames: ['chr1', 'chr2'],
                bins: {
                    0: [{
                        binNumber: 4681,
                        chunks: [{ cs: { block: 100, offset: 0 }, ce: { block: 200, offset: 0 } }]
                    }],
                },
                linearIndex: {
                    0: [{ block: 100, offset: 0 }],
                },
            })

            const index = parseTabixIndex(buffer)

            expect(index.tabix).toBe(true)
            expect(index.sequenceIndexMap).toEqual({ chr1: 0, chr2: 1 })
            expect(index.sequenceNames).toContain('chr1')
            expect(index.sequenceNames).toContain('chr2')
            expect(index.indices[0]).toBeDefined()
            expect(index.indices[0].binIndex).toBeDefined()
            expect(index.indices[0].linearIndex).toBeDefined()
        })

        it('throws for non-tabix binary data', () => {
            const buffer = new ArrayBuffer(32)
            const dv = new DataView(buffer)
            dv.setInt32(0, 12345, true) // wrong magic

            expect(() => parseTabixIndex(buffer)).toThrow('Not a tabix index file')
        })
    })

    describe('chunksForRange', () => {

        it('returns chunks for a valid refId and range', () => {
            const buffer = buildTabixBuffer({
                seqNames: ['chr1'],
                bins: {
                    0: [{
                        binNumber: 4681, // leaf bin for position 0-16383
                        chunks: [{ cs: { block: 1000, offset: 0 }, ce: { block: 2000, offset: 0 } }]
                    }],
                },
                linearIndex: {
                    0: [{ block: 1000, offset: 0 }],
                },
            })

            const index = parseTabixIndex(buffer)
            const chunks = index.chunksForRange(0, 0, 10000)

            expect(chunks.length).toBeGreaterThan(0)
            expect(chunks[0].minv).toBeDefined()
            expect(chunks[0].maxv).toBeDefined()
            expect(chunks[0].minv.block).toBe(1000)
        })

        it('returns empty array for unknown refId', () => {
            const buffer = buildTabixBuffer({
                seqNames: ['chr1'],
                bins: {
                    0: [{
                        binNumber: 4681,
                        chunks: [{ cs: { block: 1000, offset: 0 }, ce: { block: 2000, offset: 0 } }]
                    }],
                },
            })

            const index = parseTabixIndex(buffer)
            const chunks = index.chunksForRange(99, 0, 10000)

            expect(chunks).toEqual([])
        })
    })

    describe('reg2bins', () => {

        it('returns correct bin ranges for a genomic interval', () => {
            const bins = reg2bins(0, 16384)

            expect(bins.length).toBe(6)
            // First level is always [0, 0]
            expect(bins[0]).toEqual([0, 0])
            // Leaf level for 0-16384: bin 4681
            expect(bins[5]).toEqual([4681, 4681])
        })

        it('spans multiple bins for a large interval', () => {
            const bins = reg2bins(0, 100000)

            // Leaf level should span multiple bins
            expect(bins[5][1]).toBeGreaterThan(bins[5][0])
        })
    })

    describe('optimizeChunks', () => {

        it('returns empty array for empty input', () => {
            expect(optimizeChunks([], null)).toEqual([])
        })

        it('merges adjacent chunks with small gaps', () => {
            const vp = (block, offset) => ({
                block, offset,
                isGreaterThan(other) { return this.block > other.block || (this.block === other.block && this.offset > other.offset) },
                isLessThan(other) { return this.block < other.block || (this.block === other.block && this.offset < other.offset) },
            })

            const chunks = [
                { minv: vp(100, 0), maxv: vp(200, 0) },
                { minv: vp(200, 0), maxv: vp(300, 0) },
            ]

            const result = optimizeChunks(chunks, null)
            expect(result.length).toBe(1)
            expect(result[0].minv.block).toBe(100)
            expect(result[0].maxv.block).toBe(300)
        })

        it('filters chunks below lowest pointer', () => {
            const vp = (block, offset) => ({
                block, offset,
                isGreaterThan(other) { return this.block > other.block || (this.block === other.block && this.offset > other.offset) },
            })

            const chunks = [
                { minv: vp(100, 0), maxv: vp(150, 0) }, // maxv below lowest
                { minv: vp(200, 0), maxv: vp(300, 0) }, // maxv above lowest
            ]

            const lowest = vp(180, 0)
            const result = optimizeChunks(chunks, lowest)
            expect(result.length).toBe(1)
            expect(result[0].minv.block).toBe(200)
        })
    })
})
