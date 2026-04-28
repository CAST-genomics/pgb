/**
 * datasetParser.ts — Single parse point for PGB datasets.
 *
 * Accepts raw JSON (v1, v2, or v3), detects the format, validates required
 * fields, and returns a normalised DatasetModel that every downstream
 * consumer can rely on.
 */

import {
    DatasetParseError,
    PCLAI_COORD_SYSTEMS,
    type FormatVersion,
    type PclaiCoordSystem,
    type DatasetModel,
    type DatasetIndex,
    type PclaiBoundingBox,
    type AssemblyEntry,
    type PclaiEntry,
    type AssemblyMetadata,
    type NodeModel,
} from './datasetModel.js';
import { validateRawDataset } from './datasetValidator.js';

// ── Public API ───────────────────────────────────────────────────────

export function parseDataset(json: unknown): DatasetModel {
    if (!json || typeof json !== 'object') {
        throw new DatasetParseError('Input is not a JSON object');
    }

    const raw = json as Record<string, unknown>;
    const version = detectFormat(raw);
    validateRawDataset(raw, version);

    switch (version) {
        case 'v1': return normalizeV1(raw);
        case 'v2': return normalizeV2(raw);
        case 'v3': return normalizeV3(raw);
        default:   throw new DatasetParseError(`Unknown format version: ${version}`);
    }
}

// ── Format detection ─────────────────────────────────────────────────

function detectFormat(json: Record<string, unknown>): FormatVersion {
    // v2/v3 share top-level shape (queried_locus / actual_locus or top-level
    // assembly object). Disambiguate by inspecting metadata entries: v3
    // replaces `pclai` array with `pclai_hg38` / `pclai_asm` siblings.
    const looksLikeV2OrV3 =
        json.queried_locus || json.actual_locus ||
        (json.assembly && !Array.isArray(json.assembly) && typeof json.assembly === 'object');

    if (looksLikeV2OrV3) {
        return detectV2OrV3(json);
    }

    // v1 signals: locus is a plain string, node entries have pclai_coordinates dict
    if (typeof json.locus === 'string') return 'v1';

    // Fallback: if there are nodes, assume v1
    if (json.node && typeof json.node === 'object') return 'v1';

    throw new DatasetParseError('Unable to detect dataset format version');
}

/**
 * Walk node metadata entries to decide v2 vs v3. Looking at one entry can
 * mis-detect (e.g. a `take === 'no'` entry with neither pclai field). Scan
 * until we find a definitive signal.
 */
function detectV2OrV3(json: Record<string, unknown>): FormatVersion {
    const nodeBag = json.node as Record<string, Record<string, unknown>> | undefined;
    if (!nodeBag) return 'v2';

    let sawV2Pclai = false;
    let sawV3Pclai = false;

    for (const node of Object.values(nodeBag)) {
        const groups = [
            ...((node.assembly as Array<Record<string, unknown>>) || []),
            ...((node.duplicated_assembly as Array<Record<string, unknown>>) || []),
        ];
        for (const asm of groups) {
            const metas = (asm.metadata as Array<Record<string, unknown>>) || [];
            for (const meta of metas) {
                if (meta.pclai_hg38 || meta.pclai_asm) sawV3Pclai = true;
                if (Array.isArray(meta.pclai)) sawV2Pclai = true;
                if (sawV3Pclai) return 'v3';
            }
        }
    }

    if (sawV3Pclai) return 'v3';
    if (sawV2Pclai) return 'v2';

    // No PCLAI signal anywhere — default to v2 (compatible top-level shape).
    return 'v2';
}

// ── Per-system PCLAI map helpers ─────────────────────────────────────

function emptyPclaiBySystem(): Map<PclaiCoordSystem, Map<string, PclaiEntry[]>> {
    const m = new Map<PclaiCoordSystem, Map<string, PclaiEntry[]>>();
    for (const sys of PCLAI_COORD_SYSTEMS) m.set(sys, new Map());
    return m;
}

