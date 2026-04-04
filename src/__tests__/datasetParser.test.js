import { describe, it, expect } from 'vitest'
import { parseDataset } from '../datasetParser.ts'
import { DatasetParseError } from '../datasetModel.ts'

// ── Minimal v1 fixture ──────────────────────────────────────────────

function makeV1(overrides = {}) {
    return {
        locus: 'chr1:100-200',
        node: {
            '1+': {
                name: '1+',
                length: 50,
                assembly: [
                    { assembly_name: 'GRCh38', haplotype: '0', sequence_id: 'chr1' },
                ],
                ogdf_coordinates: [{ x: 0, y: 0 }, { x: 10, y: 5 }],
                assembly_metadata: { count: { total: 1 }, frequency: { total: 1 } },
            },
            '2+': {
                name: '2+',
                length: 30,
                assembly: [],
                ogdf_coordinates: [{ x: 20, y: 10 }],
            },
        },
        edge: [
            { starting_node: '1+', ending_node: '2+' },
        ],
        sequence: { '1+': 'ATCG', '2+': 'GGCC' },
        ...overrides,
    }
}

// ── Minimal v2 fixture ──────────────────────────────────────────────

function makeV2(overrides = {}) {
    return {
        queried_locus: 'GRCh38#0#chr1:100-200',
        actual_locus: 'GRCh38#0#chr1:90-210',
        assembly: {
            'GRCh38:0': { sequence_id: 'chr1', region: 'chr1:90-210' },
        },
        node: {
            '10+': {
                name: '10+',
                length: 120,
                assembly: [
                    {
                        assembly_name: 'HG00597',
                        haplotype: '1',
                        metadata: [
                            {
                                sequence_id: 'CM085766.1',
                                path_strand: '+',
                                node_strand: '>',
                                start: 100,
                                end: 220,
                                take: 'yes',
                                pclai: [
                                    {
                                        coordinates: [0.5, 0.7],
                                        RGB: [255, 100, 50],
                                        start: 100,
                                        end: 220,
                                        percentage: 1,
                                    },
                                ],
                            },
                        ],
                    },
                ],
                duplicated_assembly: [],
                ogdf_coordinates: [{ x: 0, y: 0 }],
                assembly_metadata: { count: { total: 1 }, frequency: { total: 1 } },
                default_range: 'GRCh38#0#chr1:90-210',
            },
        },
        edge: [
            { starting_node: '10+', ending_node: '10+' },
        ],
        sequence: { '10+': 'ATCG' },
        ...overrides,
    }
}

// ── Format detection ────────────────────────────────────────────────

describe('format detection', () => {

    it('detects v1 by locus string', () => {
        const result = parseDataset(makeV1())
        expect(result.formatVersion).toBe('v1')
    })

    it('detects v2 by queried_locus', () => {
        const result = parseDataset(makeV2())
        expect(result.formatVersion).toBe('v2')
    })

    it('throws on unrecognisable input', () => {
        expect(() => parseDataset({ foo: 'bar' })).toThrow(DatasetParseError)
    })

    it('throws on null input', () => {
        expect(() => parseDataset(null)).toThrow(DatasetParseError)
    })

    it('throws on non-object input', () => {
        expect(() => parseDataset('hello')).toThrow(DatasetParseError)
    })
})

// ── V1 normalization ────────────────────────────────────────────────

