/**
 * Band parser — the surface's reading of `g.track`, which is every drawable in the
 * document but the segment boxes. Those are `parseSegmentBoxes.ts`, and the two are read
 * separately because they become different things: bands become one instanced mesh, boxes
 * become HTML divs.
 *
 * Deliberately regex over raw response text, never `DOMParser`: building 40,442 DOM
 * nodes is exactly the cost this renderer exists to escape.
 *
 * A band is six floats — `x0, y0, width, y1, uTop, uBottom` — plus a `trackID`, the
 * `trackName` that says which haplotype that integer is, and where the inference places
 * that haplotype in the ancestry cloud (`pclaiX`, `pclaiY`, `pclaiScore`). The placement
 * is read on the same pass over the same elements — it is an attribute of a band, not a
 * second document — and it is what `pclaiInset.ts` plots. The two `u` values are the
 * control abscissae of the *top* and *bottom* edges as a fraction of the span, and they
 * differ (0.70000 vs 0.69874 in the first band of `5520+`), so a
 * band's thickness varies along its length. The two edges are not translates of each
 * other and the "offset the top edge by THICKNESS" shortcut would be wrong.
 *
 * ## Coordinates are converted here, once
 *
 * The SVG's y points down and its origin is the viewBox corner. Three.js's y points up
 * and PGB's camera sits at the origin with a symmetric frustum. Both differences are
 * resolved *in this file* and nowhere else: nothing downstream knows the source was SVG
 * or that y ever pointed down.
 *
 *     world.x = svg.x - centreX
 *     world.y = centreY - svg.y
 *
 * So `y0` and `y1` name the band's **upper** edge, and thickness extends in **-y**.
 * Centring also halves coordinate magnitudes, which buys back a little of the float32
 * headroom that uncapped zoom spends.
 *
 * World units stay SVG user units: a band is 15 units thick and `5520+` is 108,983 wide.
 * Rescaling would buy nothing and cost a second mental model when reading numbers.
 *
 * Document order is preserved through to the instance buffer, because bands are opaque
 * and SVG paints them with the painter's algorithm — order *is* z-order.
 */

import { NUMBER as N, NonConformingDocument, countOccurrences } from './documentGrammar.ts'
import type { Point } from './geometry.ts'

/** Constant across all 127,101 surveyed strand paths, and every `<rect>` height. */
export const THICKNESS = 15

/** Largest strand id the Uint16 instance buffer can hold without wrapping. */
export const MAX_STRAND_ID = 65535

/** How the document spells "the inference placed this haplotype nowhere". */
const ABSENT = 'None'

/**
 * Which way a band runs along the document's x-axis. Document-relative and always defined:
 * a fact about the picture, carrying no biological claim — the reading that does, *inverted*,
 * needs the reference's own direction and is made where the reference is known. ADR `0004`.
 */
export type BandDirection = 'rightward' | 'leftward'

/** The two directions as they are stored, one byte per band beside the geometry, plus the
 *  byte for a band that was drawn flat and therefore ran neither way. */
export const RIGHTWARD = 0
export const LEFTWARD = 1
/** A `<rect>`: drawn with a positive width by construction, so it *observes* no direction.
 *  It reads `rightward` as a fact about the picture — that is which way it is stored, and
 *  which way it rasterizes — and reads as nothing at all through `observedDirection`. */
export const FLAT = 2

/** What direction band `band` runs, in the vocabulary `CONTEXT.md` fixes. A flat band runs
 *  rightward, because that is how a `<rect>` is drawn and how this parser stores it. */
export function bandDirection(directions: Uint8Array, band: number): BandDirection {
    return LEFTWARD === directions[band] ? 'leftward' : 'rightward'
}

/**
 * What direction band `band` was *observed* to run, or `null` where it observed none.
 *
 * The reading anything aggregating over a strand wants, and the difference from
 * `bandDirection` is the whole of why it exists: an inverted haplotype's passages through
 * the segment boxes are flat, and counting those as rightward observations would make every
 * inverted strand in the chr8 document read as mixing both directions. A flat band is the
 * degenerate case of direction just as it is of the curve — it says nothing, and this is
 * where nothing is spelled `null` rather than `'rightward'`.
 */
export function observedDirection(directions: Uint8Array, band: number): BandDirection | null {
    if (FLAT === directions[band]) {
        return null
    }

    return LEFTWARD === directions[band] ? 'leftward' : 'rightward'
}

