/**
 * The census is where the two document-relative facts the parser reads — a band's
 * direction, and what the document calls each strand — become the one biological reading a
 * researcher is shown. Everything here is checked twice: against the committed documents,
 * where the answer is a measurement, and against hand-built ones, where the cases the
 * corpus does not contain (no reference, a mixed haplotype, a reference that disagrees with
 * itself) can be exhibited at all.
 */

import { describe, expect, it } from 'vitest'
import {
    INVERTED,
    MIXED,
    censusInversion,
    describeInversion,
    haplotypeDirections,
    haplotypeReadings,
    referenceDirection
} from '../inversion.ts'
import { parseBands } from '../parseBands.ts'
import { directedDocument as document } from './directedDocument.ts'
import { readFixture, readInvertedFixture, readTallFixture } from './fixture.ts'

describe('referenceDirection', () => {

    it('is the direction GRCh38 itself runs, which is not the majority direction', () => {
        // The whole reason the reading is GRCh38-relative rather than a vote: in this
        // document the reference runs *with* the 297 and against the axis, so a census
        // taken by majority would call the 166 forward and name the wrong haplotypes.
        expect(referenceDirection(parseBands(readInvertedFixture()))).toBe('leftward')
    })

    it('is rightward in the documents whose bands all run one way', () => {
        expect(referenceDirection(parseBands(readFixture()))).toBe('rightward')
        expect(referenceDirection(parseBands(readTallFixture()))).toBe('rightward')
    })

    it('is nothing at all in a document with no GRCh38 strand', () => {
        expect(referenceDirection(document([
            { name: 'CHM13#0#chr8#0', bands: '=>=>=' },
            { name: 'HG002#1#chr8', bands: '=<=<=' }
        ]))).toBeNull()
    })

    it('is nothing at all where GRCh38 is drawn flat throughout', () => {
        // A strand that only ever passes through segment boxes was never observed running
        // either way, and a reference with no direction is not a direction of zero.
        expect(referenceDirection(document([
            { name: 'GRCh38#0#chr8', bands: '===' },
            { name: 'HG002#1#chr8', bands: '=<=' }
        ]))).toBeNull()
    })

    it('is nothing at all where GRCh38 runs both ways', () => {
        // The reference itself is a haplotype and may mix, and a document whose reference
        // does has no single direction to read the others against. Say nothing rather than
        // pick one.
        expect(referenceDirection(document([
            { name: 'GRCh38#0#chr8', bands: '=<=>=' },
            { name: 'HG002#1#chr8', bands: '=<=' }
        ]))).toBeNull()
    })

    it('matches the reference by prefix, since a name carries an interval after it', () => {
        // `GRCh38#0#chr8[10078919-10080674]` is how the inverted document spells it, and
        // nothing anywhere splits a strand name on its separator.
        expect(referenceDirection(document([
            { name: 'GRCh38#0#chr8[10078919-10080674]', bands: '=<=' }
        ]))).toBe('leftward')
    })
})

describe('haplotypeDirections', () => {

    it('reads a haplotype from its connectors, ignoring its flat bands', () => {
        // The trap this exists for: an inverted haplotype's passages through segment boxes
        // are drawn flat, and reading those as rightward would make every one of the
        // inverted document's 297 leftward strands look like it mixed both directions.
        const directions = haplotypeDirections(document([
            { name: 'a', bands: '=<=<=' },
            { name: 'b', bands: '=>=>=' },
            { name: 'c', bands: '=<=>=' },
            { name: 'd', bands: '===' }
        ]))

        expect(directions).toEqual(['leftward', 'rightward', 'mixed', null])
    })

    it('reads the committed inversion the way the document was censused', () => {
        const directions = haplotypeDirections(parseBands(readInvertedFixture()))
        const count = (reading: unknown): number =>
            directions.filter(direction => reading === direction).length

        expect(directions).toHaveLength(463)
        expect(count('leftward')).toBe(297)
        expect(count('rightward')).toBe(166)
        expect(count('mixed')).toBe(0)
        expect(count(null)).toBe(0)
    })
})

