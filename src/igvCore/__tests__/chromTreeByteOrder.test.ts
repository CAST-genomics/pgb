import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ChromTree from '../io/bigwig/chromTree.js'

// Ported from igv.js 1bbc813a (#2116), "Search B+ trees in byte order, not locale order".
//
// A bigBed/bigWig B+ tree is sorted by byte value (strcmp). Descending it with
// localeCompare picks the wrong child wherever locale order and byte order
// disagree -- case ("Scaffold_1" < "chr1" in bytes, not in locale) and
// punctuation ("chr10" < "chr1_..." in bytes). The gene lookup walks the same
// kind of tree in the MANE bigBed's name index, so the bug reaches it too.
//
// The fixture was written by bedGraphToBigWig -blockSize=4: four names per leaf,
// so the tree has more than one level, and chromosome IDs numbered in byte order.

const fixture = fileURLToPath(new URL('./fixtures/bb/chromTreeByteOrder.bw', import.meta.url))

const fileLoader = {
    async loadArrayBuffer(_path: string, options: { range?: { start: number, size: number } }) {
        const bytes = readFileSync(fixture)
        const { start, size } = options.range ?? { start: 0, size: bytes.length }
        return bytes.buffer.slice(bytes.byteOffset + start, bytes.byteOffset + start + size)
    },
}

describe('ChromTree name lookup over a multi-level tree', () => {

    it('finds every name, including those whose byte order differs from locale order', async () => {
        const tree = new ChromTree(fixture, {}, 344, fileLoader)
        await tree.init()
        expect(tree.getItemCount()).toBe(8)

        const names = ['Scaffold_1', 'Scaffold_2', 'chr1', 'chr10', 'chr1_KZ114834v1_alt', 'chr2', 'contig_1', 'contig_2']
        for (const [id, name] of names.entries()) {
            expect(await tree.getIdForName(name), name).toBe(id)
        }
    })
})
