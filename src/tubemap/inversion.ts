/**
 * The inversion census — where a document's band directions become the one sentence about
 * them a researcher reads.
 *
 * The parser reads *band direction*, which is document-relative and says nothing
 * biological: `rightward` and `leftward` are facts about the picture. This file performs
 * the interpretation ADR `0004` deliberately keeps out of the parser, and it needs one
 * thing the parser does not have — a reference to read against:
 *
 * - **reference direction** is the band direction `GRCh38` itself takes in this document.
 *   Derived here, per document, never stored. A document without a GRCh38 strand does not
 *   have one.
 * - **inverted** describes a haplotype whose direction opposes the reference's. It is the
 *   only term here a researcher sees, and in the interface it reads *inverted haplotype*.
 *
 * ## The reference is not the majority
 *
 * In the chr8p23.1 document `GRCh38#0#chr8` runs **leftward**, with 297 of the 463
 * haplotypes, while `CHM13#0#chr8#0` runs rightward with the other 166. The x-axis is the
 * server's layout order and is oriented along neither. So the count this file reports for
 * that document is **166**, the haplotypes opposing GRCh38 — not the 297 that oppose the
 * x-axis, which is a different and biologically empty statement. A census taken by majority
 * would name the wrong haplotypes here, and this is the only document in the corpus where
 * the two answers differ.
 *
 * ## What it refuses to do
 *
 * Nothing here asserts. A document with no reference, a reference drawn flat throughout, a
 * reference that runs both ways, a haplotype that runs both ways — each is a document this
 * viewer can still draw, and each is *reported* rather than refused. The gate lives in the
 * parser and is about the drawing grammar; direction is biology, and biology the survey
 * happened not to contain is not a defect. A haplotype mixing both directions is reported
 * as **mixed**: zero of 463 do it in the known document, which is exactly why one that did
 * would be worth surfacing rather than averaging into a bucket.
 */

import { observedDirection, type BandDirection, type ParsedMap } from './parseBands.ts'

/**
 * How the reference haplotype's name begins.
 *
 * Matched by prefix, and this is the only place in the viewer that looks inside a strand
 * name at all. The inverted document spells it `GRCh38#0#chr8[10078919-10080674]` — the
 * interval it covers, appended — so an equality test would find no reference in the one
 * document that has an inversion to read. Nothing here splits on `#`: the chr8 fixture
 * already spells names with three parts and with four, and a name round-trips verbatim
 * everywhere else it is used.
 *
 * A prefix reaches further than the five documents need it to — a strand named
 * `GRCh38p14#0#chr8` would be taken as the reference too. That is the right way to be wrong
 * of the two available: a patch release of GRCh38 *is* the reference for this purpose, and
 * the alternative failure — requiring a `#` after it and finding no reference in a document
 * that spells the name slightly differently — costs the whole statement rather than
 * sharpening it.
 */
export const REFERENCE_PREFIX = 'GRCh38'

/** What a whole haplotype's bands say about its direction: one way, both ways, or nothing
 *  at all where every band it draws is flat. */
export type HaplotypeDirection = BandDirection | 'mixed' | null

/**
 * What the census reads out of a parsed document — the direction bytes, and the names that
 * say which strand is the reference.
 *
 * A subset rather than `ParsedMap` itself, so the cases the corpus cannot exhibit can be
 * written down as a few bytes in a test instead of as a captured 4 MB document.
 */
export type DirectedDocument =
    Pick<ParsedMap, 'bandDirections' | 'strandIds' | 'bandCount' | 'strandNames' | 'strandCount'>

/**
 * How many haplotypes this document draws each way, read against the reference.
 *
 * A union rather than a record with a nullable field, because a document with no reference
 * has no counts — not counts of zero. Reading `inverted` costs a check that `reference` is
 * there, which is the check that stops a viewer stating "0 of 463 haplotypes inverted"
 * about a document it cannot say that about.
 */
export type InversionCensus =
    | {
        reference: null,
        /** Every haplotype the document draws. */
        haplotypes: number,
        /** Drawing bands in both directions. Counted here too, because a haplotype that
         *  turns around mid-traversal is a fact about the picture and does not need a
         *  reference to be read — losing it to the absence of GRCh38 would be the silent
         *  bucketing ADR `0004` refuses. */
        mixed: number
    }
    | {
        reference: BandDirection,
        /** Every haplotype the document draws, including the reference itself. */
        haplotypes: number,
        /** Running against the reference. The count a researcher is shown. */
        inverted: number,
        /** Running with the reference, the reference among them. */
        forward: number,
        /** Drawing bands in both directions — reported, never refused. */
        mixed: number,
        /** Never observed running either way: every band it draws is flat. */
        undetermined: number
    }