describe('censusInversion', () => {

    it('counts the haplotypes opposing GRCh38, which are the minority here', () => {
        // 166, not 297. GRCh38 runs leftward with the 297, so the 166 running rightward are
        // the ones opposing it — the count follows the reference, not the crowd. ADR `0004`.
        const census = censusInversion(parseBands(readInvertedFixture()))

        expect(census.reference).toBe('leftward')
        expect(census.haplotypes).toBe(463)

        if (null === census.reference) return

        expect(census.inverted).toBe(166)
        expect(census.forward).toBe(297)
        expect(census.mixed).toBe(0)
        expect(census.undetermined).toBe(0)
    })

    it('finds nothing inverted in a document whose bands all run one way', () => {
        const census = censusInversion(parseBands(readFixture()))

        expect(census.reference).toBe('rightward')

        if (null === census.reference) return

        expect(census.inverted).toBe(0)
        expect(census.mixed).toBe(0)
        expect(census.forward + census.undetermined).toBe(census.haplotypes)
    })

    it('reports a haplotype running both ways as mixed rather than refusing it', () => {
        const census = censusInversion(document([
            { name: 'GRCh38#0#chr8', bands: '=>=' },
            { name: 'HG002#1#chr8', bands: '=<=' },
            { name: 'HG005#1#chr8', bands: '=<=>=' },
            { name: 'HG006#1#chr8', bands: '===' }
        ]))

        if (null === census.reference) throw new Error('the document has a reference')

        expect(census.inverted).toBe(1)
        expect(census.forward).toBe(1)
        expect(census.mixed).toBe(1)
        expect(census.undetermined).toBe(1)
        expect(census.haplotypes).toBe(4)
    })

    it('says only how many haplotypes there are where there is no reference', () => {
        const census = censusInversion(document([
            { name: 'CHM13#0#chr8#0', bands: '=>=' },
            { name: 'HG002#1#chr8', bands: '=<=' }
        ]))

        expect(census.reference).toBeNull()
        expect(census.haplotypes).toBe(2)
        expect(census.mixed).toBe(0)
    })

    it('still counts a mixed haplotype where there is no reference', () => {
        // A haplotype that turns around mid-traversal is a fact about the picture, not a
        // reading against GRCh38. Losing it to the absence of a reference would be exactly
        // the silent bucketing the ticket refuses — and it is *only* in a document with no
        // reference that nobody else would ever mention it.
        const census = censusInversion(document([
            { name: 'CHM13#0#chr8#0', bands: '=>=' },
            { name: 'HG005#1#chr8', bands: '=<=>=' }
        ]))

        expect(census.reference).toBeNull()
        expect(census.mixed).toBe(1)
    })

    it('counts a reference that runs both ways among the mixed, having no reference left', () => {
        const census = censusInversion(document([
            { name: 'GRCh38#0#chr8', bands: '=<=>=' },
            { name: 'HG002#1#chr8', bands: '=<=' }
        ]))

        expect(census.reference).toBeNull()
        expect(census.mixed).toBe(1)
    })
})

describe('describeInversion', () => {

    it('states the count out of the total, in the word a researcher uses', () => {
        expect(describeInversion(censusInversion(parseBands(readInvertedFixture()))))
            .toBe('166 of 463 haplotypes inverted')
    })

    it('says nothing about a document whose bands all run one way', () => {
        expect(describeInversion(censusInversion(parseBands(readFixture())))).toBeNull()
        expect(describeInversion(censusInversion(parseBands(readTallFixture())))).toBeNull()
    })

    it('says nothing about a document with no reference to read against', () => {
        expect(describeInversion(censusInversion(document([
            { name: 'CHM13#0#chr8#0', bands: '=<=' }
        ])))).toBeNull()
    })

    it('states a mixed haplotype even with no reference, since that needs none', () => {
        expect(describeInversion(censusInversion(document([
            { name: 'CHM13#0#chr8#0', bands: '=>=' },
            { name: 'HG005#1#chr8', bands: '=<=>=' }
        ])))).toBe('1 of 2 haplotypes mixed')
    })

    it('names the mixed haplotypes beside the inverted ones', () => {
        expect(describeInversion(censusInversion(document([
            { name: 'GRCh38#0#chr8', bands: '=>=' },
            { name: 'HG002#1#chr8', bands: '=<=' },
            { name: 'HG005#1#chr8', bands: '=<=>=' }
        ])))).toBe('1 of 3 haplotypes inverted · 1 mixed')
    })

    it('states a mixed haplotype even where nothing is inverted', () => {
        // The one thing a document that breaks the pattern must not do is go unmentioned
        // because the headline number happens to be zero.
        expect(describeInversion(censusInversion(document([
            { name: 'GRCh38#0#chr8', bands: '=>=' },
            { name: 'HG005#1#chr8', bands: '=<=>=' }
        ])))).toBe('1 of 2 haplotypes mixed')
    })
})

