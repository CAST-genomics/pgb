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

    it('normalizes v1 pclai_coordinates into hg38 system', () => {
        const v1 = makeV1()
        v1.node['1+'].pclai_coordinates = {
            'GRCh38#0': {
                coordinates: [0.1, 0.2],
                RGB: [255, 128, 0],
            },
        }
        const result = parseDataset(v1)
        const n1 = result.nodes.get('1+')
        const hg38 = n1.pclaiCoordinatesBySystem.get('hg38')
        expect(hg38.size).toBe(1)
        const entries = hg38.get('GRCh38#0')
        expect(entries).toHaveLength(1)
        expect(entries[0].coordinates).toEqual([0.1, 0.2])
        expect(entries[0].rgb).toEqual([255, 128, 0])
        expect(entries[0].percentage).toBe(1)
        expect(entries[0].confidenceScore).toBeNull()
        expect(n1.pclaiCoordinatesBySystem.get('asm').size).toBe(0)
    })

    it('skips pclai entries with empty coordinates/RGB', () => {
        const v1 = makeV1()
        v1.node['1+'].pclai_coordinates = {
            'A#1': { coordinates: [], RGB: [] },
            'B#1': { coordinates: [0.5, 0.5], RGB: [100, 100, 100] },
        }
        const result = parseDataset(v1)
        const n1 = result.nodes.get('1+')
        const hg38 = n1.pclaiCoordinatesBySystem.get('hg38')
        expect(hg38.size).toBe(1)
        expect(hg38.has('B#1')).toBe(true)
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

    it('extracts pclai from v2 metadata windows into hg38 system', () => {
        const result = parseDataset(makeV2())
        const node = result.nodes.get('10+')
        const hg38 = node.pclaiCoordinatesBySystem.get('hg38')
        expect(hg38.size).toBe(1)
        const entries = hg38.get('HG00597#1')
        expect(entries).toHaveLength(1)
        expect(entries[0].coordinates).toEqual([0.5, 0.7])
        expect(entries[0].rgb).toEqual([255, 100, 50])
        expect(entries[0].percentage).toBe(1)
        expect(node.pclaiCoordinatesBySystem.get('asm').size).toBe(0)
    })

    it('skips pclai for assemblies where take is not yes', () => {
        const v2 = makeV2()
        v2.node['10+'].assembly[0].metadata[0].take = 'no'
        const result = parseDataset(v2)
        const node = result.nodes.get('10+')
        expect(node.pclaiCoordinatesBySystem.get('hg38').size).toBe(0)
    })

    it('handles empty pclai array', () => {
        const v2 = makeV2()
        v2.node['10+'].assembly[0].metadata[0].pclai = []
        const result = parseDataset(v2)
        const node = result.nodes.get('10+')
        expect(node.pclaiCoordinatesBySystem.get('hg38').size).toBe(0)
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
        expect(result.nodes.get('1+').pclaiCoordinatesBySystem.get('hg38').size).toBe(0)
    })
})

// ── Dataset index ───────────────────────────────────────────────────

describe('dataset index', () => {

    it('v1: empty pclai → no bbox, absent set is empty, flags off', () => {
        const result = parseDataset(makeV1())
        const idx = result.index
        expect(idx.pclaiBoundingBoxBySystem.size).toBe(0)
        expect(idx.pclaiCoordinateKeysBySystem.get('hg38').size).toBe(0)
        expect(idx.pclaiCoordinateKeysBySystem.get('asm').size).toBe(0)
        expect(idx.pclaiAbsentNodes.size).toBe(0)
        expect(idx.hasPclaiData).toBe(false)
    })

    it('v1: computes bbox, coordinate-key union, and absent-node set', () => {
        const v1 = makeV1()
        v1.node['1+'].pclai_coordinates = {
            'A#1': { coordinates: [0.2, 0.4], RGB: [10, 20, 30] },
            'B#1': { coordinates: [0.8, 0.1], RGB: [40, 50, 60] },
        }
        // '2+' has no pclai — it should land in absentNodes
        const result = parseDataset(v1)
        const idx = result.index

        expect(idx.hasPclaiData).toBe(true)
        expect(Array.from(idx.pclaiCoordinateKeysBySystem.get('hg38')).sort()).toEqual(['A#1', 'B#1'])

        const bbox = idx.pclaiBoundingBoxBySystem.get('hg38')
        expect(bbox).toBeDefined()
        expect(bbox.x.min).toBeCloseTo(0.2)
        expect(bbox.x.max).toBeCloseTo(0.8)
        expect(bbox.x.centroid).toBeCloseTo(0.5)
        expect(bbox.y.min).toBeCloseTo(0.1)
        expect(bbox.y.max).toBeCloseTo(0.4)
        expect(bbox.y.centroid).toBeCloseTo(0.25)

        expect(idx.pclaiBoundingBoxBySystem.has('asm')).toBe(false)
        expect(idx.pclaiAbsentNodes.has('2+')).toBe(true)
        expect(idx.pclaiAbsentNodes.has('1+')).toBe(false)
    })

    it('v1: sums assemblyTotals from sex counts across nodes', () => {
        const v1 = makeV1()
        v1.node['1+'].assembly_metadata = {
            count: { sex: { male: 3, female: 5 } },
            frequency: {},
        }
        v1.node['2+'].assembly_metadata = {
            count: { sex: { male: 1, female: 2 } },
            frequency: {},
        }
        const result = parseDataset(v1)
        expect(result.index.assemblyTotals.totalAssemblies).toBe(11)
        expect(result.index.hasAssemblyMetadata).toBe(true)
    })

    it('v1: absent-node set is empty when no node has pclai', () => {
        const v1 = makeV1()
        // Neither node has pclai_coordinates
        const result = parseDataset(v1)
        expect(result.index.pclaiAbsentNodes.size).toBe(0)
        expect(result.index.hasPclaiData).toBe(false)
    })

    it('v2: extracts bbox and coordinate keys from nested pclai windows', () => {
        const result = parseDataset(makeV2())
        const idx = result.index

        expect(idx.hasPclaiData).toBe(true)
        expect(idx.pclaiCoordinateKeysBySystem.get('hg38').has('HG00597#1')).toBe(true)

        const bbox = idx.pclaiBoundingBoxBySystem.get('hg38')
        expect(bbox).toBeDefined()
        expect(bbox.x.min).toBeCloseTo(0.5)
        expect(bbox.x.max).toBeCloseTo(0.5)
        expect(bbox.y.min).toBeCloseTo(0.7)
        expect(bbox.y.max).toBeCloseTo(0.7)
    })
})

