/**
 * datasetParser.ts — Single parse point for PGB datasets.
 *
 * Accepts raw JSON (v1 or v2), detects the format, validates required
 * fields, and returns a normalised DatasetModel that every downstream
 * consumer can rely on.
 */

import {
    DatasetParseError,
    type FormatVersion,
    type DatasetModel,
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
        default:   throw new DatasetParseError(`Unknown format version: ${version}`);
    }
}

// ── Format detection ─────────────────────────────────────────────────

function detectFormat(json: Record<string, unknown>): FormatVersion {
    // v2 signals: queried_locus / actual_locus, or top-level assembly object
    if (json.queried_locus || json.actual_locus) return 'v2';

    // v2 also has top-level assembly as an object (not array)
    if (json.assembly && !Array.isArray(json.assembly) && typeof json.assembly === 'object') {
        // But be careful: v1 nodes also have an assembly *array* inside each node.
        // The top-level assembly in v2 is keyed by "name:hap" strings.
        return 'v2';
    }

    // v1 signals: locus is a plain string, node entries have pclai_coordinates dict
    if (typeof json.locus === 'string') return 'v1';

    // Fallback: if there are nodes, assume v1
    if (json.node && typeof json.node === 'object') return 'v1';

    throw new DatasetParseError('Unable to detect dataset format version');
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

        // PCLAI coordinates — v1 has a flat dict keyed by "assembly#haplotype"
        const pclaiCoordinates = new Map<string, PclaiEntry[]>();
        const pclaiDict = raw.pclai_coordinates as Record<string, Record<string, unknown>> | undefined;
        if (pclaiDict && typeof pclaiDict === 'object') {
            for (const [coordKey, entry] of Object.entries(pclaiDict)) {
                if (!entry || !Array.isArray(entry.coordinates) || entry.coordinates.length !== 2
                    || !Array.isArray(entry.RGB) || entry.RGB.length !== 3) continue;
                pclaiCoordinates.set(coordKey, [{
                    coordinates: entry.coordinates as [number, number],
                    rgb:         entry.RGB as [number, number, number],
                    start:       null,
                    end:         null,
                    percentage:  1,
                }]);
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
            pclaiCoordinates,
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
    };
}

// ── V2 normalizer ────────────────────────────────────────────────────

/**
 * Strip genome prefix from v2 locus strings.
 * "GRCh38#0#chr1:25240000-25460000" → "chr1:25240000-25460000"
 */
function stripGenomePrefix(locusString: string | null | undefined): string | null {
    if (!locusString) return null;
    const hashIdx = locusString.lastIndexOf('#');
    if (hashIdx >= 0) {
        const tail = locusString.slice(hashIdx + 1);
        // Only strip if what remains looks like a locus (starts with chr)
        if (/^chr/i.test(tail)) return tail;
    }
    return locusString;
}

/**
 * Normalize a v2 assembly array (either assembly or duplicated_assembly)
 * into flat AssemblyEntry[] and extract PCLAI coordinates.
 */
function normalizeV2Assemblies(
    assemblyArray: Array<Record<string, unknown>>,
    pclaiCoordinates: Map<string, PclaiEntry[]>,
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

            // Extract PCLAI windows from this metadata entry
            const rawPclai = meta.pclai;
            if (Array.isArray(rawPclai) && rawPclai.length > 0 && meta.take === 'yes') {
                const windows: PclaiEntry[] = (rawPclai as Array<Record<string, unknown>>)
                    .filter(w => Array.isArray(w.coordinates) && w.coordinates.length === 2
                        && Array.isArray(w.RGB) && w.RGB.length === 3)
                    .map(w => ({
                        coordinates: w.coordinates as [number, number],
                        rgb:         w.RGB as [number, number, number],
                        start:       (w.start as number) ?? null,
                        end:         (w.end as number) ?? null,
                        percentage:  (w.percentage as number) ?? 1,
                    }));

                if (windows.length > 0) {
                    // Accumulate — a coordKey may appear in multiple metadata entries
                    const existing = pclaiCoordinates.get(coordKey) || [];
                    pclaiCoordinates.set(coordKey, existing.concat(windows));
                }
            }
        }
    }

    return entries;
}

function normalizeV2(json: Record<string, unknown>): DatasetModel {

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

        // PCLAI coordinates are extracted during assembly normalization
        const pclaiCoordinates = new Map<string, PclaiEntry[]>();

        // Assemblies (unique mappings)
        const rawAssembly = (raw.assembly || []) as Array<Record<string, unknown>>;
        const assemblies = normalizeV2Assemblies(rawAssembly, pclaiCoordinates);

        // Duplicated assemblies (multi-region mappings)
        const rawDup = (raw.duplicated_assembly || []) as Array<Record<string, unknown>>;
        const duplicatedAssemblies = normalizeV2Assemblies(rawDup, pclaiCoordinates);

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
            pclaiCoordinates,
            pclaiAveRgb: null,  // v2 does not have pclai_ave_rgb at node level
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

    // -- Locus (strip genome prefix so downstream parseLocusString works) --
    const locus = {
        queriedLocus: stripGenomePrefix(json.queried_locus as string | null),
        actualLocus:  stripGenomePrefix(json.actual_locus as string | null),
    };

    return {
        formatVersion: 'v2',
        locus,
        assemblyIndex: assemblyIndex.size > 0 ? assemblyIndex : null,
        sequences,
        nodes,
        edges,
    };
}