export interface ParsedMap {
    /** Six floats per band, document order: x0, y0, width, y1, uTop, uBottom. World
     *  coordinates, y up, centred on the origin. `y0`/`y1` are the upper edge.
     *
     *  **`width` is always positive and `x0` is always the left end**, whichever end the
     *  document drew first — which end that was is `bandDirections`. */
    geometry: Float32Array
    /** One strand id per band, parallel to `geometry`. */
    strandIds: Uint16Array
    /** Which way each band was drawn, parallel to `geometry`: `RIGHTWARD`, `LEFTWARD`, or
     *  `FLAT` for a band that ran neither way.
     *
     *  **Per band, because that is where it is observed.** A whole strand running one way is
     *  the case in every document seen — 463 strands in the chr8p23.1 document, none of them
     *  mixing — but that is a regularity of one document, and taking a surveyed regularity
     *  for a rule is what produced the refusal ADR `0004` withdrew. Whatever wants a
     *  strand's direction, or a route's, aggregates these at read time and is free to find
     *  that a strand carries both.
     *
     *  **A flat band is stored `FLAT`**, because a `<rect>` has a positive width by
     *  construction — it is the degenerate case of direction just as it is of the curve, and
     *  it carries no observation of which way its haplotype was walking. So an inverted
     *  strand's *bands* are not all leftward: its **connectors** are, and its passages
     *  through the segment boxes are flat. Anything aggregating over a strand has to read
     *  that as the absence of an observation rather than as a rightward one — which is
     *  `observedDirection`, and which is why the third byte exists rather than the two the
     *  vocabulary has words for.
     *
     *  Read with `bandDirection`, which spells the two words and calls a flat band
     *  rightward, or with `observedDirection`, which calls it nothing. */
    bandDirections: Uint8Array
    bandCount: number
    /** RGB triples, one per strand, indexed by strand id. */
    strandColors: Uint8Array
    /** What the document calls each strand, indexed by strand id.
     *
     *  **Opaque strings.** The chr8 fixture spells 463 of its 464 names with four
     *  `#`-separated parts (`NA21309#2#CM092102.1#0`) and one with three, so PanSN is
     *  already false in this repo and nothing here splits on the separator. What the
     *  document spells is what the feeler reads out and what a researcher pastes
     *  elsewhere, so it round-trips verbatim or not at all. */
    strandNames: string[]
    /** Where the document places each strand in the ancestry cloud, indexed by strand id,
     *  or `null` for a strand it does not place.
     *
     *  **Absent is not the origin.** `pclaiX="None"` is how the document says the inference
     *  produced nothing for this haplotype here, and zero would be a position — a plausible
     *  one, near the middle of the cloud. How many there are is a property of the document:
     *  6 in the chr1 strip, 12 in the chr8 document and 99 in `5520+`, so nothing may
     *  assume a count. A document carrying no placement attributes at all — which no
     *  document in this repo is, and which the band survey behind ADR `0002` never ruled
     *  out — places nobody, and is drawn as the map it still is.
     *
     *  PCLAI coordinates, not world coordinates: the plane is the one
     *  `strandCoordinates.ts` frames, and no conversion this file performs touches them. */
    strandPlacements: Array<Point | null>
    /** What the document says about each placement's confidence, indexed by strand id, or
     *  `null` where the document says nothing.
     *
     *  **The document's own spelling, opaque, like a name.** It is usually an integer —
     *  `995`, `840` — but every fixture in this repo also spells two of them `impainted`,
     *  on strands that *are* placed, and those two are not a number with a bad value: they
     *  are a different kind of answer. Reading the field as a number would either refuse
     *  four real documents or quietly turn a category into `NaN`, so it is carried
     *  verbatim and whoever eventually displays it decides what the categories mean.
     *
     *  Carried and not yet displayed — opacity and size are the channels it would naturally
     *  take in the inset and both are spoken for. */
    strandScores: Array<string | null>
    strandCount: number
    /** Extent of the content, in world units. Centred on the origin. */
    content: { width: number, height: number }
    /** The viewBox centre subtracted above, in the document's own units. Anything else
     *  reading the same document has to apply it to land in the same frame — which is
     *  what `parseSegmentBoxes` takes it for. */
    centre: Point
}

/**
 * `trackID` is UCSD's spelling, not ours. This renderer calls the thing a **strand**, because
 * the upstream word collides with PGB's annotation feature of that name — but the attribute
 * in the document is named by whoever writes the document, so every pattern matching the
 * source text keeps the upstream name and only what we build out of it is renamed.
 */
