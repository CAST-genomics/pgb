import { describe, it, expect } from 'vitest'
import BWReader from '../io/bigwig/bwReader.js'

// A name search on an indexed bigBed (the MANE gene lookup) lands on a data block
// holding hundreds of features, and keeps the largest one that actually matches.
// Regression: the reduce that picks the largest was seeded with the first feature
// of the *block* rather than the first *match*, so any gene smaller than the
// block's first feature resolved to that unrelated feature. Typing IL4 (8.7 kb at
// chr5:132,673,989) returned PLEKHG4B (97.8 kb at chr5:92,168), the first feature
// in IL4's block of the hg38 MANE bigBed.

const plekhg4b = { chr: 'chr5', start: 92167, end: 189966, name: 'ENST00000637938.2', geneName: 'PLEKHG4B' }
const il4 = { chr: 'chr5', start: 132673988, end: 132682678, name: 'ENST00000231449.7', geneName: 'IL4' }

function readerOverBlock(features: object[]) {
    const reader = new BWReader({ url: 'stub.bb' }, { getChromosomeName: (c: string) => c })
    Object.assign(reader, {
        header: { extraIndexCount: 1 },
        _searchForRegions: async () => ({ offset: 0, length: 1 }),
        _loadFeaturesForRange: async () => features,
    })
    return reader
}

describe('BWReader.search', () => {

    it('returns the match even when an unrelated, larger feature leads the block', async () => {
        const found = await readerOverBlock([plekhg4b, il4]).search('IL4')
        expect(found).toBe(il4)
    })

    it('returns the largest of several matches', async () => {
        const short = { chr: 'chr1', start: 100, end: 200, geneName: 'G' }
        const long = { chr: 'chr1', start: 100, end: 900, geneName: 'G' }
        const found = await readerOverBlock([plekhg4b, short, long]).search('g')
        expect(found).toBe(long)
    })

    it('returns undefined when nothing in the block matches', async () => {
        expect(await readerOverBlock([plekhg4b]).search('IL4')).toBeUndefined()
    })
})