function pushPclaiEntry(
    bySystem: Map<PclaiCoordSystem, Map<string, PclaiEntry[]>>,
    system: PclaiCoordSystem,
    coordKey: string,
    entry: PclaiEntry,
): void {
    const sysMap = bySystem.get(system)!;
    const existing = sysMap.get(coordKey);
    if (existing) existing.push(entry);
    else sysMap.set(coordKey, [entry]);
}

// ── V1 normalizer ────────────────────────────────────────────────────

function normalizeV1(json: Record<string, unknown>): DatasetModel {

    // -- Sequences --
    const sequences = new Map<string, string>();
    const seqBag = json.sequence as Record<string, unknown> | undefined;
    if (seqBag) {
        for (const [id, seq] of Object.entries(seqBag)) {
            sequences.set(String(id), String(seq ?? ''));
        }
    }

    // -- Nodes --
    const nodes = new Map<string, NodeModel>();
    const nodeBag = (json.node || {}) as Record<string, Record<string, unknown>>;

    for (const [key, raw] of Object.entries(nodeBag)) {
        const name = String(raw?.name ?? key);

        const rawLength = raw?.length;
        const length = (typeof rawLength === 'number' && Number.isFinite(rawLength))
            ? rawLength
            : (sequences.get(name)?.length ?? 0);

        // Assemblies
        const rawAssembly = (raw.assembly || []) as Array<Record<string, unknown>>;
        const assemblies: AssemblyEntry[] = rawAssembly.map(a => ({
            assemblyName: String(a.assembly_name ?? ''),
            haplotype:    String(a.haplotype ?? ''),
            sequenceId:   String(a.sequence_id ?? ''),
            pathStrand:   null,
            nodeStrand:   null,
            start:        null,
            end:          null,
            take:         null,
        }));

        // PCLAI coordinates — v1 has a flat dict keyed by "assembly#haplotype",
        // tagged into the 'hg38' system slot.
        const pclaiCoordinatesBySystem = emptyPclaiBySystem();
        const pclaiDict = raw.pclai_coordinates as Record<string, Record<string, unknown>> | undefined;
        if (pclaiDict && typeof pclaiDict === 'object') {
            for (const [coordKey, entry] of Object.entries(pclaiDict)) {
                if (!entry || !Array.isArray(entry.coordinates) || entry.coordinates.length !== 2
                    || !Array.isArray(entry.RGB) || entry.RGB.length !== 3) continue;
                pushPclaiEntry(pclaiCoordinatesBySystem, 'hg38', coordKey, {
                    coordinates:     entry.coordinates as [number, number],
                    rgb:             entry.RGB as [number, number, number],
                    start:           null,
                    end:             null,
                    percentage:      1,
                    confidenceScore: null,
                });
            }
        }

        // pclai_ave_rgb (some v1 files may have it)
        const rawAveRgb = raw.pclai_ave_rgb;
        const pclaiAveRgb: [number, number, number] | null =
            (Array.isArray(rawAveRgb) && rawAveRgb.length === 3)
                ? rawAveRgb as [number, number, number]
                : null;

        // Assembly metadata — pass through as-is
        const rawMeta = raw.assembly_metadata as Record<string, unknown> | undefined;
        const assemblyMetadata: AssemblyMetadata | null = rawMeta
            ? { count: (rawMeta.count || {}) as Record<string, unknown>, frequency: (rawMeta.frequency || {}) as Record<string, unknown> }
            : null;

        // OGDF coordinates
        const ogdfCoordinates = Array.isArray(raw.ogdf_coordinates)
            ? raw.ogdf_coordinates as Array<{ x: number; y: number }>
            : [];

        // Range
        const defaultRange = (raw.range ?? raw.default_range ?? null) as string | null;

        nodes.set(name, {
            name,
            length,
            assemblies,
            duplicatedAssemblies: [],
            assemblyMetadata,
            pclaiCoordinatesBySystem,
            pclaiAveRgb,
            ogdfCoordinates,
            defaultRange,
        });
    }

    // -- Edges --
    const rawEdges = (json.edge || []) as Array<Record<string, unknown>>;
    const edges = rawEdges.map(e => ({
        startingNode: String(e.starting_node),
        endingNode:   String(e.ending_node),
    }));

    // -- Locus --
    const locus = {
        queriedLocus: (json.locus as string) ?? null,
        actualLocus:  null,
    };

    return {
        formatVersion: 'v1',
        locus,
        assemblyIndex: null,
        sequences,
        nodes,
        edges,
        index: buildDatasetIndex(nodes),
    };
}

