/**
 * Band payload reader — the second way into the same `TubeMapReading`.
 *
 * `parseBands.ts` recovers the picture from an SVG document's drawing commands; this reads
 * `/seqtubemap?format=bands`, where the same picture arrives as the numbers themselves.
 * Both produce the identical structure, so `bandSurface`, `bandPicker`, `strandAppearance`,
 * `inversion`, `pclaiInset`, `strandLabel`, `segmentOverlay` and `navigator` never learn
 * which one ran. ADR `0005` records why there are two, why the format is chosen by a flag
 * rather than by a fallback, and why direction is derived here rather than carried on the
 * wire.
 *
 * **Both halves of the picture are read here**, as they are on the document route: the
 * bands, out of the body's columns, and the segment boxes, out of the header's `segments`.
 * The boxes' half is `readSegmentBoxes` below and is a frame change and nothing else —
 * `parseSegmentBoxes.ts`'s grammar, tolerance and redundancy relations have no counterpart
 * on this path, because a box arrives as the five numbers it is (their #66, this repo's
 * #151).
 *
 * The format is specified in the API repo's `docs/band-format.md`, and this file is written
 * against that document rather than against their encoder. Reading it is four lines — a
 * `uint32` length, a JSON header, a `ceil4` pad, and typed-array views over what follows —
 * and **no regular expression runs over the response on this path**. That is the whole of
 * what ADR `0002` paid for and this discharges: the geometry column is a `Float32Array`
 * view over the bytes that arrived, which is the instance buffer.
 *
 * ## What this reader does beyond viewing the bytes
 *
 * **It normalises, and records direction while doing it.** The payload carries
 * `x0, y0, x1, y1` in the order the layout drew them, so a leftward band's `x0` is its
 * *right* end. `ParsedMap` promises the opposite — `width` positive, `x0` the left end — so
 * the ends are swapped and which way the band ran goes into `bandDirections` beside the
 * geometry. This is not an inversion-only case: chr8:10,079,054-10,080,461 draws 2,334
 * leftward curves against 4,370 rightward and 6,542 flat.
 *
 * **It converts the control abscissae.** They arrive absolute and are stored as a fraction
 * of the span, against the *normalised* ends. The two differ per band — the top and bottom
 * edges are not translates of each other — so the "offset the top edge by `THICKNESS`"
 * shortcut is as wrong here as it is there.
 *
 * **It applies the frame**, from `header.document.viewBox` through `documentFrame.ts`. Same
 * four numbers as the document reader takes off the `viewBox` attribute, through the same
 * function, so the two cannot disagree about where the origin is (#144).
 *
 * All three happen in place, in one pass over the `Float32Array` view: six floats per band
 * go in and six come out, so the 1.4 MB the largest payload arrives as is never copied.
 */

import type { DocumentFrame } from './documentFrame.ts'
import { documentFrame } from './documentFrame.ts'
import { NonConformingTubeMap } from './nonConformingTubeMap.ts'
import type { Point } from './geometry.ts'
import type { ParsedMap } from './parseBands.ts'
import type { SegmentBox } from './parseSegmentBoxes.ts'
import type { TubeMapReading } from './tubeMapReading.ts'
import { FLAT, LEFTWARD, MAX_STRAND_ID, RIGHTWARD, THICKNESS, storeBand } from './parseBands.ts'

/** What `header.format` must spell. Anything else is a different wire format wearing this
 *  one's content type. */
const FORMAT = 'pangenome-bands'

/** The one version of the format this build knows. It changes when the meaning of a field
 *  changes; a new *optional* field does not change it, so this is `===` and not `>=`. */
const VERSION = 1

/** How `header.band.kinds` spells a `<rect>` — the degenerate band, drawn flat. */
const RECT_KIND = 0

/** The opacity every band is drawn at, and the only one this renderer draws. */
const ALPHA = 1

