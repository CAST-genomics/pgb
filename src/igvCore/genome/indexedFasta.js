import {igvxhr, StringUtils} from 'igv-utils'
import Chromosome from './chromosome.js'
import {buildOptions} from '../util/igvUtils.js'

const splitLines = StringUtils.splitLines

const reservedProperties = new Set(['fastaURL', 'indexURL', 'cytobandURL', 'indexed'])

class IndexedFasta {

    #chromosomeNames
    chromosomes = new Map()

    constructor(reference) {
        this.file = reference.fastaURL
        this.indexFile = reference.indexURL

        // Build a track-like config object from the reference, excluding reserved keys
        const config = {}
        for (let key in reference) {
            if (reference.hasOwnProperty(key) && !reservedProperties.has(key)) {
                config[key] = reference[key]
            }
        }
        this.config = config
    }

    async init() {
        return this.getIndex()
    }

    get chromosomeNames() {
        if (!this.#chromosomeNames) {
            this.#chromosomeNames = Array.from(this.chromosomes.keys())
        }
        return this.#chromosomeNames
    }

    getFirstChromosomeName() {
        return this.chromosomeNames[0]
    }

    getSequenceRecord(chr) {
        return this.chromosomes.get(chr)
    }

    async getIndex() {
        if (this.index) {
            return this.index
        }

        const data = await igvxhr.load(this.indexFile, buildOptions(this.config))
        const lines = splitLines(data)
        let order = 0
        this.index = {}

        for (const line of lines) {
            const tokens = line.split('\t')
            if (tokens.length === 5) {
                const chr = tokens[0]
                const size = parseInt(tokens[1])
                const position = parseInt(tokens[2])
                const basesPerLine = parseInt(tokens[3])
                const bytesPerLine = parseInt(tokens[4])

                this.index[chr] = {size, position, basesPerLine, bytesPerLine}
                this.chromosomes.set(chr, new Chromosome(chr, order++, size))
            }
        }

        return this.index
    }

    async readSequence(chr, qstart, qend) {

        await this.getIndex()

        const idxEntry = this.index[chr]
        if (!idxEntry) {
            return null
        }

        const start = Math.max(0, qstart)
        const end = Math.min(idxEntry.size, qend)
        const {bytesPerLine, basesPerLine, position} = idxEntry
        const nEndBytes = bytesPerLine - basesPerLine

        const startLine = Math.floor(start / basesPerLine)
        const endLine = Math.floor(end / basesPerLine)

        const base0 = startLine * basesPerLine
        const offset = start - base0
        const startByte = position + startLine * bytesPerLine + offset

        const base1 = endLine * basesPerLine
        const offset1 = end - base1
        const endByte = position + endLine * bytesPerLine + offset1 - 1
        const byteCount = endByte - startByte + 1

        if (byteCount <= 0) {
            return null
        }

        const allBytes = await igvxhr.load(this.file, buildOptions(this.config, {
            range: {start: startByte, size: byteCount}
        }))

        if (!allBytes) {
            return null
        }

        // Strip line endings from FASTA data
        let seqBytes = ''
        let srcPos = 0
        const allBytesLength = allBytes.length

        if (offset > 0) {
            const nBases = Math.min(end - start, basesPerLine - offset)
            seqBytes += allBytes.substr(srcPos, nBases)
            srcPos += (nBases + nEndBytes)
        }

        while (srcPos < allBytesLength) {
            const nBases = Math.min(basesPerLine, allBytesLength - srcPos)
            seqBytes += allBytes.substr(srcPos, nBases)
            srcPos += (nBases + nEndBytes)
        }

        return seqBytes
    }
}

export default IndexedFasta
