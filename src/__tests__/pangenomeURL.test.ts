/**
 * The tube map's URL builder and its eligibility gate.
 *
 * Both matter for reasons the code cannot state on its own, so they are pinned here:
 *
 *  - The three fixed query parameters do not mean what they are named
 *    (`docs/adr/0001-sequence-tube-map-panel.md`, issue #90). `pathnumoption`'s *presence*
 *    is load-bearing; `version` and `nodewidthoption` are the server's own defaults, but an
 *    unrecognised value for either is a 500. So the built URL is compared against a
 *    captured known-good URL, character for character, rather than parameter by parameter.
 *  - A node with no GRCh38 placement has no tube map, and the API will not say so — it
 *    answers an unknown `minigraphnode` with 200 and a plausible map of different data. The
 *    gate is the only thing standing between a researcher and that map, so all 15
 *    ineligible nodes in `cici.json` are named and checked individually.
 */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseDataset } from '../datasetParser.ts'
import type { DatasetModel, NodeModel } from '../datasetModel.ts'
import { buildSeqTubeMapURL, tubeMapTargetForNode } from '../pangenomeURL.ts'

const CICI_PATH = 'public/datasets/api-v3/cici.json'

function cici(): DatasetModel {
    return parseDataset(JSON.parse(readFileSync(CICI_PATH, 'utf8')))
}

function node(dataset: DatasetModel, name: string): NodeModel {
    const found = dataset.nodes.get(name)
    if (!found) throw new Error(`fixture is missing node ${name}`)
    return found
}

/**
 * The nodes of `cici.json` that carry no GRCh38 placement — read off the file, listed here
 * so that a change to either the fixture or the gate has to be looked at rather than
 * absorbed.
 */
const INELIGIBLE = [
    '354719+', '354720+', '470948+', '470949+', '493032+', '493033+', '519405+', '618382+',
    '626344+', '644132+', '644133+', '644134+', '652987+', '706338+', '750140+',
]

describe('buildSeqTubeMapURL', () => {

    /**
     * Captured from the spike's node table, which built it against the live server and
     * rendered the result. Everything about the shape of the URL is asserted through this
     * one string.
     */
    const KNOWN_GOOD_5504 =
        'https://pangenome-api.ucsd.edu:8000/seqtubemap' +
        '?chrom=chr1&start=25200904&end=25236799' +
        '&version=v2&pathnumoption=normal&nodewidthoption=compressed&minigraphnode=5504'

    it('reproduces the known-good URL for node 5504', () => {
        const url = buildSeqTubeMapURL({
            chrom: 'chr1', start: 25200904, end: 25236799, minigraphnode: '5504',
        })

        expect(url).toBe(KNOWN_GOOD_5504)
    })

    it('carries the three fixed parameters the server needs', () => {
        const params = new URL(buildSeqTubeMapURL({
            chrom: 'chr1', start: 1, end: 2, minigraphnode: '7',
        })).searchParams

        expect(params.get('pathnumoption')).toBe('normal')
        expect(params.get('version')).toBe('v2')
        expect(params.get('nodewidthoption')).toBe('compressed')
    })

    it('accepts a numeric minigraphnode', () => {
        expect(buildSeqTubeMapURL({ chrom: 'chr1', start: 25200904, end: 25236799, minigraphnode: 5504 }))
            .toBe(KNOWN_GOOD_5504)
    })
})

describe('tubeMapTargetForNode', () => {

    it('derives node 5504\'s interval from its GRCh38 placement', () => {
        expect(tubeMapTargetForNode(node(cici(), '5504+'))).toEqual({
            chrom: 'chr1', start: 25200904, end: 25236799, minigraphnode: '5504',
        })
    })

    it('builds the known-good URL end to end', () => {
        const target = tubeMapTargetForNode(node(cici(), '5519+'))

        expect(buildSeqTubeMapURL(target!)).toBe(
            'https://pangenome-api.ucsd.edu:8000/seqtubemap' +
            '?chrom=chr1&start=25331046&end=25331646' +
            '&version=v2&pathnumoption=normal&nodewidthoption=compressed&minigraphnode=5519',
        )
    })

    it('strips the orientation from the oriented node id', () => {
        for (const target of [...cici().nodes.values()].map(tubeMapTargetForNode)) {
            if (target) expect(target.minigraphnode).toMatch(/^\d+$/)
        }
    })

    it.each(INELIGIBLE)('returns null for %s, which has no GRCh38 placement', name => {
        expect(tubeMapTargetForNode(node(cici(), name))).toBeNull()
    })

    it('gates exactly the 15 ineligible nodes and no others', () => {
        const dataset = cici()
        const ineligible = [...dataset.nodes.values()]
            .filter(n => tubeMapTargetForNode(n) === null)
            .map(n => n.name)

        expect(dataset.nodes.size).toBe(45)
        expect(ineligible.sort()).toEqual([...INELIGIBLE].sort())
    })

    it('agrees with the node\'s default_range on every eligible node', () => {
        for (const n of cici().nodes.values()) {
            const target = tubeMapTargetForNode(n)
            if (!target) continue

            // "GRCh38#0#chr1:25200904-25236799"
            expect(n.defaultRange).toBe(
                `GRCh38#0#${target.chrom}:${target.start}-${target.end}`)
        }
    })

    it('returns null for a node with no assemblies and no default range', () => {
        expect(tubeMapTargetForNode({
            name: '5504+', length: 0, assemblies: [], duplicatedAssemblies: [],
            assemblyMetadata: null, pclaiCoordinatesBySystem: new Map(),
            ogdfCoordinates: [], defaultRange: null,
        })).toBeNull()
    })
})