// ── V3 normalization ────────────────────────────────────────────────

function makeV3({ withAsm = true, hg38Coords = [-1.7, 0.2], asmCoords = [-2.1, 0.5], confidence = '998' } = {}) {
    const meta = {
        sequence_id: 'CM089203.1',
        path_strand: '+',
        node_strand: '>',
        start: 25000872,
        end: 25036770,
        take: 'yes',
        pclai_hg38: {
            pclai_coord_system: 'assembly',
            coordinates: hg38Coords,
            RGB: [0, 232, 179],
            confidence_score: confidence,
        },
    }
    if (withAsm) {
        meta.pclai_asm = {
            pclai_coord_system: 'GRCh38',
            coordinates: asmCoords,
            RGB: [10, 20, 30],
            confidence_score: confidence,
        }
    }
    return {
        queried_locus: 'GRCh38#0#chr1:100-200',
        actual_locus: 'GRCh38#0#chr1:100-200',
        assembly: { 'GRCh38:0': { sequence_id: 'chr1', region: 'chr1:100-200' } },
        node: {
            '10+': {
                name: '10+',
                length: 120,
                assembly: [
                    {
                        assembly_name: 'HG00597',
                        haplotype: '1',
                        metadata: [meta],
                    },
                ],
                duplicated_assembly: [],
                ogdf_coordinates: [{ x: 0, y: 0 }],
                assembly_metadata: { count: { total: 1 }, frequency: { total: 1 } },
                default_range: 'GRCh38#0#chr1:100-200',
            },
        },
        edge: [{ starting_node: '10+', ending_node: '10+' }],
        sequence: { '10+': 'ATCG' },
    }
}

describe('v3 normalization', () => {

    it('detects v3 by pclai_hg38 / pclai_asm presence', () => {
        const result = parseDataset(makeV3())
        expect(result.formatVersion).toBe('v3')
    })

    it('populates both coord systems from a v3 metadata entry', () => {
        const result = parseDataset(makeV3())
        const node = result.nodes.get('10+')

        const hg38 = node.pclaiCoordinatesBySystem.get('hg38')
        expect(hg38.size).toBe(1)
        const hg38Entries = hg38.get('HG00597#1')
        expect(hg38Entries[0].coordinates).toEqual([-1.7, 0.2])
        expect(hg38Entries[0].rgb).toEqual([0, 232, 179])
        expect(hg38Entries[0].percentage).toBeNull()
        expect(hg38Entries[0].start).toBeNull()
        expect(hg38Entries[0].end).toBeNull()
        expect(hg38Entries[0].confidenceScore).toBe('998')

        const asm = node.pclaiCoordinatesBySystem.get('asm')
        expect(asm.size).toBe(1)
        const asmEntries = asm.get('HG00597#1')
        expect(asmEntries[0].coordinates).toEqual([-2.1, 0.5])
        expect(asmEntries[0].rgb).toEqual([10, 20, 30])
        expect(asmEntries[0].confidenceScore).toBe('998')
    })

    it('per-system bounding boxes', () => {
        const result = parseDataset(makeV3())
        const idx = result.index

        expect(idx.hasPclaiData).toBe(true)

        const hg38 = idx.pclaiBoundingBoxBySystem.get('hg38')
        expect(hg38.x.min).toBeCloseTo(-1.7)
        expect(hg38.y.min).toBeCloseTo(0.2)

        const asm = idx.pclaiBoundingBoxBySystem.get('asm')
        expect(asm.x.min).toBeCloseTo(-2.1)
        expect(asm.y.min).toBeCloseTo(0.5)

        expect(idx.pclaiCoordinateKeysBySystem.get('hg38').has('HG00597#1')).toBe(true)
        expect(idx.pclaiCoordinateKeysBySystem.get('asm').has('HG00597#1')).toBe(true)
    })

    it('asymmetric coverage: only hg38 → asm map omits the entry', () => {
        const result = parseDataset(makeV3({ withAsm: false }))
        const node = result.nodes.get('10+')

        expect(node.pclaiCoordinatesBySystem.get('hg38').size).toBe(1)
        expect(node.pclaiCoordinatesBySystem.get('asm').size).toBe(0)

        const idx = result.index
        expect(idx.pclaiBoundingBoxBySystem.has('hg38')).toBe(true)
        expect(idx.pclaiBoundingBoxBySystem.has('asm')).toBe(false)
        expect(idx.pclaiCoordinateKeysBySystem.get('asm').size).toBe(0)
    })

    it('null confidence_score serializes to null', () => {
        const v3 = makeV3()
        delete v3.node['10+'].assembly[0].metadata[0].pclai_hg38.confidence_score
        const result = parseDataset(v3)
        const entries = result.nodes.get('10+').pclaiCoordinatesBySystem.get('hg38').get('HG00597#1')
        expect(entries[0].confidenceScore).toBeNull()
    })
})