describe('v1 normalization', () => {

    it('produces correct top-level shape', () => {
        const result = parseDataset(makeV1())
        expect(result.formatVersion).toBe('v1')
        expect(result.locus).toEqual({ queriedLocus: 'chr1:100-200', actualLocus: null })
        expect(result.assemblyIndex).toBeNull()
        expect(result.nodes).toBeInstanceOf(Map)
        expect(result.sequences).toBeInstanceOf(Map)
        expect(Array.isArray(result.edges)).toBe(true)
    })

    it('normalizes nodes', () => {
        const result = parseDataset(makeV1())
        expect(result.nodes.size).toBe(2)

        const n1 = result.nodes.get('1+')
        expect(n1.name).toBe('1+')
        expect(n1.length).toBe(50)
        expect(n1.ogdfCoordinates).toEqual([{ x: 0, y: 0 }, { x: 10, y: 5 }])
        expect(n1.assemblies).toHaveLength(1)
        expect(n1.assemblies[0].assemblyName).toBe('GRCh38')
        expect(n1.duplicatedAssemblies).toEqual([])
    })

    it('normalizes edges', () => {
        const result = parseDataset(makeV1())
        expect(result.edges).toEqual([
            { startingNode: '1+', endingNode: '2+' },
        ])
    })

    it('normalizes sequences', () => {
        const result = parseDataset(makeV1())
        expect(result.sequences.get('1+')).toBe('ATCG')
        expect(result.sequences.get('2+')).toBe('GGCC')
    })

    it('normalizes assembly metadata', () => {
        const result = parseDataset(makeV1())
        const n1 = result.nodes.get('1+')
        expect(n1.assemblyMetadata).toEqual({
            count: { total: 1 },
            frequency: { total: 1 },
        })
        const n2 = result.nodes.get('2+')
        expect(n2.assemblyMetadata).toBeNull()
    })

    it('normalizes v1 pclai_coordinates', () => {
        const v1 = makeV1()
        v1.node['1+'].pclai_coordinates = {
            'GRCh38#0': {
                coordinates: [0.1, 0.2],
                RGB: [255, 128, 0],
            },
        }
        const result = parseDataset(v1)
        const n1 = result.nodes.get('1+')
        expect(n1.pclaiCoordinates.size).toBe(1)
        const entries = n1.pclaiCoordinates.get('GRCh38#0')
        expect(entries).toHaveLength(1)
        expect(entries[0].coordinates).toEqual([0.1, 0.2])
        expect(entries[0].rgb).toEqual([255, 128, 0])
        expect(entries[0].percentage).toBe(1)
    })

    it('skips pclai entries with empty coordinates/RGB', () => {
        const v1 = makeV1()
        v1.node['1+'].pclai_coordinates = {
            'A#1': { coordinates: [], RGB: [] },
            'B#1': { coordinates: [0.5, 0.5], RGB: [100, 100, 100] },
        }
        const result = parseDataset(v1)
        const n1 = result.nodes.get('1+')
        // A#1 skipped (empty arrays fail the Array.isArray + length checks in normalizer)
        expect(n1.pclaiCoordinates.size).toBe(1)
        expect(n1.pclaiCoordinates.has('B#1')).toBe(true)
    })

    it('handles missing optional fields gracefully', () => {
        const v1 = makeV1()
        delete v1.node['1+'].assembly
        delete v1.sequence
        const result = parseDataset(v1)
        const n1 = result.nodes.get('1+')
        expect(n1.assemblies).toEqual([])
        expect(result.sequences.size).toBe(0)
    })
})

// ── V2 normalization ────────────────────────────────────────────────

describe('v2 normalization', () => {

    it('produces correct top-level shape', () => {
        const result = parseDataset(makeV2())
        expect(result.formatVersion).toBe('v2')
        expect(result.locus.queriedLocus).toBe('chr1:100-200')
        expect(result.locus.actualLocus).toBe('chr1:90-210')
        expect(result.assemblyIndex).toBeInstanceOf(Map)
    })

    it('strips genome prefix from locus', () => {
        const result = parseDataset(makeV2())
        expect(result.locus.queriedLocus).toBe('chr1:100-200')
        expect(result.locus.actualLocus).toBe('chr1:90-210')
    })

    it('normalizes assembly index', () => {
        const result = parseDataset(makeV2())
        const entry = result.assemblyIndex.get('GRCh38:0')
        expect(entry).toEqual({ sequenceId: 'chr1', region: 'chr1:90-210' })
    })

    it('normalizes v2 assemblies with metadata', () => {
        const result = parseDataset(makeV2())
        const node = result.nodes.get('10+')
        expect(node.assemblies).toHaveLength(1)
        expect(node.assemblies[0].assemblyName).toBe('HG00597')
        expect(node.assemblies[0].haplotype).toBe('1')
        expect(node.assemblies[0].pathStrand).toBe('+')
        expect(node.assemblies[0].nodeStrand).toBe('>')
        expect(node.assemblies[0].start).toBe(100)
        expect(node.assemblies[0].end).toBe(220)
        expect(node.assemblies[0].take).toBe('yes')
    })

    it('extracts pclai from v2 metadata windows', () => {
        const result = parseDataset(makeV2())
        const node = result.nodes.get('10+')
        expect(node.pclaiCoordinates.size).toBe(1)
        const entries = node.pclaiCoordinates.get('HG00597#1')
        expect(entries).toHaveLength(1)
        expect(entries[0].coordinates).toEqual([0.5, 0.7])
        expect(entries[0].rgb).toEqual([255, 100, 50])
        expect(entries[0].percentage).toBe(1)
    })

    it('skips pclai for assemblies where take is not yes', () => {
        const v2 = makeV2()
        v2.node['10+'].assembly[0].metadata[0].take = 'no'
        const result = parseDataset(v2)
        const node = result.nodes.get('10+')
        expect(node.pclaiCoordinates.size).toBe(0)
    })

    it('handles empty pclai array', () => {
        const v2 = makeV2()
        v2.node['10+'].assembly[0].metadata[0].pclai = []
        const result = parseDataset(v2)
        const node = result.nodes.get('10+')
        expect(node.pclaiCoordinates.size).toBe(0)
    })

    it('normalizes duplicated_assembly', () => {
        const v2 = makeV2()
        v2.node['10+'].duplicated_assembly = [
            {
                assembly_name: 'HG00408',
                haplotype: '2',
                metadata: [
                    {
                        sequence_id: 'SEQ1',
                        path_strand: '-',
                        node_strand: '<',
                        start: 50,
                        end: 100,
                        take: 'no',
                        pclai: [],
                    },
                ],
            },
        ]
        const result = parseDataset(v2)
        const node = result.nodes.get('10+')
        expect(node.duplicatedAssemblies).toHaveLength(1)
        expect(node.duplicatedAssemblies[0].assemblyName).toBe('HG00408')
        expect(node.duplicatedAssemblies[0].take).toBe('no')
    })

    it('normalizes default_range', () => {
        const result = parseDataset(makeV2())
        const node = result.nodes.get('10+')
        expect(node.defaultRange).toBe('GRCh38#0#chr1:90-210')
    })
})

