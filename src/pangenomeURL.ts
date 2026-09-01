/**
 * URLs for the UCSD pangenome API, and the one question PGB must answer before it can
 * build one: does this node have a sequence tube map at all?
 *
 * Both functions here are pure and DOM-free. The tube map viewer's entire input surface is
 * `open(url)` (`docs/adr/0001-sequence-tube-map-panel.md`), so this module is where a
 * clicked node becomes that string, and the context menu (#92) is its only caller.
 */

import type { NodeModel } from './datasetModel.js'
import type { TubeMapEncoding } from './tubemap/tubeMapEncoding.ts'

/** The host that serves both `/json` (the dataset) and `/seqtubemap` (the map). */
const PANGENOME_API_ORIGIN = 'https://pangenome-api.ucsd.edu:8000'

/** The reference the tube map is addressed in. A node absent from it has no map. */
const REFERENCE_ASSEMBLY = 'GRCh38'

/** Everything `/seqtubemap` needs that varies from node to node. */
export interface SeqTubeMapTarget {
    chrom: string
    start: number
    end: number
    /** The bare minigraph node id — `"5519"`, never PGB's oriented `"5519+"`. */
    minigraphnode: string
}

/**
 * The `/seqtubemap` URL for one interval of one minigraph node.
 *
 * Three parameters are fixed, and none of them behaves the way its name suggests:
 *
 *  - `pathnumoption=normal` — load-bearing, but only its *presence* is. Drop it and the
 *    same request comes back with 46 strands instead of 369. Any value will do; this one
 *    is what the surveyed URLs used.
 *  - `version=v2` and `nodewidthoption=compressed` — already the server's defaults, so
 *    they change nothing when sent, and an *unrecognised* value for either is a 500. They
 *    are sent because a default that is not pinned is a default that can move.
 *
 * `format=bands` is a fourth, and it is the only one that varies: it asks for the band
 * payload rather than the SVG document. It is **appended last and only when asked for**, so
 * the document URL is character for character the string it has always been — the two
 * spellings differ by exactly that suffix, which is what `buildSeqTubeMapURL`'s tests pin.
 * Which one is asked for is never this function's to decide and never a probe's: the flag is
 * `TUBE_MAP_ENCODING`, its host reads it, and this stays a pure spelling of what it is
 * handed. `tubeMapEncoding.ts` records why a fallback is the wrong shape for this API.
 *
 * The parameter order is the one the spike's captured URLs used. Nothing on the server
 * depends on it; the tests compare whole strings, and matching them by eye is easier when
 * the order is stable.
 */
export function buildSeqTubeMapURL(
    { chrom, start, end, minigraphnode }: SeqTubeMapTarget,
    encoding: TubeMapEncoding = 'document'
): string {
    const params = new URLSearchParams({
        chrom,
        start: String(start),
        end: String(end),
        version: 'v2',
        pathnumoption: 'normal',
        nodewidthoption: 'compressed',
        minigraphnode,
    })

    if ('bands' === encoding) {
        params.set('format', 'bands')
    }

    return `${PANGENOME_API_ORIGIN}/seqtubemap?${params}`
}

/**
 * The tube map target for a node, or `null` when the node has no tube map.
 *
 * `null` is what disables the context menu item, and the gate is not optional: the API
 * answers an unknown `minigraphnode` with **200 and a plausible-looking map** — a fallback
 * 8-colour palette, no haplotype greying, no error. An ungated ineligible node would show
 * a map that looks correct and is of different data, which cannot be detected at request
 * time because the API will not tell us.
 *
 * The interval is the node's GRCh38 placement, taken from the `GRCh38` assembly entry, or
 * from `default_range` — `"GRCh38#0#chr1:25200904-25236799"` — when no such entry is
 * present. The two agree on every node of `public/datasets/api-v3/cici.json`, and a test
 * holds them to it.
 */
export function tubeMapTargetForNode(node: NodeModel): SeqTubeMapTarget | null {
    const minigraphnode = stripOrientation(node.name)
    if (!minigraphnode) return null

    const interval = referenceIntervalFromAssemblies(node) ?? referenceIntervalFromDefaultRange(node.defaultRange)
    if (!interval) return null

    return { ...interval, minigraphnode }
}

// ── Internals ────────────────────────────────────────────────────────

/** A node's placement on the reference: the target, less the node id. */
type ReferenceInterval = Omit<SeqTubeMapTarget, 'minigraphnode'>

/** PGB keys nodes by orientation — `"5519+"`; the API's `minigraphnode` takes `5519`. */
function stripOrientation(nodeName: string): string | null {
    const match = /^(\d+)[+-]?$/.exec(nodeName)
    return match ? match[1] : null
}

/**
 * Only `assemblies` — the unique mappings — is searched. A `duplicatedAssemblies` entry is
 * one of several regions the node maps to, so it names no single interval to ask for, and
 * this gate exists precisely to avoid asking a question whose wrong answer looks right.
 */
function referenceIntervalFromAssemblies(node: NodeModel): ReferenceInterval | null {
    for (const entry of node.assemblies) {
        if (entry.assemblyName !== REFERENCE_ASSEMBLY) continue
        if (!entry.sequenceId) continue
        if (typeof entry.start !== 'number' || typeof entry.end !== 'number') continue

        return { chrom: entry.sequenceId, start: entry.start, end: entry.end }
    }

    return null
}

/** `"GRCh38#0#chr1:25200904-25236799"` → the interval; anything else → `null`. */
function referenceIntervalFromDefaultRange(defaultRange: string | null): ReferenceInterval | null {
    if (!defaultRange) return null

    const match = /^([^#]+)#[^#]*#([^:]+):(\d+)-(\d+)$/.exec(defaultRange)
    if (!match) return null

    const [, assemblyName, chrom, start, end] = match
    if (assemblyName !== REFERENCE_ASSEMBLY) return null

    return { chrom, start: Number(start), end: Number(end) }
}
