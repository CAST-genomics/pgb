import { describe, it, expect } from 'vitest'
import { parseDataset } from '../datasetParser.ts'
import { DatasetParseError } from '../datasetModel.ts'

// ── v3 fixture ──────────────────────────────────────────────────────

function makeV3({
    withHg38 = true,
    withAsm = true,
    hg38Coords = [-1.7, 0.2],
    asmCoords = [-2.1, 0.5],
    confidence = '998',
    take = 'yes',
} = {}) {
    const meta = {
        sequence_id: 'CM089203.1',
        path_strand: '+',
        node_strand: '>',
        start: 25000872,
        end: 25036770,
        take,
    }
    if (withHg38) {
        meta.pclai_hg38 = {
            pclai_coord_system: 'assembly',
            coordinates: hg38Coords,
            RGB: [0, 232, 179],
            confidence_score: confidence,
        }
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
                        metadata: [meta],
                    },
                ],
                duplicated_assembly: [],
                ogdf_coordinates: [{ x: 0, y: 0 }],
                assembly_metadata: { count: { total: 1 }, frequency: { total: 1 } },
                default_range: 'GRCh38#0#chr1:90-210',
            },
        },
        edge: [{ starting_node: '10+', ending_node: '10+' }],
        sequence: { '10+': 'ATCG' },
    }
}

// ── Legacy-format fixtures (used only as rejection cases) ────────────

function makeV1Shaped() {
    return {
        locus: 'chr1:100-200',
        node: {
            '1+': {
                name: '1+',
                length: 50,
                assembly: [],
                ogdf_coordinates: [{ x: 0, y: 0 }],
                pclai_coordinates: {
                    'GRCh38#0': { coordinates: [0.1, 0.2], RGB: [255, 128, 0] },
                },
            },
        },
    }
}

function makeV2Shaped() {
    // Shares the v3 top-level shape, but carries windowed `pclai` arrays in
    // node metadata instead of `pclai_hg38` / `pclai_asm`.
    return {
        queried_locus: 'GRCh38#0#chr1:100-200',
        node: {
            '10+': {
                name: '10+',
                ogdf_coordinates: [{ x: 0, y: 0 }],
                assembly: [
                    {
                        assembly_name: 'HG00597',
                        haplotype: '1',
                        metadata: [
                            {
                                take: 'yes',
                                pclai: [{ coordinates: [0.5, 0.7], RGB: [255, 100, 50] }],
                            },
                        ],
                    },
                ],
            },
        },
    }
}

// ── Format check ─────────────────────────────────────────────────────