const FILL = 'style="fill: rgb\\((\\d+), (\\d+), (\\d+)\\); fill-opacity: 1;" trackID="(\\d+)"'
    + ' trackName="([^"]+)"'
    // Where the haplotype sits in the ancestry cloud, and how confident the inference was.
    //
    // `[^>]*?` rather than the attributes actually in between — `class` and `color`, both
    // restatements of what the fill and the id already say — so a document that adds an
    // attribute there still parses. It cannot run past the element: `>` is excluded.
    //
    // **Optional, unlike everything else in the grammar.** The band survey ADR `0002` rests
    // its whole-document refusal on covered geometry and fill across 17 documents; it did
    // not ask about these three attributes, and all four documents committed here are HPRC.
    // A tube map is a map first, so a document that says nothing about ancestry draws its
    // map and gets no cloud — refusing it would be this parser using evidence it does not
    // have. A placement that is *present and malformed* is refused, in `readPlacement`:
    // that is a document making a claim this renderer cannot read, which is what the gate
    // is for.
    + '(?:[^>]*? pclaiX="([^"]*)" pclaiY="([^"]*)" pclaiScore="([^"]*)")?'

/** A degenerate band: flat, so its control abscissae carry no information. */
const RECT = `<rect x="${N}" y="${N}" width="${N}" height="${N}" ${FILL}`

/** `M x0 y0  C cx y0 cx y1  x1 y1  V y1+15  C dx y1+15 dx y0+15  x0 y0+15  Z` */
const PATH = `<path d="M ${N} ${N} C ${N} ${N} ${N} ${N} ${N} ${N} V ${N} `
    + `C ${N} ${N} ${N} ${N} ${N} ${N} Z" ${FILL}`

const ELEMENT = new RegExp(`(?:${RECT})|(?:${PATH})`, 'g')

/**
 * One strand's colour, as CSS.
 *
 * Stated once because two panels now paint with it — the cloud's dots and the feeler label's
 * swatches — and a haplotype that were a different colour in the two would break the one thing
 * the colour is for. It is the document's own bytes and nothing here adjusts them:
 * `CONTEXT.md` and `strandAppearance.ts` both turn on the colour being untouched.
 */
export function strandCss(colors: Uint8Array, strandId: number): string {
    const red = strandId * 3

    return `rgb(${colors[red]}, ${colors[red + 1]}, ${colors[red + 2]})`
}