/**
 * What each haplotype's own bands say, indexed by strand id.
 *
 * **Aggregated here and only here.** Direction is observed per band because that is where
 * it is measurable; that no haplotype in the chr8 document changes direction mid-traversal
 * is a regularity of one document, and the mistake ADR `0004` withdrew was taking exactly
 * such a regularity for a rule. So this folds the bands and is free to come back with
 * `mixed`.
 *
 * Flat bands are skipped, not counted as rightward — see `observedDirection`. An inverted
 * haplotype's passages through the segment boxes are flat, and counting them would make
 * every inverted haplotype in the corpus read as mixed.
 */
export function haplotypeDirections(document: DirectedDocument): HaplotypeDirection[] {
    const sawRightward = new Uint8Array(document.strandCount)
    const sawLeftward = new Uint8Array(document.strandCount)

    for (let band = 0; band < document.bandCount; band += 1) {
        const direction = observedDirection(document.bandDirections, band)

        if (null === direction) {
            continue
        }

        const strand = document.strandIds[band]

        if ('leftward' === direction) {
            sawLeftward[strand] = 1
        } else {
            sawRightward[strand] = 1
        }
    }

    const directions = new Array<HaplotypeDirection>(document.strandCount)

    for (let strand = 0; strand < document.strandCount; strand += 1) {
        directions[strand] = foldDirection(sawRightward[strand], sawLeftward[strand])
    }

    return directions
}

/**
 * Which way GRCh38 runs in this document, or `null` where the document cannot say.
 *
 * Three absences arrive as the same `null`, and all three mean the same thing to a viewer:
 * there is no reference to read the other haplotypes against. No GRCh38 strand at all; a
 * GRCh38 strand drawn flat from end to end; a GRCh38 strand that runs both ways. The last
 * is not refused any more than any other mixed haplotype is — it simply leaves nothing to
 * compare against, and a direction guessed from a reference that disagrees with itself
 * would name inverted haplotypes at random.
 *
 * A document naming more than one GRCh38 strand is folded as one haplotype: if they agree
 * that is the reference direction, and if they do not there is none.
 */
export function referenceDirection(document: DirectedDocument): BandDirection | null {
    return referenceOf(document, haplotypeDirections(document))
}

/**
 * The same reading, over directions already folded.
 *
 * Split out because the census wants both, and folding 11,586 bands twice to answer two
 * questions about the same document is a scan that buys nothing.
 */
function referenceOf(
    document: DirectedDocument,
    directions: HaplotypeDirection[]
): BandDirection | null {
    let sawRightward = 0
    let sawLeftward = 0

    for (let strand = 0; strand < document.strandCount; strand += 1) {
        if (false === (document.strandNames[strand] ?? '').startsWith(REFERENCE_PREFIX)) {
            continue
        }

        const direction = directions[strand]

        if ('mixed' === direction) {
            return null
        }

        sawLeftward |= 'leftward' === direction ? 1 : 0
        sawRightward |= 'rightward' === direction ? 1 : 0
    }

    const folded = foldDirection(sawRightward, sawLeftward)

    return 'mixed' === folded ? null : folded
}

/** How many haplotypes run which way in this document, read against GRCh38's own direction. */
export function censusInversion(document: DirectedDocument): InversionCensus {
    return censusOf(haplotypeDirections(document), document)
}

/** The census, over directions already folded. */
function censusOf(
    directions: HaplotypeDirection[],
    document: DirectedDocument
): InversionCensus {
    const reference = referenceOf(document, directions)

    if (null === reference) {
        return {
            reference: null,
            haplotypes: document.strandCount,
            mixed: directions.filter(direction => 'mixed' === direction).length
        }
    }

    const census = {
        reference,
        haplotypes: document.strandCount,
        inverted: 0,
        forward: 0,
        mixed: 0,
        undetermined: 0
    }

    for (const direction of directions) {
        if ('mixed' === direction) {
            census.mixed += 1
        } else if (null === direction) {
            census.undetermined += 1
        } else if (reference === direction) {
            census.forward += 1
        } else {
            census.inverted += 1
        }
    }

    return census
}

/**
 * The document-level statement, or `null` where there is nothing to state.
 *
 * *`166 of 463 haplotypes inverted`* — the headline fact, and at fit the only one legible:
 * a band is 0.19 css px tall there and no individual haplotype resolves at all. It is
 * deliberately a count and a total rather than a percentage, because the total is the thing
 * a researcher already knows the document by.
 *
 * **Silence is a result.** A document whose haplotypes all run with the reference says
 * nothing — no "0 inverted", which is a sentence about inversion in a document that has
 * none — and neither does a document with no reference, which cannot make the claim at all.
 *
 * **A mixed haplotype is stated either way**, including where nothing is inverted and where
 * there is no reference at all: it is a fact about the picture rather than a reading against
 * GRCh38, and a haplotype that turns around mid-traversal is precisely what nobody should
 * have to go looking for. Zero of 463 do it in the known document, which is why one that did
 * would matter.
 */
