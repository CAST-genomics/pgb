import BinaryParser from './binary.js'

const TABIX_MAGIC = 21578324

class TabixIndex {

    constructor() {
    }

    parse(arrayBuffer) {

        const indices = []
        let blockMin = Number.MAX_SAFE_INTEGER
        let blockMax = 0

        const parser = new BinaryParser(new DataView(arrayBuffer))
        const magic = parser.getInt()
        const sequenceIndexMap = {}

        if (magic !== TABIX_MAGIC) {
            throw new Error('Not a tabix index file')
        }

        const nref = parser.getInt()

        // Tabix header parameters — read to advance pointer
        const format = parser.getInt()
        const col_seq = parser.getInt()
        const col_beg = parser.getInt()
        const col_end = parser.getInt()
        const meta = parser.getInt()
        const skip = parser.getInt()
        const l_nm = parser.getInt()

        for (let i = 0; i < nref; i++) {
            const seq_name = parser.getString()
            sequenceIndexMap[seq_name] = i
        }

        // Loop through sequences
        for (let ref = 0; ref < nref; ref++) {

            const binIndex = {}
            const linearIndex = []
            const nbin = parser.getInt()

            for (let b = 0; b < nbin; b++) {
                const binNumber = parser.getInt()
                if (binNumber === 37450) {
                    // Pseudo bin — consume bytes
                    const nchnk = parser.getInt()
                    parser.getVPointer()  // unmapped beg
                    parser.getVPointer()  // unmapped end
                    parser.getLong()
                    parser.getLong()
                } else {
                    binIndex[binNumber] = []
                    const nchnk = parser.getInt()

                    for (let i = 0; i < nchnk; i++) {
                        const cs = parser.getVPointer()
                        const ce = parser.getVPointer()
                        if (cs && ce) {
                            if (cs.block < blockMin) blockMin = cs.block
                            if (ce.block > blockMax) blockMax = ce.block
                            binIndex[binNumber].push([cs, ce])
                        }
                    }
                }
            }

            const nintv = parser.getInt()
            for (let i = 0; i < nintv; i++) {
                const cs = parser.getVPointer()
                linearIndex.push(cs)
            }

            if (nbin > 0) {
                indices[ref] = { binIndex, linearIndex }
            }
        }

        this.firstBlockPosition = blockMin
        this.lastBlockPosition = blockMax
        this.indices = indices
        this.sequenceIndexMap = sequenceIndexMap
        this.tabix = true
    }

    get sequenceNames() {
        return Object.keys(this.sequenceIndexMap)
    }

    chunksForRange(refId, min, max) {

        const ba = this.indices[refId]
        if (!ba) {
            return []
        }

        const overlappingBins = reg2bins(min, max)
        const chunks = []

        for (const binRange of overlappingBins) {
            for (let bin = binRange[0]; bin <= binRange[1]; bin++) {
                if (ba.binIndex[bin]) {
                    for (const c of ba.binIndex[bin]) {
                        chunks.push({ minv: c[0], maxv: c[1] })
                    }
                }
            }
        }

        // Use linear index to find minimum file position
        const nintv = ba.linearIndex.length
        let lowest
        const minLin = Math.min(min >> 14, nintv - 1)
        const maxLin = Math.min(max >> 14, nintv - 1)
        for (let i = minLin; i <= maxLin; i++) {
            const vp = ba.linearIndex[i]
            if (vp) {
                lowest = vp
                break
            }
        }

        return optimizeChunks(chunks, lowest)
    }
}

function reg2bins(beg, end) {
    const list = []
    if (end >= 1 << 29) end = 1 << 29
    --end
    list.push([0, 0])
    list.push([1 + (beg >> 26), 1 + (end >> 26)])
    list.push([9 + (beg >> 23), 9 + (end >> 23)])
    list.push([73 + (beg >> 20), 73 + (end >> 20)])
    list.push([585 + (beg >> 17), 585 + (end >> 17)])
    list.push([4681 + (beg >> 14), 4681 + (end >> 14)])
    return list
}

function optimizeChunks(chunks, lowest) {

    if (chunks.length === 0) return chunks

    chunks.sort(function (c0, c1) {
        const dif = c0.minv.block - c1.minv.block
        if (dif !== 0) return dif
        return c0.minv.offset - c1.minv.offset
    })

    if (chunks.length <= 1) return chunks

    if (lowest) {
        chunks = chunks.filter(c => c.maxv.isGreaterThan(lowest))
    }

    const mergedChunks = []
    let lastChunk
    for (const chunk of chunks) {
        if (!lastChunk) {
            mergedChunks.push(chunk)
            lastChunk = chunk
        } else {
            const gap = chunk.minv.block - lastChunk.maxv.block
            const sizeEstimate = chunk.maxv.block - lastChunk.minv.block
            if (sizeEstimate < 5000000 && gap < 65000) {
                if (chunk.maxv.isGreaterThan(lastChunk.maxv)) {
                    lastChunk.maxv = chunk.maxv
                }
            } else {
                mergedChunks.push(chunk)
                lastChunk = chunk
            }
        }
    }

    return mergedChunks
}

function parseTabixIndex(arrayBuffer) {
    const index = new TabixIndex()
    index.parse(arrayBuffer)
    return index
}

export { parseTabixIndex, TabixIndex, reg2bins, optimizeChunks }