describe('format check', () => {

    it('accepts a v3 dataset', () => {
        const result = parseDataset(makeV3())
        expect(result.formatVersion).toBe('v3')
    })

    it('rejects a v1-shaped dataset', () => {
        expect(() => parseDataset(makeV1Shaped()))
            .toThrow(/Unsupported dataset format/)
    })

    it('rejects a v2-shaped dataset', () => {
        expect(() => parseDataset(makeV2Shaped()))
            .toThrow(/Unsupported dataset format/)
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

// ── V3 normalization ─────────────────────────────────────────────────

describe('v3 normalization', () => {

    it('produces correct top-level shape', () => {
        const result = parseDataset(makeV3())
        expect(result.formatVersion).toBe('v3')
        expect(result.locus.queriedLocus).toBe('chr1:100-200')
        expect(result.locus.actualLocus).toBe('chr1:90-210')
        expect(result.assemblyIndex).toBeInstanceOf(Map)
        expect(result.nodes).toBeInstanceOf(Map)
        expect(result.sequences).toBeInstanceOf(Map)
        expect(Array.isArray(result.edges)).toBe(true)
    })

    it('strips genome prefix from locus', () => {
        const result = parseDataset(makeV3())
        expect(result.locus.queriedLocus).toBe('chr1:100-200')
        expect(result.locus.actualLocus).toBe('chr1:90-210')
    })

    it('normalizes the assembly index', () => {
        const result = parseDataset(makeV3())
        const entry = result.assemblyIndex.get('GRCh38:0')
        expect(entry).toEqual({ sequenceId: 'chr1', region: 'chr1:90-210' })
    })

    it('normalizes nodes and assemblies', () => {
        const result = parseDataset(makeV3())
        const node = result.nodes.get('10+')
        expect(node.name).toBe('10+')
        expect(node.length).toBe(120)
        expect(node.ogdfCoordinates).toEqual([{ x: 0, y: 0 }])
        expect(node.assemblies).toHaveLength(1)
        expect(node.assemblies[0].assemblyName).toBe('HG00597')
        expect(node.assemblies[0].haplotype).toBe('1')
        expect(node.assemblies[0].pathStrand).toBe('+')
        expect(node.assemblies[0].nodeStrand).toBe('>')
        expect(node.assemblies[0].start).toBe(25000872)
        expect(node.assemblies[0].end).toBe(25036770)
        expect(node.assemblies[0].take).toBe('yes')
    })

    it('normalizes edges and sequences', () => {
        const result = parseDataset(makeV3())
        expect(result.edges).toEqual([{ startingNode: '10+', endingNode: '10+' }])
        expect(result.sequences.get('10+')).toBe('ATCG')
    })

    it('normalizes assembly metadata', () => {
        const result = parseDataset(makeV3())
        const node = result.nodes.get('10+')
        expect(node.assemblyMetadata).toEqual({
            count: { total: 1 },
            frequency: { total: 1 },
        })
    })

    it('normalizes default_range', () => {
        const result = parseDataset(makeV3())
        expect(result.nodes.get('10+').defaultRange).toBe('GRCh38#0#chr1:90-210')
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

    it('skips pclai for assemblies where take is not yes', () => {
        const result = parseDataset(makeV3({ take: 'no' }))
        const node = result.nodes.get('10+')
        expect(node.pclaiCoordinatesBySystem.get('hg38').size).toBe(0)
        expect(node.pclaiCoordinatesBySystem.get('asm').size).toBe(0)
    })

    it('asymmetric coverage: only hg38 → asm map omits the entry', () => {
        const result = parseDataset(makeV3({ withAsm: false }))
        const node = result.nodes.get('10+')
        expect(node.pclaiCoordinatesBySystem.get('hg38').size).toBe(1)
        expect(node.pclaiCoordinatesBySystem.get('asm').size).toBe(0)
    })

    it('null confidence_score serializes to null', () => {
        const v3 = makeV3()
        delete v3.node['10+'].assembly[0].metadata[0].pclai_hg38.confidence_score
        const result = parseDataset(v3)
        const entries = result.nodes.get('10+')
            .pclaiCoordinatesBySystem.get('hg38').get('HG00597#1')
        expect(entries[0].confidenceScore).toBeNull()
    })

    it('normalizes duplicated_assembly', () => {
        const v3 = makeV3()
        v3.node['10+'].duplicated_assembly = [
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
                    },
                ],
            },
        ]
        const result = parseDataset(v3)
        const node = result.nodes.get('10+')
        expect(node.duplicatedAssemblies).toHaveLength(1)
        expect(node.duplicatedAssemblies[0].assemblyName).toBe('HG00408')
        expect(node.duplicatedAssemblies[0].take).toBe('no')
    })

    it('handles missing optional fields gracefully', () => {
        const v3 = makeV3()
        delete v3.node['10+'].assembly
        delete v3.sequence
        const result = parseDataset(v3)
        const node = result.nodes.get('10+')
        expect(node.assemblies).toEqual([])
        expect(result.sequences.size).toBe(0)
    })
})

// ── Validation ──────────────────────────────────────────────────────

describe('validation', () => {

    it('rejects missing node bag', () => {
        expect(() => parseDataset({ queried_locus: 'GRCh38#0#chr1:1-100' }))
            .toThrow(/Missing required field "node"/)
    })

    it('rejects empty node bag', () => {
        expect(() => parseDataset({ queried_locus: 'GRCh38#0#chr1:1-100', node: {} }))
            .toThrow(/Dataset contains no nodes/)
    })

    it('rejects a dataset with no locus fields', () => {
        expect(() => parseDataset({
            assembly: { 'GRCh38:0': { sequence_id: 'chr1', region: 'chr1:1-100' } },
            node: { 'n1': { ogdf_coordinates: [{ x: 0, y: 0 }] } },
        })).toThrow(/Missing required field "queried_locus" or "actual_locus"/)
    })

    it('rejects node missing ogdf_coordinates', () => {
        expect(() => parseDataset({
            queried_locus: 'GRCh38#0#chr1:1-100',
            node: { 'n1': { name: 'n1', length: 10 } },
        })).toThrow(/Missing required field "ogdf_coordinates"/)
    })

    it('rejects non-numeric ogdf x coordinate', () => {
        expect(() => parseDataset({
            queried_locus: 'GRCh38#0#chr1:1-100',
            node: { 'n1': { ogdf_coordinates: [{ x: 'bad', y: 0 }] } },
        })).toThrow(/Expected finite number for x/)
    })

    it('rejects non-numeric node length', () => {
        expect(() => parseDataset({
            queried_locus: 'GRCh38#0#chr1:1-100',
            node: { 'n1': { length: 'big', ogdf_coordinates: [{ x: 0, y: 0 }] } },
        })).toThrow(/Expected finite number for length/)
    })

    it('rejects edge missing starting_node', () => {
        expect(() => parseDataset({
            queried_locus: 'GRCh38#0#chr1:1-100',
            node: { 'n1': { ogdf_coordinates: [{ x: 0, y: 0 }] } },
            edge: [{ ending_node: 'n1' }],
        })).toThrow(/Missing required field "starting_node"/)
    })

    it('includes JSON path in error', () => {
        try {
            parseDataset({
                queried_locus: 'GRCh38#0#chr1:1-100',
                node: { 'n1': { ogdf_coordinates: [{ x: 0, y: 'bad' }] } },
            })
            expect.unreachable('should have thrown')
        } catch (e) {
            expect(e).toBeInstanceOf(DatasetParseError)
            expect(e.path).toBe('node.n1.ogdf_coordinates[0].y')
        }
    })
})

// ── Dataset index ───────────────────────────────────────────────────

describe('dataset index', () => {

    it('empty pclai → no bbox, absent set empty, flags off', () => {
        const result = parseDataset(makeV3({ withHg38: false, withAsm: false }))
        const idx = result.index
        expect(idx.pclaiBoundingBoxBySystem.size).toBe(0)
        expect(idx.pclaiCoordinateKeysBySystem.get('hg38').size).toBe(0)
        expect(idx.pclaiCoordinateKeysBySystem.get('asm').size).toBe(0)
        expect(idx.pclaiAbsentNodes.size).toBe(0)
        expect(idx.hasPclaiData).toBe(false)
    })

    it('computes per-system bbox and coordinate-key union', () => {
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

    it('asymmetric coverage: only hg38 → asm bbox omitted', () => {
        const result = parseDataset(makeV3({ withAsm: false }))
        const idx = result.index
        expect(idx.pclaiBoundingBoxBySystem.has('hg38')).toBe(true)
        expect(idx.pclaiBoundingBoxBySystem.has('asm')).toBe(false)
        expect(idx.pclaiCoordinateKeysBySystem.get('asm').size).toBe(0)
    })

    it('places nodes without pclai into the absent-node set', () => {
        const v3 = makeV3()
        // A second node with no PCLAI coordinates of any kind.
        v3.node['20+'] = {
            name: '20+',
            length: 30,
            assembly: [],
            duplicated_assembly: [],
            ogdf_coordinates: [{ x: 20, y: 10 }],
        }
        const result = parseDataset(v3)
        const idx = result.index
        expect(idx.pclaiAbsentNodes.has('20+')).toBe(true)
        expect(idx.pclaiAbsentNodes.has('10+')).toBe(false)
    })

    it('sums assemblyTotals from sex counts across nodes', () => {
        const v3 = makeV3()
        v3.node['10+'].assembly_metadata = {
            count: { sex: { male: 3, female: 5 } },
            frequency: {},
        }
        v3.node['20+'] = {
            name: '20+',
            length: 30,
            assembly: [],
            duplicated_assembly: [],
            ogdf_coordinates: [{ x: 20, y: 10 }],
            assembly_metadata: { count: { sex: { male: 1, female: 2 } }, frequency: {} },
        }
        const result = parseDataset(v3)
        expect(result.index.assemblyTotals.totalAssemblies).toBe(11)
        expect(result.index.hasAssemblyMetadata).toBe(true)
    })
})