// ── Validation ──────────────────────────────────────────────────────

describe('validation', () => {

    it('rejects v1 with missing locus', () => {
        const v1 = makeV1()
        delete v1.locus
        // Without locus, format detection falls back to v1 via node presence
        expect(() => parseDataset(v1)).toThrow(/Missing required field "locus"/)
    })

    it('rejects missing node bag', () => {
        expect(() => parseDataset({ locus: 'chr1:1-100' }))
            .toThrow(/Missing required field "node"/)
    })

    it('rejects empty node bag', () => {
        expect(() => parseDataset({ locus: 'chr1:1-100', node: {} }))
            .toThrow(/Dataset contains no nodes/)
    })

    it('rejects node missing ogdf_coordinates', () => {
        expect(() => parseDataset({
            locus: 'chr1:1-100',
            node: { 'n1': { name: 'n1', length: 10 } },
        })).toThrow(/Missing required field "ogdf_coordinates"/)
    })

    it('rejects non-numeric ogdf x coordinate', () => {
        expect(() => parseDataset({
            locus: 'chr1:1-100',
            node: { 'n1': { ogdf_coordinates: [{ x: 'bad', y: 0 }] } },
        })).toThrow(/Expected finite number for x/)
    })

    it('rejects non-numeric node length', () => {
        expect(() => parseDataset({
            locus: 'chr1:1-100',
            node: { 'n1': { length: 'big', ogdf_coordinates: [{ x: 0, y: 0 }] } },
        })).toThrow(/Expected finite number for length/)
    })

    it('rejects edge missing starting_node', () => {
        expect(() => parseDataset({
            locus: 'chr1:1-100',
            node: { 'n1': { ogdf_coordinates: [{ x: 0, y: 0 }] } },
            edge: [{ ending_node: 'n1' }],
        })).toThrow(/Missing required field "starting_node"/)
    })

    it('rejects v2 with no locus fields', () => {
        const v2 = makeV2()
        delete v2.queried_locus
        delete v2.actual_locus
        // Without locus markers, detection may fall to v1 fallback via node presence,
        // but the top-level assembly object triggers v2 detection
        expect(() => parseDataset(v2)).toThrow(/Missing required field/)
    })

    it('includes JSON path in error', () => {
        try {
            parseDataset({
                locus: 'chr1:1-100',
                node: { 'n1': { ogdf_coordinates: [{ x: 0, y: 'bad' }] } },
            })
            expect.unreachable('should have thrown')
        } catch (e) {
            expect(e).toBeInstanceOf(DatasetParseError)
            expect(e.path).toBe('node.n1.ogdf_coordinates[0].y')
        }
    })

    it('does not reject empty pclai entries (normalizer handles them)', () => {
        const v1 = makeV1()
        v1.node['1+'].pclai_coordinates = {
            'A#1': { coordinates: [], RGB: [] },
        }
        // Should not throw — empty PCLAI is valid
        const result = parseDataset(v1)
        expect(result.nodes.get('1+').pclaiCoordinates.size).toBe(0)
    })
})
