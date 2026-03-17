import { describe, it, expect } from 'vitest'
import { decodeGenePredExt } from '../codec/refGeneCodec.js'

// A real refGene line (NM_007294 — BRCA1 on chr17, simplified to 3 exons for readability).
// Format: bin, name, chr, strand, txStart, txEnd, cdsStart, cdsEnd, exonCount, exonStarts, exonEnds, score, name2, ...frameOffsets
// Index:   0     1     2    3       4        5       6         7        8           9           10      11     12     ...14

const header = { shift: 1 }

describe('decodeGenePredExt', () => {

    it('decodes a genePredExt (refGene) line into a feature with expected properties', () => {
        // Minimal realistic refGene-format tokens (shift=1 means bin column present at index 0)
        const tokens = [
            '585',          // 0: bin
            'NM_000059',    // 1: name/id
            'chr13',        // 2: chr
            '-',            // 3: strand
            '32315474',     // 4: txStart
            '32400266',     // 5: txEnd
            '32316461',     // 6: cdsStart
            '32398770',     // 7: cdsEnd
            '3',            // 8: exonCount
            '32315474,32316422,32398489,', // 9: exonStarts
            '32315667,32316527,32400266,', // 10: exonEnds
            '0',            // 11: score
            'BRCA2',        // 12: name2 (gene symbol)
            'cmpl',         // 13: cdsStartStat
            'cmpl',         // 14: cdsEndStat
            '1,1,0,',       // 15: exonFrames
        ]

        const feature = decodeGenePredExt(tokens, header)

        expect(feature).toBeDefined()
        expect(feature.name).toBe('BRCA2')
        expect(feature.chr).toBe('chr13')
        expect(feature.strand).toBe('-')
        expect(feature.start).toBe(32315474)
        expect(feature.end).toBe(32400266)
        expect(feature.cdStart).toBe(32316461)
        expect(feature.cdEnd).toBe(32398770)
        expect(feature.id).toBe('NM_000059')
        expect(feature.exons).toHaveLength(3)
    })

    it('returns undefined when tokens are too short', () => {
        const tokens = ['585', 'NM_000059', 'chr13', '-', '100', '200', '110', '190', '1', '100,', '200,', '0']
        // With shift=1, need > 11+1=12 tokens; we have exactly 12, so index 12 (name2) is missing
        const feature = decodeGenePredExt(tokens, header)
        expect(feature).toBeUndefined()
    })

    it('correctly identifies UTR exons via findUTRs', () => {
        // First exon ends before cdsStart → should be UTR
        const tokens = [
            '0',
            'NM_001',
            'chr1',
            '+',
            '1000',      // txStart
            '5000',      // txEnd
            '2000',      // cdsStart
            '4000',      // cdsEnd
            '3',
            '1000,2500,4200,',  // exonStarts
            '1500,3500,5000,',  // exonEnds
            '0',
            'GENE1',
            'cmpl',
            'cmpl',
            '-1,-1,-1,',
        ]

        const feature = decodeGenePredExt(tokens, header)
        expect(feature.exons).toHaveLength(3)

        // First exon: 1000-1500, entirely before cdsStart (2000) → UTR
        expect(feature.exons[0].utr).toBe(true)

        // Second exon: 2500-3500, overlaps coding region → not UTR
        expect(feature.exons[1].utr).toBeUndefined()

        // Third exon: 4200-5000, entirely after cdsEnd (4000) → UTR
        expect(feature.exons[2].utr).toBe(true)
    })

    it('sets cdStart/cdEnd on exons that partially overlap coding region', () => {
        const tokens = [
            '0',
            'NM_002',
            'chr2',
            '+',
            '100',       // txStart
            '500',       // txEnd
            '150',       // cdsStart (falls within first exon)
            '450',       // cdsEnd (falls within second exon)
            '2',
            '100,300,',   // exonStarts
            '250,500,',   // exonEnds
            '0',
            'GENE2',
            'cmpl',
            'cmpl',
            '-1,-1,',
        ]

        const feature = decodeGenePredExt(tokens, header)
        expect(feature.exons).toHaveLength(2)

        // First exon: 100-250, cdsStart=150 falls within → exon.cdStart set
        expect(feature.exons[0].cdStart).toBe(150)
        expect(feature.exons[0].utr).toBeUndefined()

        // Second exon: 300-500, cdsEnd=450 falls within → exon.cdEnd set
        expect(feature.exons[1].cdEnd).toBe(450)
    })

    it('decodes reading frames from exonFrames column', () => {
        const tokens = [
            '0',
            'NM_003',
            'chr3',
            '+',
            '1000',
            '2000',
            '1000',
            '2000',
            '2',
            '1000,1500,',
            '1400,2000,',
            '0',
            'GENE3',
            'cmpl',
            'cmpl',
            '0,2,',       // exonFrames: frame 0 and frame 2
        ]

        const feature = decodeGenePredExt(tokens, header)
        expect(feature.exons[0].readingFrame).toBe(0)
        expect(feature.exons[1].readingFrame).toBe(2)
    })

    it('does not set readingFrame for frame offset -1', () => {
        const tokens = [
            '0',
            'NM_004',
            'chr4',
            '+',
            '1000',
            '2000',
            '1200',
            '1800',
            '2',
            '1000,1500,',
            '1100,2000,',
            '0',
            'GENE4',
            'cmpl',
            'cmpl',
            '-1,0,',
        ]

        const feature = decodeGenePredExt(tokens, header)
        expect(feature.exons[0].readingFrame).toBeUndefined()
        expect(feature.exons[1].readingFrame).toBe(0)
    })
})