/**
 * The one appearance a segment box is drawn in, as the payload spells it.
 *
 * Matched literally, exactly as `parseSegmentBoxes.ts` matches the document's three
 * declarations: an appearance this viewer does not describe is a payload to refuse rather
 * than one to reproduce, because `segmentOverlay`'s stylesheet carries these three back and
 * nothing else. The spellings are the document's own attribute values, which is what the
 * format promises to send — `#ffffff` here where the document's style property reads
 * `rgb(255, 255, 255)`, the same colour written the way the attribute writes it.
 */
const SEGMENT_APPEARANCE: Record<string, string> = {
    fill: '#ffffff',
    fillOpacity: '0.4',
    stroke: '#000000'
}

/** The unit a stroke width arrives in. The width is a *dimension* and is read; the unit is
 *  part of the spelling and is matched, as the document reader matches its `px`. */
const PIXELS = 'px'

/**
 * One strand's row in the header's table, as the format spells it.
 *
 * `pclaiScore` is a **string**, not a number: usually an integer spelled as text (`"993"`),
 * and spelled `"impainted"` on strands that *are* placed. Their spec said `0.98` when this
 * parser was written against it and [has been corrected](https://github.com/CAST-genomics/PangenomeAPI/pull/67)
 * — writing a reader from a spec is what caught it.
 */
interface StrandRow {
    id: number
    name: string
    color: [number, number, number]
    pclaiX: number | null
    pclaiY: number | null
    pclaiScore: string | null
}

/**
 * One segment box's row in the header, as the format spells it.
 *
 * `box` is five numbers in the document's own coordinates and its own double precision —
 * the whole of the rectangle, since #66. It travelled as the path command the document
 * draws it with until then, which cost this repo an outline grammar, a tolerance and two
 * spellings of one rectangle; `parseSegmentBoxes.ts` is that grammar, still the SVG route's
 * reader and untouched by this.
 *
 * **The four appearance fields are strings**, and `strokeWidth` carries its CSS unit
 * (`"2px"`): they are the document's own attribute values, on their way back out as
 * attributes on the SVG route, so they travel as written rather than as numbers the format
 * would have to spell back. Their spec said `0.4` and `2` when this reader was written
 * against it and [has been corrected](https://github.com/CAST-genomics/PangenomeAPI/pull/71)
 * — the same defect as `pclaiScore` above, caught the same way.
 */
interface SegmentRow {
    id: string
    box: { left: number, top: number, right: number, bottom: number, radius: number }
    sequence: string
    fill: string
    fillOpacity: string
    stroke: string
    strokeWidth: string
}

interface BandColumn {
    byteOffset: number
    byteLength: number
}

interface BandPayloadHeader {
    format: string
    version: number
    document: { viewBox: string }
    band: {
        thickness: number
        alpha: number
        count: number
        geometry: BandColumn
        strandIds: BandColumn
        kinds: BandColumn
    }
    strands: StrandRow[]
    segments: SegmentRow[]
    reversals: { corners: unknown[], connectors: unknown[] }
    bodyLength: number
}

/**
 * The picture a band payload describes, in the shape the document parser also produces.
 *
 * `bytes` is the response verbatim. **The geometry is transformed in place**, so the caller
 * hands over ownership of the buffer: the returned `geometry` is a view onto it where the
 * bytes are aligned, and a copy where they are not. Nothing else in the response is read
 * afterwards, so there is nothing left to invalidate.
 */