export function parseBands(text: string): ParsedMap {
    // Said before anything about bands, because the common way to arrive here with the
    // wrong bytes is an HTML error page or a redirect, and "no drawable elements in
    // g.track" reads as a defect in a tube map rather than as the absence of one.
    if (false === text.includes('<svg')) {
        throw new NonConformingDocument('The response is not an SVG document.')
    }

    const viewBox = parseViewBox(text)
    const centreX = viewBox.minX + viewBox.width * 0.5
    const centreY = viewBox.minY + viewBox.height * 0.5

    // Everything before `<g class="node">` is `g.track`; the segment boxes after it are
    // the whitelisted exception and are not this renderer's business. Slicing here
    // rather than filtering later is what keeps the grammar check written against
    // `g.track` specifically.
    // `trackGroup` keeps the document's own name: it is the text of `g.track`, not a strand.
    const trackGroupEnd = text.indexOf('<g class="node"')
    const trackGroup = -1 === trackGroupEnd ? text : text.slice(0, trackGroupEnd)

    const expected = countOccurrences(trackGroup, '<rect') + countOccurrences(trackGroup, '<path')

    if (0 === expected) {
        throw new NonConformingDocument('The document draws no bands at all; its g.track group is empty.')
    }

    const geometry = new Float32Array(expected * 6)
    const strandIds = new Uint16Array(expected)
    const bandDirections = new Uint8Array(expected)
    /** How the document draws each strand and what it calls it, taken from the first band
     *  carrying the id. One map rather than two, so a strand's colour and its name cannot
     *  be populated from different bands or drained in different orders. */
    const strands = new Map<number, {
        rgb: [number, number, number],
        name: string,
        placement: Point | null,
        score: string | null
    }>()

    let bands = 0
    let maxStrandId = -1
    let match: RegExpExecArray | null

    ELEMENT.lastIndex = 0

    while (null !== (match = ELEMENT.exec(trackGroup))) {
        const isRect = undefined !== match[1]

        let x0: number
        let y0: number
        let x1: number
        let y1: number
        let controlTop: number
        let controlBottom: number
        let red: number
        let green: number
        let blue: number
        let id: number
        let name: string
        let placementX: string | undefined
        let placementY: string | undefined
        let score: string | undefined

        if (isRect) {
            x0 = +match[1]
            y0 = +match[2]
            x1 = x0 + +match[3]
            y1 = y0

            if (THICKNESS !== +match[4]) {
                throw new NonConformingDocument(
                    `A band in g.track is ${match[4]} units tall; every band in a tube map is ${THICKNESS}.`
                )
            }

            if (0 >= +match[3]) {
                throw new NonConformingDocument(
                    `A band in g.track is ${match[3]} units wide; a band must have a positive width.`
                )
            }

            // Flat: both edges are horizontal, so any control abscissa reproduces it.
            controlTop = x0 + (x1 - x0) * 0.5
            controlBottom = controlTop

            red = +match[5]
            green = +match[6]
            blue = +match[7]
            id = +match[8]
            name = match[9]
            placementX = match[10]
            placementY = match[11]
            score = match[12]
        } else {
            x0 = +match[13]
            y0 = +match[14]
            controlTop = +match[15]
            x1 = +match[19]
            y1 = +match[20]
            controlBottom = +match[22]

            assertGrammar(match, x0, y0, x1, y1, controlTop, controlBottom)

            red = +match[28]
            green = +match[29]
            blue = +match[30]
            id = +match[31]
            name = match[32]
            placementX = match[33]
            placementY = match[34]
            score = match[35]
        }

        // The instance buffer stores ids as Uint16. Silently wrapping would draw a
        // plausible map of the wrong haplotypes, which is the failure this parser
        // exists to refuse.
        if (id > MAX_STRAND_ID) {
            throw new NonConformingDocument(
                `A band carries trackID ${id}, above the ${MAX_STRAND_ID} this renderer can hold.`
            )
        }

        // Which way the band was drawn, kept beside the geometry rather than in it. The
        // geometry below is then always stored left-to-right, so a leftward band's endpoints
        // — abscissa *and* ordinate together, or the band would slope the wrong way — swap.
        //
        // The curve is unchanged by the swap, exactly. A cubic whose two control points share
        // an abscissa is its own reverse with the control points in the other order, and the
        // shader's y is a smoothstep, which is symmetric about its midpoint. So a leftward
        // band stored this way rasterizes to the same pixels the document draws, and nothing
        // downstream — pick pass, overlay, navigator — learns that direction exists.
        const isLeftward = x1 < x0

        if (isLeftward) {
            const swapX = x0; x0 = x1; x1 = swapX
            const swapY = y0; y0 = y1; y1 = swapY
        }

        // Normalize the control abscissae in double before the cast to float. `5514+` is
        // 177,994 units wide, where a float32 ulp is 0.0156 — enough to move a control
        // point measurably within a span of a few hundred units. Storing them as
        // fractions confines the large magnitude to `x0` alone.
        const width = x1 - x0
        const at = bands * 6

        geometry[at] = x0 - centreX
        geometry[at + 1] = centreY - y0
        geometry[at + 2] = width
        geometry[at + 3] = centreY - y1
        geometry[at + 4] = (controlTop - x0) / width
        geometry[at + 5] = (controlBottom - x0) / width
        strandIds[bands] = id
        bandDirections[bands] = isRect ? FLAT : (isLeftward ? LEFTWARD : RIGHTWARD)

        if (false === strands.has(id)) {
            strands.set(id, {
                rgb: [red, green, blue],
                name,
                placement: readPlacement(placementX, placementY),
                score: readScore(score)
            })
        }

        if (id > maxStrandId) {
            maxStrandId = id
        }

        bands += 1
    }

    // Anything in g.track the grammar did not match means this is not the document we
    // know how to draw. Reject the whole thing rather than render a silently incomplete
    // map — this API already returns 200-with-plausible-nonsense for an unknown node,
    // and a half-drawn map looks like a correct map of different data.
    if (bands !== expected) {
        throw new NonConformingDocument(
            `Of the ${expected} drawables in g.track, ${expected - bands} are not bands this renderer recognises.`
        )
    }

    const strandCount = maxStrandId + 1

    // Before the tables are built, not after: they are indexed by strand id and dense, and
    // a document numbering its strands with a gap in it has no such table to fill.
    if (strands.size !== strandCount) {
        throw new NonConformingDocument(
            `The document draws ${strands.size} strands but numbers them up to ${maxStrandId}; `
            + 'trackID must run from 0 upward with no gaps.'
        )
    }

    const strandColors = new Uint8Array(strandCount * 3)
    const strandNames = new Array<string>(strandCount)
    const strandPlacements = new Array<Point | null>(strandCount)
    const strandScores = new Array<string | null>(strandCount)

    for (const [id, strand] of strands) {
        strandColors[id * 3] = strand.rgb[0]
        strandColors[id * 3 + 1] = strand.rgb[1]
        strandColors[id * 3 + 2] = strand.rgb[2]
        strandNames[id] = strand.name
        strandPlacements[id] = strand.placement
        strandScores[id] = strand.score
    }

    return {
        geometry,
        strandIds,
        bandDirections,
        bandCount: bands,
        strandColors,
        strandNames,
        strandPlacements,
        strandScores,
        strandCount,
        content: { width: viewBox.width, height: viewBox.height },
        centre: { x: centreX, y: centreY }
    }
}