// ── V2 / V3 shared helpers ───────────────────────────────────────────

/**
 * Strip genome prefix from v2/v3 locus strings.
 * "GRCh38#0#chr1:25240000-25460000" → "chr1:25240000-25460000"
 */
function stripGenomePrefix(locusString: string | null | undefined): string | null {
    if (!locusString) return null;
    const hashIdx = locusString.lastIndexOf('#');
    if (hashIdx >= 0) {
        const tail = locusString.slice(hashIdx + 1);
        if (/^chr/i.test(tail)) return tail;
    }
    return locusString;
}

type MetaPclaiExtractor = (
    meta: Record<string, unknown>,
    coordKey: string,
    bySystem: Map<PclaiCoordSystem, Map<string, PclaiEntry[]>>,
) => void;

/**
 * Walk v2/v3 assembly groups, building flat AssemblyEntry[] and dispatching
 * each metadata entry to the format-specific PCLAI extractor.
 */
function normalizeV2StyleAssemblies(
    assemblyArray: Array<Record<string, unknown>>,
    pclaiBySystem: Map<PclaiCoordSystem, Map<string, PclaiEntry[]>>,
    extractPclai: MetaPclaiExtractor,
): AssemblyEntry[] {
    const entries: AssemblyEntry[] = [];

    for (const asm of assemblyArray) {
        const assemblyName = String(asm.assembly_name ?? '');
        const haplotype    = String(asm.haplotype ?? '');
        const coordKey     = `${assemblyName}#${haplotype}`;

        const metadataArray = (asm.metadata || []) as Array<Record<string, unknown>>;
        for (const meta of metadataArray) {
            entries.push({
                assemblyName,
                haplotype,
                sequenceId:  String(meta.sequence_id ?? ''),
                pathStrand:  (meta.path_strand as string) ?? null,
                nodeStrand:  (meta.node_strand as string) ?? null,
                start:       (meta.start as number) ?? null,
                end:         (meta.end as number) ?? null,
                take:        (meta.take as string) ?? null,
            });

            if (meta.take === 'yes') {
                extractPclai(meta, coordKey, pclaiBySystem);
            }
        }
    }

    return entries;
}

// ── V2 normalizer ────────────────────────────────────────────────────

function extractV2Pclai(
    meta: Record<string, unknown>,
    coordKey: string,
    bySystem: Map<PclaiCoordSystem, Map<string, PclaiEntry[]>>,
): void {
    const rawPclai = meta.pclai;
    if (!Array.isArray(rawPclai) || rawPclai.length === 0) return;

    for (const w of rawPclai as Array<Record<string, unknown>>) {
        if (!Array.isArray(w.coordinates) || w.coordinates.length !== 2) continue;
        if (!Array.isArray(w.RGB) || w.RGB.length !== 3) continue;
        pushPclaiEntry(bySystem, 'hg38', coordKey, {
            coordinates:     w.coordinates as [number, number],
            rgb:             w.RGB as [number, number, number],
            start:           (w.start as number) ?? null,
            end:             (w.end as number) ?? null,
            percentage:      (w.percentage as number) ?? 1,
            confidenceScore: null,
        });
    }
}

function normalizeV2(json: Record<string, unknown>): DatasetModel {
    return normalizeV2Style(json, 'v2', extractV2Pclai);
}

// ── V3 normalizer ────────────────────────────────────────────────────

