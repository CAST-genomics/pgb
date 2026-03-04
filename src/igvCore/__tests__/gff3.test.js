import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { isTranscript, isTranscriptPart, isExon, isIntron, isCoding, isUTR } from '../codec/gff/so.js'
import { parseAttributeString, decodeGFFAttribute } from '../codec/gff/parseAttributeString.js'
import { decodeGFF3 } from '../codec/gff/gffCodec.js'
import GFFHelper from '../codec/gff/gffHelper.js'
import FeatureParser from '../feature/featureParser.js'
import getDataWrapper from '../io/dataWrapper.js'

describe('so.js — Sequence Ontology type classification', () => {

    it('classifies transcript types', () => {
        expect(isTranscript('mRNA')).toBe(true)
        expect(isTranscript('transcript')).toBe(true)
        expect(isTranscript('lnc_RNA')).toBe(true)
        expect(isTranscript('gene')).toBe(false)
        expect(isTranscript('exon')).toBe(false)
    })

    it('classifies exon types', () => {
        expect(isExon('exon')).toBe(true)
        expect(isExon('coding-exon')).toBe(true)
        expect(isExon('CDS')).toBe(false)
    })

    it('classifies coding types', () => {
        expect(isCoding('CDS')).toBe(true)
        expect(isCoding('cds')).toBe(true)
        expect(isCoding('start_codon')).toBe(true)
        expect(isCoding('stop_codon')).toBe(true)
        expect(isCoding('exon')).toBe(false)
    })

    it('classifies UTR types', () => {
        expect(isUTR('five_prime_UTR')).toBe(true)
        expect(isUTR('three_prime_UTR')).toBe(true)
        expect(isUTR('UTR')).toBe(true)
        expect(isUTR('exon')).toBe(false)
    })

    it('classifies intron types', () => {
        expect(isIntron('intron')).toBe(true)
        expect(isIntron('retained_intron')).toBe(true)
        expect(isIntron('exon')).toBe(false)
    })

    it('classifies transcript parts', () => {
        expect(isTranscriptPart('exon')).toBe(true)
        expect(isTranscriptPart('CDS')).toBe(true)
        expect(isTranscriptPart('five_prime_UTR')).toBe(true)
        expect(isTranscriptPart('intron')).toBe(true)
        expect(isTranscriptPart('gene')).toBe(false)
    })
})

describe('parseAttributeString — GFF3 attribute parsing', () => {

    it('parses key=value pairs separated by semicolons', () => {
        const attrs = parseAttributeString('ID=gene001;Name=BRCA2;Dbxref=GeneID%3A675')
        expect(attrs).toEqual([
            ['ID', 'gene001'],
            ['Name', 'BRCA2'],
            ['Dbxref', 'GeneID%3A675']  // %3A (colon) is not a GFF3-mandated escape, so preserved as-is
        ])
    })

    it('handles empty attribute string', () => {
        const attrs = parseAttributeString('')
        expect(attrs).toEqual([])
    })

    it('decodes percent-encoded characters', () => {
        expect(decodeGFFAttribute('hello%3Bworld')).toBe('hello;world')
        expect(decodeGFFAttribute('a%3Db')).toBe('a=b')
        expect(decodeGFFAttribute('no encoding')).toBe('no encoding')
    })
})

describe('gffCodec — line-level GFF3 decoder', () => {

    it('decodes a GFF3 line into a feature with 0-based start', () => {
        const tokens = ['chr1', 'HAVANA', 'gene', '11869', '14409', '.', '+', '.', 'ID=gene001;Name=DDX11L1']
        const feature = decodeGFF3(tokens)
        expect(feature.chr).toBe('chr1')
        expect(feature.source).toBe('HAVANA')
        expect(feature.type).toBe('gene')
        expect(feature.start).toBe(11868)  // 0-based
        expect(feature.end).toBe(14409)
        expect(feature.strand).toBe('+')
        expect(feature.id).toBe('gene001')
        expect(feature.name).toBe('DDX11L1')
    })

    it('returns undefined for comment lines', () => {
        const tokens = ['# this is a comment']
        expect(decodeGFF3(tokens)).toBeUndefined()
    })

    it('returns undefined for lines with fewer than 9 tokens', () => {
        const tokens = ['chr1', 'HAVANA', 'gene', '11869', '14409']
        expect(decodeGFF3(tokens)).toBeUndefined()
    })

    it('extracts Parent from attributes', () => {
        const tokens = ['chr1', 'HAVANA', 'exon', '11869', '12227', '.', '+', '.', 'ID=exon001;Parent=tx001']
        const feature = decodeGFF3(tokens)
        expect(feature.parent).toBe('tx001')
    })
})

