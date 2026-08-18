/**
 * The tube map's URL builder and its eligibility gate.
 *
 * Both are checked against things the code cannot state on its own. The three fixed query
 * parameters do not behave the way their names read, so the built URL is compared against a
 * captured known-good URL character for character rather than parameter by parameter. And
 * the gate is the only thing standing between a researcher and a plausible map of different
 * data — `docs/adr/0001-sequence-tube-map-panel.md` §5 is why — so all 15 ineligible nodes
 * of `cici.json` are named and checked one at a time rather than counted.
 */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseDataset } from '../datasetParser.ts'
import type { AssemblyEntry, DatasetModel, NodeModel } from '../datasetModel.ts'
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

    /**
     * The two derivation paths, one at a time. `cici.json` cannot separate them — every one
     * of its 30 eligible nodes carries a GRCh38 assembly entry, so the fixture never
     * reaches the `default_range` parse on a node that has a map. These synthesise the
     * cases the fixture does not contain, which is the only way the fallback the module
     * documents is checked at all.
     */
    describe('on synthesised nodes', () => {

        function bareNode(fields: Partial<NodeModel>): NodeModel {
            return {
                name: '5504+', length: 0, assemblies: [], duplicatedAssemblies: [],
                assemblyMetadata: null, pclaiCoordinatesBySystem: new Map(),
                ogdfCoordinates: [], defaultRange: null,
                ...fields,
            }
        }

        function placement(fields: Partial<AssemblyEntry>): AssemblyEntry {
            return {
                assemblyName: 'GRCh38', haplotype: '0', sequenceId: 'chr1',
                pathStrand: '.', nodeStrand: '.', start: 100, end: 200, take: 'yes',
                ...fields,
            }
        }

        it('falls back to default_range when there is no GRCh38 assembly entry', () => {
            expect(tubeMapTargetForNode(bareNode({
                defaultRange: 'GRCh38#0#chr1:25200904-25236799',
            }))).toEqual({ chrom: 'chr1', start: 25200904, end: 25236799, minigraphnode: '5504' })
        })

        it('rejects a default_range on any other reference', () => {
            expect(tubeMapTargetForNode(bareNode({
                defaultRange: 'HG01433#2#JBHDSK010000040.1:25443422-25443533',
            }))).toBeNull()
        })

        it('derives the interval from the GRCh38 assembly entry alone', () => {
            expect(tubeMapTargetForNode(bareNode({
                assemblies: [placement({ start: 25200904, end: 25236799 })],
            }))).toEqual({ chrom: 'chr1', start: 25200904, end: 25236799, minigraphnode: '5504' })
        })

        it('ignores non-reference assembly entries', () => {
            expect(tubeMapTargetForNode(bareNode({
                assemblies: [placement({ assemblyName: 'HG00408', sequenceId: 'JBHDVK010000002.1' })],
            }))).toBeNull()
        })

        /**
         * A duplicated mapping is one of several regions the node occupies, so it names no
         * single interval to ask the server for. It must not open the gate.
         */
        it('does not accept a duplicated GRCh38 mapping as a placement', () => {
            expect(tubeMapTargetForNode(bareNode({
                duplicatedAssemblies: [placement({})],
            }))).toBeNull()
        })

        it('returns null with neither a placement nor a default range', () => {
            expect(tubeMapTargetForNode(bareNode({}))).toBeNull()
        })
    })
})