function extractV3Pclai(
    meta: Record<string, unknown>,
    coordKey: string,
    bySystem: Map<PclaiCoordSystem, Map<string, PclaiEntry[]>>,
): void {
    for (const system of PCLAI_COORD_SYSTEMS) {
        const raw = meta[`pclai_${system}`] as Record<string, unknown> | undefined;
        if (!raw) continue;
        if (!Array.isArray(raw.coordinates) || raw.coordinates.length !== 2) continue;
        if (!Array.isArray(raw.RGB) || raw.RGB.length !== 3) continue;

        const confRaw = raw.confidence_score;
        const confidenceScore =
            confRaw === undefined || confRaw === null ? null : (String(confRaw) || null);

        pushPclaiEntry(bySystem, system, coordKey, {
            coordinates:     raw.coordinates as [number, number],
            rgb:             raw.RGB as [number, number, number],
            start:           null,
            end:             null,
            percentage:      null,
            confidenceScore,
        });
    }
}

function normalizeV3(json: Record<string, unknown>): DatasetModel {
    return normalizeV2Style(json, 'v3', extractV3Pclai);
}

// ── V2/V3 shared body ────────────────────────────────────────────────

function normalizeV2Style(
    json: Record<string, unknown>,
    formatVersion: FormatVersion,
    extractPclai: MetaPclaiExtractor,
): DatasetModel {

    // -- Sequences --
    const sequences = new Map<string, string>();
    const seqBag = json.sequence as Record<string, unknown> | undefined;
    if (seqBag) {
        for (const [id, seq] of Object.entries(seqBag)) {
            sequences.set(String(id), String(seq ?? ''));
        }
    }

    // -- Top-level assembly index --
    const assemblyIndex = new Map<string, { sequenceId: string; region: string }>();
    const asmBag = json.assembly as Record<string, Record<string, unknown>> | undefined;
    if (asmBag && typeof asmBag === 'object') {
        for (const [key, val] of Object.entries(asmBag)) {
            assemblyIndex.set(key, {
                sequenceId: String(val.sequence_id ?? ''),
                region:     String(val.region ?? ''),
            });
        }
    }

    // -- Nodes --
    const nodes = new Map<string, NodeModel>();
    const nodeBag = (json.node || {}) as Record<string, Record<string, unknown>>;

    for (const [key, raw] of Object.entries(nodeBag)) {
        const name = String(raw?.name ?? key);

        const rawLength = raw?.length;
        const length = (typeof rawLength === 'number' && Number.isFinite(rawLength))
            ? rawLength
            : (sequences.get(name)?.length ?? 0);

        const pclaiCoordinatesBySystem = emptyPclaiBySystem();

        // Assemblies (unique mappings)
        const rawAssembly = (raw.assembly || []) as Array<Record<string, unknown>>;
        const assemblies = normalizeV2StyleAssemblies(rawAssembly, pclaiCoordinatesBySystem, extractPclai);

        // Duplicated assemblies (multi-region mappings)
        const rawDup = (raw.duplicated_assembly || []) as Array<Record<string, unknown>>;
        const duplicatedAssemblies = normalizeV2StyleAssemblies(rawDup, pclaiCoordinatesBySystem, extractPclai);

        // Assembly metadata — pass through as-is (unchanged between formats)
        const rawMeta = raw.assembly_metadata as Record<string, unknown> | undefined;
        const assemblyMetadata: AssemblyMetadata | null = rawMeta
            ? { count: (rawMeta.count || {}) as Record<string, unknown>, frequency: (rawMeta.frequency || {}) as Record<string, unknown> }
            : null;

        // OGDF coordinates
        const ogdfCoordinates = Array.isArray(raw.ogdf_coordinates)
            ? raw.ogdf_coordinates as Array<{ x: number; y: number }>
            : [];

        // Default range
        const defaultRange = (raw.default_range as string) ?? null;

        nodes.set(name, {
            name,
            length,
            assemblies,
            duplicatedAssemblies,
            assemblyMetadata,
            pclaiCoordinatesBySystem,
            pclaiAveRgb: null,
            ogdfCoordinates,
            defaultRange,
        });
    }

    // -- Edges --
    const rawEdges = (json.edge || []) as Array<Record<string, unknown>>;
    const edges = rawEdges.map(e => ({
        startingNode: String(e.starting_node),
        endingNode:   String(e.ending_node),
    }));

    // -- Locus --
    const locus = {
        queriedLocus: stripGenomePrefix(json.queried_locus as string | null),
        actualLocus:  stripGenomePrefix(json.actual_locus as string | null),
    };

    return {
        formatVersion,
        locus,
        assemblyIndex: assemblyIndex.size > 0 ? assemblyIndex : null,
        sequences,
        nodes,
        edges,
        index: buildDatasetIndex(nodes),
    };
}