export function parseBandPayload(bytes: Uint8Array): TubeMapReading {
    const header = readHeader(bytes)
    const { count } = header.band

    // Where the body begins: the header padded up to the four-byte boundary its typed
    // arrays need. Offsets inside the body are relative to here.
    const bodyStart = (4 + headerLength(bytes) + 3) & ~3

    if (bytes.byteLength - bodyStart !== header.bodyLength) {
        throw new NonConformingTubeMap(
            `The payload's header declares a ${header.bodyLength}-byte body and `
            + `${bytes.byteLength - bodyStart} bytes arrived.`
        )
    }

    const geometry = readFloat32(bytes, bodyStart, header.band.geometry, count * 6)
    const strandIds = readUint16(bytes, bodyStart, header.band.strandIds, count)
    const kinds = readUint8(bytes, bodyStart, header.band.kinds, count)

    const { centre, content } = frameOf(header)
    const bandDirections = new Uint8Array(count)

    for (let band = 0; band < count; band += 1) {
        const at = band * 6

        // A band of no width has no span to normalize the control abscissae against, so it
        // would be stored as NaN and drawn as nothing. The document parser refuses it — for
        // a `<rect>` and for a curve alike — and refusal parity between the two readers is
        // the whole point of there being two.
        if (geometry[at] === geometry[at + 2]) {
            throw new NonConformingTubeMap(
                `A band spans ${geometry[at]} to ${geometry[at + 2]}; a band must have a positive width.`
            )
        }

        const isLeftward = storeBand(geometry, at, {
            x0: geometry[at],
            y0: geometry[at + 1],
            x1: geometry[at + 2],
            y1: geometry[at + 3],
            controlTop: geometry[at + 4],
            controlBottom: geometry[at + 5]
        }, centre)

        // Which way the band was drawn, kept beside the geometry rather than in it. A flat
        // band is `FLAT` and not `RIGHTWARD`: it has a positive width by construction and
        // therefore observes no direction at all, which is the distinction
        // `observedDirection` rests on and the reason for the third byte.
        bandDirections[band] = RECT_KIND === kinds[band] ? FLAT : (isLeftward ? LEFTWARD : RIGHTWARD)
    }

    const { strandColors, strandNames, strandPlacements, strandScores } = readStrands(header.strands)

    layoutIdsInPlace(strandIds, header.strands)

    const map: ParsedMap = {
        geometry,
        strandIds,
        bandDirections,
        bandCount: count,
        strandColors,
        strandNames,
        strandPlacements,
        strandScores,
        strandCount: header.strands.length,
        content,
        centre
    }

    // The same `centre`, so the boxes and the bands cannot end up in two different frames —
    // which is the reason the document route hands `parseSegmentBoxes` the one its band
    // parser produced rather than re-deriving it.
    return { map, boxes: readSegmentBoxes(header.segments, centre) }
}

/**
 * Every segment box the render drew, in draw order, in the world frame the bands are in.
 *
 * The whole conversion is the frame change `parseSegmentBoxes` ends with, applied to numbers
 * that arrived as numbers: **no grammar, no tolerance and no second spelling of a
 * rectangle**. The nine redundancy relations that reader checks exist because five numbers
 * had to be recovered from twenty-six printed ones, and there is nothing here to recover.
 *
 * What is checked instead is that the five numbers are five numbers and that the box is one
 * this viewer can draw — the same conditions the layout refuses a box on where it is still
 * in scope, restated here because a reader that trusts them has no way to say it was wrong.
 * A segment that fails any of them refuses the whole payload, exactly as an unreadable
 * outline refuses the whole document: a silently absent box is a variant nobody would
 * notice was missing.
 */