export function describeInversion(census: InversionCensus): string | null {
    const said: string[] = []

    if (null !== census.reference && 0 < census.inverted) {
        said.push(`${census.inverted} of ${census.haplotypes} haplotypes inverted`)
    }

    if (0 < census.mixed) {
        said.push(0 === said.length
            ? `${census.mixed} of ${census.haplotypes} haplotypes mixed`
            : `${census.mixed} mixed`)
    }

    return 0 === said.length ? null : said.join(' · ')
}

/** What one haplotype's two observations fold to: one way, both ways, or nothing seen. */
function foldDirection(sawRightward: number, sawLeftward: number): HaplotypeDirection {
    if (sawRightward && sawLeftward) {
        return 'mixed'
    }

    if (sawLeftward) {
        return 'leftward'
    }

    return sawRightward ? 'rightward' : null
}

/**
 * What one haplotype's direction is called on screen.
 *
 * `inverted` is the glossary's word and the only one carrying a biological claim. `mixed`
 * matches the caption, so a row and the sentence above it name the same thing the same way.
 * There is no third word: the ordinary case is unmarked, for the reasons `haplotypeReadings`
 * gives.
 */
export const INVERTED = 'inverted'
export const MIXED = 'mixed'

/** One of the two words, and nothing else — so a surface cannot be handed *forward*, which
 *  is the census's word for a count and not a word a researcher is shown. */
export type HaplotypeReading = typeof INVERTED | typeof MIXED

/**
 * What to say about each haplotype's direction beside its name, indexed by strand id, and
 * `null` — which is most of them — for the ones there is nothing to say about.
 *
 * The caption says *how many*; this is *which*, which is the whole of #132: a researcher who
 * can see that 166 haplotypes are inverted still cannot see whether the one under the feeler
 * is one of them. It is a string rather than a token because every one of its readers is a
 * text surface — the strand label, the `?pick` readout — and the vocabulary rule ADR `0004`
 * and `CONTEXT.md` §inverted state is about the words, so the words are decided once, here,
 * beside the reading that produces them.
 *
 * **Only the inverted haplotypes are named.** There is no *not inverted*: it is the ordinary
 * case, it would put a word on 297 of the inverted document's 463 rows and on every row of
 * the four documents that have no inversion at all, and the two rows it adds to a segment
 * tooltip are two rows saying nothing happened. So the tag is a mark on the exceptions, and
 * its absence is the ordinary reading — the same discipline `describeInversion` follows in
 * saying nothing rather than *0 inverted*.
 *
 * That absence is therefore several things at once, and deliberately: this haplotype runs
 * with the reference; or the document has no reference direction to read against, the
 * ticket's third criterion; or every band this haplotype draws is flat, so the document did
 * not say. None of the three is a finding, which is why one silence can carry them all.
 *
 * **A mixed haplotype is reported either way**, reference or none, exactly as the caption
 * reports it: it is a fact about the picture rather than a reading against GRCh38, and a
 * haplotype that turns around mid-traversal is precisely what nobody should have to go
 * looking for.
 */
export function haplotypeReadings(document: DirectedDocument): Array<HaplotypeReading | null> {
    return readingsOf(haplotypeDirections(document), document)
}

/**
 * Everything this document says about direction, folded once.
 *
 * The census and the readings are the same scan asked two questions — how many, and which —
 * and they are read together, at load, by the surface that draws both. Folding 11,586 bands
 * twice to answer them separately is the scan `referenceOf` already declines to make.
 */
export function readInversion(document: DirectedDocument): {
    census: InversionCensus,
    readings: Array<HaplotypeReading | null>
} {
    const directions = haplotypeDirections(document)

    return {
        census: censusOf(directions, document),
        readings: readingsOf(directions, document)
    }
}

/** The readings, over directions already folded. */
function readingsOf(
    directions: HaplotypeDirection[],
    document: DirectedDocument
): Array<HaplotypeReading | null> {
    const reference = referenceOf(document, directions)

    return directions.map(direction => {
        if ('mixed' === direction) {
            return MIXED
        }

        // A document with no reference direction falls out here without a branch of its own:
        // nothing can oppose a direction that does not exist, so nothing is named.
        return null !== direction && null !== reference && reference !== direction
            ? INVERTED
            : null
    })
}