// ── Dataset index ────────────────────────────────────────────────────

function buildDatasetIndex(nodes: Map<string, NodeModel>): DatasetIndex {
    const pclaiCoordinateKeysBySystem = new Map<PclaiCoordSystem, Set<string>>();
    const pclaiBoundingBoxBySystem    = new Map<PclaiCoordSystem, PclaiBoundingBox>();
    const pclaiAbsentNodes            = new Set<string>();
    const nodesWithPclai              = new Set<string>();

    let totalAssemblies = 0;
    let hasAssemblyMetadata = false;

    // Per-system accumulators
    const sysState = new Map<PclaiCoordSystem, {
        keys: Set<string>;
        minX: number; maxX: number;
        minY: number; maxY: number;
        sawAny: boolean;
    }>();
    for (const sys of PCLAI_COORD_SYSTEMS) {
        sysState.set(sys, {
            keys: new Set<string>(),
            minX: Infinity, maxX: -Infinity,
            minY: Infinity, maxY: -Infinity,
            sawAny: false,
        });
    }

    for (const [nodeId, node] of nodes) {
        if (node.assemblyMetadata) {
            hasAssemblyMetadata = true;
            totalAssemblies += countAssembliesFromMetadata(node.assemblyMetadata);
        }

        let nodeHasValidPclai = false;
        for (const [system, sysMap] of node.pclaiCoordinatesBySystem) {
            const state = sysState.get(system)!;
            for (const [coordKey, entries] of sysMap) {
                const entry = entries[0];
                if (!entry || !Array.isArray(entry.coordinates) || entry.coordinates.length !== 2
                    || !Array.isArray(entry.rgb) || entry.rgb.length !== 3) continue;

                state.keys.add(coordKey);
                nodeHasValidPclai = true;

                const [x, y] = entry.coordinates;
                if (x < state.minX) state.minX = x;
                if (x > state.maxX) state.maxX = x;
                if (y < state.minY) state.minY = y;
                if (y > state.maxY) state.maxY = y;
                state.sawAny = true;
            }
        }

        if (nodeHasValidPclai) nodesWithPclai.add(nodeId);
    }

    for (const [system, state] of sysState) {
        pclaiCoordinateKeysBySystem.set(system, state.keys);
        if (state.sawAny) {
            pclaiBoundingBoxBySystem.set(system, {
                x: { min: state.minX, max: state.maxX, centroid: (state.minX + state.maxX) / 2 },
                y: { min: state.minY, max: state.maxY, centroid: (state.minY + state.maxY) / 2 },
            });
        }
    }

    if (nodesWithPclai.size > 0) {
        for (const nodeId of nodes.keys()) {
            if (!nodesWithPclai.has(nodeId)) pclaiAbsentNodes.add(nodeId);
        }
    }

    return {
        pclaiBoundingBoxBySystem,
        pclaiCoordinateKeysBySystem,
        pclaiAbsentNodes,
        assemblyTotals: { totalAssemblies },
        hasPclaiData: nodesWithPclai.size > 0,
        hasAssemblyMetadata,
    };
}

function countAssembliesFromMetadata(meta: AssemblyMetadata): number {
    const sex = (meta.count as Record<string, unknown>)?.sex as Record<string, number> | undefined;
    if (!sex) return 0;
    let sum = 0;
    for (const v of Object.values(sex)) {
        if (typeof v === 'number') sum += v;
    }
    return sum;
}