/**
 * The grammar's redundancy is its own checksum: both control points of each cubic share
 * an abscissa, the cubics' ordinates repeat the endpoints, and the return edge is the
 * forward edge shifted by exactly THICKNESS. Verifying it costs nothing and turns "the
 * survey said 100%" into something this run re-establishes per document.
 *
 * What is *not* checked here is which way the band runs. It was, until ADR `0004`: `x1 > x0`
 * held across every document surveyed and was written down as a rule, and a chr8p23.1
 * document containing an inversion was refused whole for breaking it. Direction was never
 * part of the drawing grammar — it is biology, and this gate is silent about biology. The
 * gate's policy is untouched: a document off the grammar is still refused whole.
 */
function assertGrammar(
    match: RegExpExecArray,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    controlTop: number,
    controlBottom: number
): void {
    const expect = (actual: number, wanted: number, what: string): void => {
        if (actual !== wanted) {
            throw new NonConformingDocument(
                `A band's ${what} is ${actual} where the band grammar requires ${wanted}.`
            )
        }
    }

    expect(+match[16], y0, 'first control ordinate')
    expect(+match[17], controlTop, 'second control abscissa')
    expect(+match[18], y1, 'second control ordinate')
    expect(+match[21], y1 + THICKNESS, 'vertical closing edge')
    expect(+match[23], y1 + THICKNESS, 'return first control ordinate')
    expect(+match[24], controlBottom, 'return second control abscissa')
    expect(+match[25], y0 + THICKNESS, 'return second control ordinate')
    expect(+match[26], x0, 'return endpoint abscissa')
    expect(+match[27], y0 + THICKNESS, 'return endpoint ordinate')

    // The half of the withdrawn assertion that was never about direction. A band of no
    // width has no span to normalize the control abscissae against, so it would be stored
    // as NaN and drawn as nothing — the same refusal a `<rect>` of width 0 already gets,
    // said for the curved case.
    if (x0 === x1) {
        throw new NonConformingDocument(
            `A band spans ${x0} to ${x1}; a band must have a positive width.`
        )
    }
}

/**
 * A band's placement, as the document spells it: a coordinate pair, or `null` where there
 * is none to read.
 *
 * Two different absences arrive as the same `null`, deliberately. A document with no
 * `pclaiX` attribute at all is not an HPRC document and says nothing about ancestry; a
 * document spelling it `None` says the inference ran and placed this haplotype nowhere.
 * Neither is a position, and the inset draws a dot for neither — the distinction would
 * only matter to something that reported *why* a haplotype is missing, which nothing does.
 *
 * Anything else is refused rather than read as absent, because a placement silently
 * dropped is a haplotype missing from a cloud that still reads as complete. The two axes
 * are refused together: a strand placed on one axis and not the other is not a thing this
 * data has, and half a coordinate is not a position.
 */
function readPlacement(x: string | undefined, y: string | undefined): Point | null {
    if (undefined === x || undefined === y) {
        return null
    }

    if (ABSENT === x && ABSENT === y) {
        return null
    }

    const at = { x: Number(x), y: Number(y) }

    if (false === Number.isFinite(at.x) || false === Number.isFinite(at.y)) {
        throw new NonConformingDocument(
            `A band is placed at pclaiX="${x}" pclaiY="${y}", which is neither a coordinate nor "${ABSENT}".`
        )
    }

    return at
}

/** The score as the document spells it, with either absence turned into one. */
function readScore(score: string | undefined): string | null {
    return undefined === score || ABSENT === score ? null : score
}

function parseViewBox(text: string): { minX: number, minY: number, width: number, height: number } {
    const match = /viewBox="([^"]+)"/.exec(text)

    if (null === match) {
        throw new NonConformingDocument('The document declares no viewBox.')
    }

    const parts = match[1].trim().split(/[\s,]+/).map(Number)

    if (4 !== parts.length || false === parts.every(Number.isFinite)) {
        throw new NonConformingDocument(
            `The document's viewBox reads "${match[1]}", which is not four numbers.`
        )
    }

    return { minX: parts[0], minY: parts[1], width: parts[2], height: parts[3] }
}
