/**
 * datasetParser.ts — Single parse point for PGB datasets.
 *
 * Accepts raw JSON in the v3 format, confirms the format, validates required
 * fields, and returns a normalised DatasetModel that every downstream
 * consumer can rely on.  Non-v3 datasets are rejected with a clear
 * DatasetParseError.
 */

import {
    DatasetParseError,
    PCLAI_COORD_SYSTEMS,
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

const UNSUPPORTED_FORMAT_MESSAGE =
    'Unsupported dataset format — only v3 datasets are supported';

// ── Public API ───────────────────────────────────────────────────────

export function parseDataset(json: unknown): DatasetModel {
    if (!json || typeof json !== 'object') {
        throw new DatasetParseError('Input is not a JSON object');
    }

    const raw = json as Record<string, unknown>;
    assertV3Format(raw);
    validateRawDataset(raw);

    return normalizeV3(raw);
}

// ── Format check ─────────────────────────────────────────────────────

/**
 * Confirm the input is a v3 dataset, throwing a clear error for older
 * (v1 / v2) formats.
 *
 * Detection rests on positive evidence only, so that a legitimate v3 file
 * with no PCLAI data is still accepted:
 *  - v1 files carry a top-level `locus` string and lack the v3 top-level
 *    shape (`queried_locus` / `actual_locus` / an `assembly` index object).
 *  - v2 files share the v3 top-level shape but carry windowed `pclai`
 *    arrays in node metadata instead of `pclai_hg38` / `pclai_asm`.
 */
function assertV3Format(json: Record<string, unknown>): void {
    const hasV3TopLevel =
        json.queried_locus || json.actual_locus ||
        (json.assembly && !Array.isArray(json.assembly) && typeof json.assembly === 'object');

    if (!hasV3TopLevel) {
        throw new DatasetParseError(UNSUPPORTED_FORMAT_MESSAGE);
    }

    const nodeBag = json.node as Record<string, Record<string, unknown>> | undefined;
    if (!nodeBag) return;

    for (const node of Object.values(nodeBag)) {
        const groups = [
            ...((node.assembly as Array<Record<string, unknown>>) || []),
            ...((node.duplicated_assembly as Array<Record<string, unknown>>) || []),
        ];
        for (const asm of groups) {
            const metas = (asm.metadata as Array<Record<string, unknown>>) || [];
            for (const meta of metas) {
                if (meta.pclai_hg38 || meta.pclai_asm) return; // definitive v3
                if (Array.isArray(meta.pclai)) {
                    throw new DatasetParseError(UNSUPPORTED_FORMAT_MESSAGE);
                }
            }
        }
    }
    // No PCLAI signal either way — structurally compatible with v3; accept.
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

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Strip genome prefix from v3 locus strings.
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

/**
 * Extract per-system PCLAI coordinates from a v3 metadata entry. v3 carries
 * a `pclai_hg38` / `pclai_asm` object per coordinate system.
 */
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

/**
 * Walk v3 assembly groups, building a flat AssemblyEntry[] and dispatching
 * each metadata entry to the PCLAI extractor.
 */
function normalizeV3Assemblies(
    assemblyArray: Array<Record<string, unknown>>,
    pclaiBySystem: Map<PclaiCoordSystem, Map<string, PclaiEntry[]>>,
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
                extractV3Pclai(meta, coordKey, pclaiBySystem);
            }
        }
    }

    return entries;
}

// ── V3 normalizer ────────────────────────────────────────────────────

function normalizeV3(json: Record<string, unknown>): DatasetModel {

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
        const assemblies = normalizeV3Assemblies(rawAssembly, pclaiCoordinatesBySystem);

        // Duplicated assemblies (multi-region mappings)
        const rawDup = (raw.duplicated_assembly || []) as Array<Record<string, unknown>>;
        const duplicatedAssemblies = normalizeV3Assemblies(rawDup, pclaiCoordinatesBySystem);

        // Assembly metadata — pass through as-is
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
        formatVersion: 'v3',
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