function readSegmentBoxes(rows: SegmentRow[], centre: Point): SegmentBox[] {
    return rows.map(segment => {
        const box = segment.box

        if (null === box || 'object' !== typeof box) {
            throw new NonConformingTubeMap(
                `Segment ${String(segment.id)} carries no box; a box is the five numbers `
                + 'this viewer draws a segment from.'
            )
        }

        for (const edge of [ 'left', 'top', 'right', 'bottom', 'radius' ] as const) {
            if (false === Number.isFinite(box[edge])) {
                throw new NonConformingTubeMap(
                    `Segment ${String(segment.id)} has ${edge} ${String(box[edge])}, which is not a number.`
                )
            }
        }

        if (false === (box.radius > 0)) {
            throw new NonConformingTubeMap(
                `Segment ${String(segment.id)} has corner radius ${box.radius}; the radius must be positive.`
            )
        }

        // The corners alone are `2 · radius` across, so a box smaller than that in either
        // direction is not the rounded rectangle these five numbers claim. This and the
        // positive radius above are two refusals #151 did not enumerate, and they are here
        // for parity: `parseSegmentBoxes` makes both, so a box either reader would refuse
        // is refused by both. The server makes them a third time on the way out, where the
        // layout that produced the box is still in scope, which is what makes them
        // unreachable rather than merely unmet.
        if (box.right - box.left < 2 * box.radius || box.bottom - box.top < 2 * box.radius) {
            throw new NonConformingTubeMap(
                `Segment ${String(segment.id)} is ${box.right - box.left} by ${box.bottom - box.top}, `
                + `smaller than its radius ${box.radius} allows.`
            )
        }

        for (const field of [ 'fill', 'fillOpacity', 'stroke' ] as const) {
            if (SEGMENT_APPEARANCE[field] !== segment[field]) {
                throw new NonConformingTubeMap(
                    `Segment ${String(segment.id)} is drawn with ${field} `
                    + `"${String(segment[field])}", and this viewer draws segments with `
                    + `"${SEGMENT_APPEARANCE[field]}".`
                )
            }
        }

        return {
            id: String(segment.id),
            sequence: segment.sequence,
            x: box.left - centre.x,
            y: centre.y - box.top,
            width: box.right - box.left,
            height: box.bottom - box.top,
            radius: box.radius,
            stroke: readStrokeWidth(segment.strokeWidth, segment.id)
        }
    })
}

/**
 * A segment's stroke width, as a number of world units.
 *
 * The one appearance field that is a *dimension*, so it is read rather than matched — the
 * overlay lays a CSS border of exactly these units and does arithmetic with it. The payload
 * sends the document's own attribute value, unit and all (`"2px"`), which their spec said
 * was `2` until [#70](https://github.com/CAST-genomics/PangenomeAPI/issues/70); a reader
 * written from the spec as it stood would have made `NaN` of it and drawn a border of the
 * wrong width, silently, because CSS drops a length it cannot read rather than complaining.
 *
 * So a spelling this cannot turn into a number is refused, like every other malformed
 * field. `Number` rather than `parseFloat` for the same reason the rest of this file has no
 * regular expression in it: `parseFloat` reads a prefix and discards the rest, so `"2px2"`
 * and `"2 3"` would both come back as 2.
 *
 * **The unit is required, and a bare `"2"` is refused** — stricter than the format, which
 * promises only the attribute value verbatim. It is what refusal parity costs: the document
 * reader's grammar spells `stroke-width: 2px;` and refuses a document without the unit, so
 * accepting one here would make the band route draw a map the document route will not, on a
 * server that sends the two out of one render. The day the layout writes a unitless width
 * both readers should learn it together.
 */
function readStrokeWidth(spelling: string, id: string): number {
    const width = 'string' === typeof spelling && spelling.endsWith(PIXELS)
        ? Number(spelling.slice(0, spelling.length - PIXELS.length))
        : Number.NaN

    // `NaN > 0` is false, which is the whole of what an unreadable spelling has to reach:
    // one comparison refuses a width that is not a number, is not positive, or was never a
    // number of pixels at all.
    if (false === (width > 0)) {
        throw new NonConformingTubeMap(
            `Segment ${String(id)} has stroke width "${String(spelling)}", which is not a `
            + `positive number of ${PIXELS}.`
        )
    }

    return width
}

/** The header's own length, in bytes, from the four that precede it. */
function headerLength(bytes: Uint8Array): number {
    if (4 > bytes.byteLength) {
        throw new NonConformingTubeMap('The response is too short to be a band payload.')
    }

    return new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, true)
}