/**
 * The document-level sentence says *how many*; this says *which*, and it is the whole of
 * #132. The reading a single haplotype gets is the one thing here that has to stay in step
 * with the caption: a map captioned "166 of 463 haplotypes inverted" whose rows say nothing,
 * or whose rows say *inverted* about 297 of them, is a viewer disagreeing with itself.
 */
describe('haplotypeReadings', () => {

    it('reads each haplotype against GRCh38, not against the axis', () => {
        const readings = haplotypeReadings(parseBands(readInvertedFixture()))
        const count = (reading: unknown): number =>
            readings.filter(said => reading === said).length

        // The same 166 the caption names, and the same 297 it does not: GRCh38 runs
        // leftward here, so the majority runs *with* the reference and is left unnamed.
        expect(count(INVERTED)).toBe(166)
        expect(count(MIXED)).toBe(0)
        expect(count(null)).toBe(297)
    })

    it('says nothing at all about a document whose bands all run one way', () => {
        // Criterion 3 of #132 at the level it bites hardest: not "0 inverted" per row, and
        // no tag on any name in four of the five documents. A document with no inversion in
        // it is a document with nothing to say about inversion.
        for (const fixture of [readFixture(), readTallFixture()]) {
            expect(haplotypeReadings(parseBands(fixture)).every(said => null === said)).toBe(true)
        }
    })

    it('says nothing where there is no reference to read against', () => {
        expect(haplotypeReadings(document([
            { name: 'CHM13#0#chr8#0', bands: '=>=' },
            { name: 'HG002#1#chr8', bands: '=<=' }
        ]))).toEqual([null, null])
    })

    it('names the inverted haplotype and leaves the rest unmarked', () => {
        // Only the exceptions are named. A haplotype running with the reference and one the
        // document never observed running either way share the same silence, and neither is
        // a finding.
        expect(haplotypeReadings(document([
            { name: 'GRCh38#0#chr8', bands: '=>=' },
            { name: 'HG002#1#chr8', bands: '=<=' },
            { name: 'HG005#1#chr8', bands: '===' }
        ]))).toEqual([null, INVERTED, null])
    })

    it('reads a mixed haplotype as mixed, with a reference or without one', () => {
        // A mixed haplotype needs no reference to be read — `CONTEXT.md` §mixed — so it is
        // the one reading that survives a document the census can say nothing else about.
        expect(haplotypeReadings(document([
            { name: 'GRCh38#0#chr8', bands: '=>=' },
            { name: 'HG002#1#chr8', bands: '=<=' },
            { name: 'HG005#1#chr8', bands: '=<=>=' }
        ]))).toEqual([null, INVERTED, MIXED])

        expect(haplotypeReadings(document([
            { name: 'CHM13#0#chr8#0', bands: '=>=' },
            { name: 'HG005#1#chr8', bands: '=<=>=' }
        ]))).toEqual([null, MIXED])
    })

    it('stays silent about the others where the only oddity is a mixed haplotype', () => {
        // One turned-around haplotype is worth surfacing on its own row, and is not a reason
        // to put a word on any other row.
        expect(haplotypeReadings(document([
            { name: 'GRCh38#0#chr8', bands: '=>=' },
            { name: 'HG002#1#chr8', bands: '=>=' },
            { name: 'HG005#1#chr8', bands: '=<=>=' }
        ]))).toEqual([null, null, MIXED])
    })
})
