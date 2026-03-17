import { BGZip, igvxhr } from 'igv-utils'
import { buildOptions } from '../util/igvUtils.js'
import { concatenateArrayBuffers } from '../util/bufferUtils.js'

const bgzBlockSize = (data) => {
    const ba = ArrayBuffer.isView(data) ? data : new Uint8Array(data)
    const bsize = (ba[17] << 8 | ba[16]) + 1
    return bsize
}

class BGZBlockLoader {

    constructor(config) {
        this.config = config
        this.cacheBlocks = false != config.cacheBlocks
        this.cache = undefined
    }

    async getData(minv, maxv) {

        const startBlock = minv.block
        const endBlock = maxv.block
        const skipEnd = maxv.offset === 0

        const blocks = await this.getInflatedBlocks(startBlock, endBlock, skipEnd)
        if (blocks.length === 1) {
            return blocks[0]
        }

        let len = 0
        for (const b of blocks) len += b.byteLength
        const c = new Uint8Array(len)
        let offset = 0
        for (const b of blocks) {
            c.set(b, offset)
            offset += b.byteLength
        }
        return c
    }

    async getInflatedBlocks(startBlock, endBlock, skipEnd) {

        if (!this.cacheBlocks) {
            const buffer = await this.loadBLockData(startBlock, endBlock, { skipEnd })
            return inflateBlocks(buffer)
        }

        const c = this.cache
        if (c &&
            c.startBlock <= startBlock &&
            (c.endBlock >= endBlock || skipEnd && c.nextEndBlock === endBlock)) {
            const startOffset = startBlock - c.startBlock
            const endOffset = endBlock - c.startBlock
            return inflateBlocks(c.buffer, startOffset, endOffset)
        }

        let buffer
        if (!c || (c.startBlock > endBlock || c.endBlock < startBlock)) {
            buffer = await this.loadBLockData(startBlock, endBlock, { skipEnd })
        } else {
            const arrayBuffers = []

            if (startBlock < c.startBlock) {
                const startBuffer = await this.loadBLockData(startBlock, c.startBlock, { skipEnd: true })
                arrayBuffers.push(startBuffer)
            }

            let cachedBuffer
            if (startBlock <= c.startBlock && endBlock >= c.endBlock) {
                cachedBuffer = c.buffer
            } else {
                const start = Math.max(0, startBlock - c.startBlock)
                let end
                if (endBlock >= c.endBlock) {
                    end = c.buffer.byteLength
                } else {
                    const boundaries = findBlockBoundaries(c.buffer)
                    for (let i = 0; i < boundaries.length - 1; i++) {
                        if (c.startBlock + boundaries[i] === endBlock) {
                            end = boundaries[i + 1]
                            break
                        }
                    }
                }
                cachedBuffer = c.buffer.slice(start, end)
            }
            arrayBuffers.push(cachedBuffer)

            if (endBlock > c.endBlock) {
                const endBuffer = await this.loadBLockData(c.endBlock, endBlock, { skipStart: true, skipEnd })
                arrayBuffers.push(endBuffer)
            }

            buffer = concatenateArrayBuffers(arrayBuffers)
        }

        let nextEndBlock = endBlock
        if (skipEnd) {
            const boundaries = findBlockBoundaries(buffer)
            endBlock = boundaries[boundaries.length - 1]
        }

        this.cache = { startBlock, endBlock, nextEndBlock, buffer }
        return inflateBlocks(buffer)
    }

    async loadBLockData(startBlock, endBlock, options) {

        const config = this.config
        const skipStart = options && options.skipStart
        const skipEnd = options && options.skipEnd

        let lastBlockSize = 0
        if (!skipEnd) {
            const bsizeOptions = buildOptions(config, { range: { start: endBlock, size: 26 } })
            const abuffer = await igvxhr.loadArrayBuffer(config.url, bsizeOptions)
            lastBlockSize = bgzBlockSize(abuffer)
        }

        if (skipStart) {
            const bsizeOptions = buildOptions(config, { range: { start: startBlock, size: 26 } })
            const abuffer = await igvxhr.loadArrayBuffer(config.url, bsizeOptions)
            startBlock += bgzBlockSize(abuffer)
        }

        const loadOptions = buildOptions(config, {
            range: {
                start: startBlock,
                size: endBlock + lastBlockSize - startBlock
            }
        })

        return igvxhr.loadArrayBuffer(config.url, loadOptions)
    }
}

function findBlockBoundaries(arrayBuffer) {
    const byteLength = arrayBuffer.byteLength
    let offset = 0
    const blockBoundaries = [0]
    while (offset < byteLength) {
        const ba = new Uint8Array(arrayBuffer, offset)
        const bsize = (ba[17] << 8 | ba[16]) + 1
        offset += bsize
        if (offset < byteLength) {
            blockBoundaries.push(offset)
        }
    }
    return blockBoundaries
}

function inflateBlocks(data, startBlock, endBlock) {

    startBlock = startBlock || 0

    const oBlockList = []
    let ptr = startBlock
    const lim = data.byteLength - 18

    while (ptr < lim) {
        try {
            const header = new Uint8Array(data, ptr, 18)
            const xlen = (header[11] << 8) | (header[10])
            const bsize = ((header[17] << 8) | (header[16]))
            const start = 12 + xlen + ptr
            const bytesLeft = data.byteLength - start
            const cDataSize = bsize - xlen - 18

            if (bytesLeft < cDataSize || cDataSize <= 0) break

            const cdata = new Uint8Array(data, start, cDataSize)
            const unc = BGZip.inflateRaw(cdata)
            oBlockList.push(unc)

            if (endBlock === ptr) {
                break
            } else {
                ptr += bsize + 1
            }
        } catch (e) {
            console.error(e)
            break
        }
    }
    return oBlockList
}

export { BGZBlockLoader as default, inflateBlocks, findBlockBoundaries, bgzBlockSize }
