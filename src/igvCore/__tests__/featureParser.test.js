import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import FeatureParser from '../feature/featureParser.js'
import getDataWrapper from '../io/dataWrapper.js'

const fixturePath = resolve(import.meta.dirname, 'fixtures/refgene-sample.txt')
const fixtureData = readFileSync(fixturePath, 'utf-8')

describe('FeatureParser — refgene format', () => {

    it('parses refGene fixture into features with correct structure', async () => {
        const parser = new FeatureParser({ format: 'refgene' })
        const dataWrapper = getDataWrapper(fixtureData)
        const features = await parser.parseFeatures(dataWrapper)

        expect(features).toHaveLength(2)

        const brca2 = features.find(f => f.name === 'BRCA2')
        expect(brca2).toBeDefined()
        expect(brca2.chr).toBe('chr13')
        expect(brca2.strand).toBe('-')
        expect(brca2.start).toBe(32315474)
        expect(brca2.end).toBe(32400266)
        expect(brca2.cdStart).toBe(32316461)
        expect(brca2.cdEnd).toBe(32398770)
        expect(brca2.exons).toHaveLength(27)
        expect(brca2.id).toBe('NM_000059')

        const brca1 = features.find(f => f.name === 'BRCA1')
        expect(brca1).toBeDefined()
        expect(brca1.chr).toBe('chr17')
        expect(brca1.exons).toHaveLength(24)
    })

    it('sets header.shift = 1 for refgene format (bin column)', async () => {
        const parser = new FeatureParser({ format: 'refgene' })
        await parser.parseHeader(getDataWrapper(fixtureData))
        expect(parser.header.shift).toBe(1)
    })

    it('uses whitespace delimiter for refgene format', () => {
        const parser = new FeatureParser({ format: 'refgene' })
        expect(parser.delimiter).toEqual(/\s+/)
    })

    it('exons have UTR markers for non-coding exons', async () => {
        const parser = new FeatureParser({ format: 'refgene' })
        const features = await parser.parseFeatures(getDataWrapper(fixtureData))

        const brca2 = features.find(f => f.name === 'BRCA2')
        // First exon (32315474-32315667) is before cdStart (32316461) → UTR
        expect(brca2.exons[0].utr).toBe(true)
        // Last exon (32398163-32400266) ends after cdEnd (32398770) → has cdEnd marker
        const lastExon = brca2.exons[brca2.exons.length - 1]
        expect(lastExon.cdEnd).toBe(32398770)
    })

    it('exons have reading frames from the exonFrames column', async () => {
        const parser = new FeatureParser({ format: 'refgene' })
        const features = await parser.parseFeatures(getDataWrapper(fixtureData))

        const brca2 = features.find(f => f.name === 'BRCA2')
        // First coding exon (index 1) has frame "2"
        expect(brca2.exons[1].readingFrame).toBe(2)
        // Last few exons have frame -1 → no readingFrame
        expect(brca2.exons[24].readingFrame).toBeUndefined()
    })
})