describe('GFFHelper — transcript assembly', () => {

    function makeFeature(chr, type, start, end, id, parent, name) {
        return decodeGFF3([chr, '.', type, String(start), String(end), '.', '+', '.',
            `ID=${id}` + (parent ? `;Parent=${parent}` : '') + (name ? `;Name=${name}` : '')])
    }

    it('assembles gene → mRNA → exons into a transcript hierarchy', () => {
        const gene   = makeFeature('chr1', 'gene', 1000, 5000, 'gene1', null, 'TP53')
        const mRNA   = makeFeature('chr1', 'mRNA', 1000, 5000, 'tx1', 'gene1', 'TP53-201')
        const exon1  = makeFeature('chr1', 'exon', 1000, 1200, 'exon1', 'tx1')
        const exon2  = makeFeature('chr1', 'exon', 2000, 2500, 'exon2', 'tx1')
        const exon3  = makeFeature('chr1', 'exon', 4500, 5000, 'exon3', 'tx1')

        const helper = new GFFHelper({ format: 'gff3' })
        const combined = helper.combineFeatures([gene, mRNA, exon1, exon2, exon3])

        // The mRNA should become a GFFTranscript with 3 exons
        const transcript = combined.find(f => f.type === 'mRNA')
        expect(transcript).toBeDefined()
        expect(transcript.exons.length).toBe(3)
        expect(transcript.geneObject).toBeDefined()
        expect(transcript.geneObject.id).toBe('gene1')
    })

    it('assembles CDS parts into coding regions on exons', () => {
        const gene   = makeFeature('chr1', 'gene', 1000, 5000, 'gene1', null, 'TP53')
        const mRNA   = makeFeature('chr1', 'mRNA', 1000, 5000, 'tx1', 'gene1')
        const exon1  = makeFeature('chr1', 'exon', 1000, 1500, 'exon1', 'tx1')
        const exon2  = makeFeature('chr1', 'exon', 3000, 5000, 'exon2', 'tx1')
        const cds1   = makeFeature('chr1', 'CDS',  1100, 1500, 'cds1', 'tx1')
        const cds2   = makeFeature('chr1', 'CDS',  3000, 4800, 'cds2', 'tx1')

        const helper = new GFFHelper({ format: 'gff3' })
        const combined = helper.combineFeatures([gene, mRNA, exon1, exon2, cds1, cds2])

        const transcript = combined.find(f => f.type === 'mRNA')
        expect(transcript.cdStart).toBe(1099)  // 0-based from CDS start 1100→1099
        expect(transcript.cdEnd).toBe(4800)
    })
})

describe('FeatureParser — format dispatch', () => {

    it('uses decodeGFF3 for gff3 format', () => {
        const parser = new FeatureParser({ format: 'gff3' })
        expect(parser.delimiter).toBe('\t')
        expect(parser._gffHelper).toBeDefined()
        expect(parser._gffHelper.format).toBe('gff3')
    })

    it('uses decodeGFF3 for gff format', () => {
        const parser = new FeatureParser({ format: 'gff' })
        expect(parser._gffHelper).toBeDefined()
    })

    it('still uses decodeGenePredExt as default (regression)', () => {
        const parser = new FeatureParser({})
        expect(parser._gffHelper).toBeUndefined()
    })
})

describe('Integration — full GFF3 parse pipeline', () => {

    const fixturePath = resolve(import.meta.dirname, 'fixtures/sample.gff3')
    const fixtureData = readFileSync(fixturePath, 'utf-8')

    it('parses GFF3 fixture through FeatureParser into assembled transcripts', async () => {
        const parser = new FeatureParser({ format: 'gff3' })
        const dataWrapper = getDataWrapper(fixtureData)
        const features = await parser.parseFeatures(dataWrapper)

        // Should have a transcript (mRNA) with assembled exons
        const transcript = features.find(f => f.type === 'mRNA')
        expect(transcript).toBeDefined()
        expect(transcript.name).toBe('DDX11L1-201')
        expect(transcript.exons).toHaveLength(3)

        // Exons should be sorted by start
        expect(transcript.exons[0].start).toBeLessThan(transcript.exons[1].start)
        expect(transcript.exons[1].start).toBeLessThan(transcript.exons[2].start)

        // CDS boundaries should be set
        expect(transcript.cdStart).toBeDefined()
        expect(transcript.cdEnd).toBeDefined()

        // Gene object should be linked
        expect(transcript.geneObject).toBeDefined()
        expect(transcript.geneObject.name).toBe('DDX11L1')
    })

    it('skips the ##gff-version 3 header line', async () => {
        const parser = new FeatureParser({ format: 'gff3' })
        const dataWrapper = getDataWrapper(fixtureData)
        const features = await parser.parseFeatures(dataWrapper)

        // No feature should have chr starting with '#'
        for (const f of features) {
            expect(f.chr).not.toMatch(/^#/)
        }
    })
})