/**
 * The header, and every refusal that can be made from it alone.
 *
 * ADR `0005` names four conditions that survive the loss of a grammar: a `format` or
 * `version` this build does not know, a non-empty `reversals`, a strand table a `Uint16`
 * cannot address, and a body length disagreeing with the header. The last is checked by the
 * caller, which is where the body's size is known.
 *
 * **Thickness and opacity are checked with them**, which the ADR did not list until this
 * parser was written; it records why they earn a place beside the four.
 */
function readHeader(bytes: Uint8Array): BandPayloadHeader {
    const length = headerLength(bytes)

    if (4 + length > bytes.byteLength) {
        throw new NonConformingTubeMap(
            `The payload declares a ${length}-byte header and carries ${bytes.byteLength - 4} bytes after it.`
        )
    }

    let header: BandPayloadHeader

    try {
        header = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + length))) as BandPayloadHeader
    } catch {
        throw new NonConformingTubeMap('The payload\'s header is not JSON.')
    }

    if (FORMAT !== header?.format) {
        throw new NonConformingTubeMap(
            `The response says it is in "${String(header?.format)}" format, not "${FORMAT}".`
        )
    }

    // Guarded before anything reads into it. A JSON object with the right `format` and
    // `version` and no `band` key is not a payload this parser can refuse *later*: an
    // unguarded `header.band.thickness` throws a TypeError, which `describeFailure`
    // classifies `internal` rather than `undrawable` — a viewer fault dressed over a bad
    // response, and the opposite of ADR `0005`'s identical failure card.
    if (null === header.band || 'object' !== typeof header.band
        || false === Array.isArray(header.strands) || false === Array.isArray(header.segments)) {
        throw new NonConformingTubeMap(
            'The payload\'s header carries no band, strand and segment tables.'
        )
    }

    if (VERSION !== header.version) {
        throw new NonConformingTubeMap(
            `The response is band format version ${String(header.version)}; this viewer reads version ${VERSION}.`
        )
    }

    // `overlays` — the ruler and the per-segment labels — is deliberately *not* refused when
    // it is non-empty, and not drawn either. The document reader ignores them too: it slices
    // `g.track` and reads nothing outside it, so a document carrying a ruler draws the same
    // map there as here. Refusing them would break that parity in the direction of refusing
    // maps the other reader draws. Empty in every production response in any case, a real
    // subgraph carrying no reference offset to rule from.

    // A reversal — a strand doubling back — draws corners and vertical connectors, two
    // shapes outside the six-value grammar and not in the body at all. No production
    // response contains one, and drawing part of a map that has one is drawing the wrong
    // map (their #52).
    const reversals = (header.reversals?.corners?.length ?? 0) + (header.reversals?.connectors?.length ?? 0)

    if (0 !== reversals) {
        throw new NonConformingTubeMap(
            `The tube map draws ${reversals} reversal shapes, which this viewer cannot draw.`
        )
    }

    if (header.strands.length > MAX_STRAND_ID + 1) {
        throw new NonConformingTubeMap(
            `The tube map draws ${header.strands.length} strands, above the `
            + `${MAX_STRAND_ID + 1} this renderer can hold.`
        )
    }

    if (THICKNESS !== header.band.thickness) {
        throw new NonConformingTubeMap(
            `The payload's bands are ${String(header.band.thickness)} units tall; `
            + `every band in a tube map is ${THICKNESS}.`
        )
    }

    if (ALPHA !== header.band.alpha) {
        throw new NonConformingTubeMap(
            `The payload's bands are drawn at opacity ${String(header.band.alpha)}, not ${ALPHA}.`
        )
    }

    return header
}

/**
 * The frame, from the four numbers `viewBox` spells, through the same function the document
 * reader hands its four to.
 *
 * Split without a regular expression, which is not fastidiousness: the point of this path is
 * that no pattern runs over the response, and a `split(/[\s,]+/)` here would be one — small,
 * but the kind of thing that reappears once it is precedent.
 */
function frameOf(header: BandPayloadHeader): DocumentFrame {
    const parts = splitOnBlanksAndCommas(header.document?.viewBox ?? '')

    if (4 !== parts.length || false === parts.every(Number.isFinite)) {
        throw new NonConformingTubeMap(
            `The payload's viewBox reads "${String(header.document?.viewBox)}", which is not four numbers.`
        )
    }

    return documentFrame(parts[0], parts[1], parts[2], parts[3])
}

/** `"0 -170 27953.857 5775"` as four numbers. Space, tab, newline, carriage return and
 *  comma all separate, which is every spelling SVG allows in a `viewBox`. */
function splitOnBlanksAndCommas(text: string): number[] {
    const numbers: number[] = []
    let token = ''

    const flush = (): void => {
        if (0 !== token.length) {
            numbers.push(Number(token))
            token = ''
        }
    }

    for (const character of text) {
        if (' ' === character || ',' === character || '\t' === character
            || '\n' === character || '\r' === character) {
            flush()
        } else {
            token += character
        }
    }

    flush()

    return numbers
}

/**
 * The strand tables, indexed by the layout's own strand id.
 *
 * **A band's `strandIds` entry is a row index, and the row's `id` is a different number** —
 * the table is written in paint order, so row 0 of the 90 bp render is strand 463. The ids
 * are dense and unique, which is what a table indexed by id needs, but they are a
 * permutation of the rows rather than equal to them. ADR `0005` carries the correction and
 * why it was believed otherwise.
 *
 * Indexing by `id` is what makes the two `ParsedMap`s comparable: it is the document's
 * `trackID`, which is what the document parser indexes by. The translation from row to id
 * happens once, in `layoutIdsInPlace`.
 *
 * `color` is three whole channels: no `rgb(…)` to parse and no rounding to reproduce, which
 * is one of the two places the payload is *simpler* than the document rather than merely
 * smaller.
 */
function readStrands(rows: StrandRow[]): {
    strandColors: Uint8Array,
    strandNames: string[],
    strandPlacements: Array<Point | null>,
    strandScores: Array<string | null>
} {
    const strandColors = new Uint8Array(rows.length * 3)
    const strandNames = new Array<string>(rows.length)
    const strandPlacements = new Array<Point | null>(rows.length)
    const strandScores = new Array<string | null>(rows.length)
    const filled = new Uint8Array(rows.length)

    for (const strand of rows) {
        const id = strand.id

        // Dense from 0, no gaps and no repeats: what a table indexed by id needs, and what
        // the format promises. Checked rather than assumed — a repeat would quietly give two
        // strands one colour, and a gap would leave a strand with no name at all.
        if (false === Number.isInteger(id) || 0 > id || id >= rows.length) {
            throw new NonConformingTubeMap(
                `The payload's strand table numbers a strand ${String(id)}, and it has `
                + `${rows.length} strands to number from 0.`
            )
        }

        if (0 !== filled[id]) {
            throw new NonConformingTubeMap(
                `The payload's strand table carries two rows for strand ${id}.`
            )
        }

        filled[id] = 1
        strandColors[id * 3] = strand.color[0]
        strandColors[id * 3 + 1] = strand.color[1]
        strandColors[id * 3 + 2] = strand.color[2]
        strandNames[id] = strand.name
        strandPlacements[id] = readPlacement(strand)
        // Opaque, as the document's is, and carried verbatim. A row spelling it as a number
        // is not refused — that is a spelling of the same answer, and refusing a whole map
        // over a quoting difference is not what the refusal is for.
        strandScores[id] = null === strand.pclaiScore || undefined === strand.pclaiScore
            ? null
            : String(strand.pclaiScore)
    }

    return { strandColors, strandNames, strandPlacements, strandScores }
}

/**
 * Where a strand sits in the ancestry cloud, or `null` where the inference placed it
 * nowhere.
 *
 * **Absent is not the origin.** `null` is how the payload says there is no placement, and
 * zero would be a position — a plausible one, near the middle of the cloud. The two axes are
 * read together: half a coordinate is not a position, and a strand placed on one axis and
 * not the other is not a thing this data has.
 */
function readPlacement(strand: StrandRow): Point | null {
    if (null === strand.pclaiX || null === strand.pclaiY
        || undefined === strand.pclaiX || undefined === strand.pclaiY) {
        return null
    }

    if (false === Number.isFinite(strand.pclaiX) || false === Number.isFinite(strand.pclaiY)) {
        throw new NonConformingTubeMap(
            `Strand "${strand.name}" is placed at (${String(strand.pclaiX)}, ${String(strand.pclaiY)}), `
            + 'which is not a coordinate.'
        )
    }

    return { x: strand.pclaiX, y: strand.pclaiY }
}

/**
 * Every band's row index turned into the layout's strand id, in place.
 *
 * The one translation between the payload's way of naming a strand and the document's. In
 * place because the column is a view over the bytes that arrived — 44,795 of them at the
 * largest — and because the row index has no reader once this has run.
 *
 * A row index past the end of the table is the body disagreeing with the header, which is
 * the fourth of ADR `0005`'s conditions said about a column rather than about a length. Left
 * alone it would read downstream as a strand with no colour and no name.
 */
function layoutIdsInPlace(strandIds: Uint16Array, rows: StrandRow[]): void {
    for (let band = 0; band < strandIds.length; band += 1) {
        const row = strandIds[band]

        if (row >= rows.length) {
            throw new NonConformingTubeMap(
                `A band names strand row ${row}, and the payload's table has ${rows.length} rows.`
            )
        }

        strandIds[band] = rows[row].id
    }
}

/**
 * A column of the body as a typed array.
 *
 * **A view where the bytes allow it and a copy where they do not.** The format aligns the
 * body to four bytes from the *start of the response*, which is what a `fetch` hands over:
 * `new Uint8Array(await response.arrayBuffer())` has a `byteOffset` of 0. A `Buffer` from
 * `readFileSync` need not — Node pools small reads — and a `Float32Array` cannot be viewed
 * over an odd offset at all. Copying then is a handful of tests paying for themselves;
 * copying in the browser never happens.
 */
function columnStart(bytes: Uint8Array, bodyStart: number, column: BandColumn, bytesNeeded: number): number {
    const start = bodyStart + column.byteOffset

    // The header says a column's size twice — once as `byteLength` and once as the band
    // count it is a column of — and the two disagreeing is the header disagreeing with
    // itself, which is the same refusal as a body that disagrees with it.
    if (column.byteLength !== bytesNeeded) {
        throw new NonConformingTubeMap(
            `The payload declares a ${column.byteLength}-byte column where its band count `
            + `needs ${bytesNeeded}.`
        )
    }

    if (start + bytesNeeded > bytes.byteLength) {
        throw new NonConformingTubeMap(
            `The payload's body ends before its ${bytesNeeded}-byte column at ${column.byteOffset} does.`
        )
    }

    return start
}

function readFloat32(bytes: Uint8Array, bodyStart: number, column: BandColumn, length: number): Float32Array {
    const start = columnStart(bytes, bodyStart, column, length * 4)
    const at = bytes.byteOffset + start

    return 0 === at % 4
        ? new Float32Array(bytes.buffer, at, length)
        : new Float32Array(bytes.slice(start, start + length * 4).buffer)
}

function readUint16(bytes: Uint8Array, bodyStart: number, column: BandColumn, length: number): Uint16Array {
    const start = columnStart(bytes, bodyStart, column, length * 2)
    const at = bytes.byteOffset + start

    return 0 === at % 2
        ? new Uint16Array(bytes.buffer, at, length)
        : new Uint16Array(bytes.slice(start, start + length * 2).buffer)
}

function readUint8(bytes: Uint8Array, bodyStart: number, column: BandColumn, length: number): Uint8Array {
    const start = columnStart(bytes, bodyStart, column, length)

    return bytes.subarray(start, start + length)
}
