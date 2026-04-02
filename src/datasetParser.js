/**
 * datasetParser.js — Single parse point for PGB datasets.
 *
 * Accepts raw JSON (v1 or v2), detects the format, validates required
 * fields, and returns a normalised DatasetModel that every downstream
 * consumer can rely on.
 *
 * @module datasetParser
 */

import { DatasetParseError } from './datasetModel.js';

// ── Public API ───────────────────────────────────────────────────────

/**
 * Parse raw JSON into a normalised DatasetModel.
 *
 * @param {Object} json  Raw JSON from CiCi API or a local file
 * @returns {import('./datasetModel.js').DatasetModel}
 * @throws {DatasetParseError}
 */
export function parseDataset(json) {
    if (!json || typeof json !== 'object') {
        throw new DatasetParseError('Input is not a JSON object');
    }

    const version = detectFormat(json);

    switch (version) {
        case 'v1': return normalizeV1(json);
        case 'v2': return normalizeV2(json);
        default:   throw new DatasetParseError(`Unknown format version: ${version}`);
    }
}

// ── Format detection ─────────────────────────────────────────────────

function detectFormat(json) {
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

/**
 * @param {Object} json
 * @returns {import('./datasetModel.js').DatasetModel}
 */
function normalizeV1(json) {

    // -- Sequences --
    const sequences = new Map();
    if (json.sequence) {
        for (const [id, seq] of Object.entries(json.sequence)) {
            sequences.set(String(id), String(seq ?? ''));
        }
    }

    // -- Nodes --
    const nodes = new Map();
    const nodeBag = json.node || {};

    for (const [key, raw] of Object.entries(nodeBag)) {
        const name = String(raw?.name ?? key);

        const length = Number.isFinite(raw?.length)
            ? Number(raw.length)
            : (sequences.get(name)?.length ?? 0);

        // Assemblies
        const assemblies = (raw.assembly || []).map(a => ({
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
        const pclaiCoordinates = new Map();
        const pclaiDict = raw.pclai_coordinates;
        if (pclaiDict && typeof pclaiDict === 'object') {
            for (const [coordKey, entry] of Object.entries(pclaiDict)) {
                if (!entry || !Array.isArray(entry.coordinates) || !Array.isArray(entry.RGB)) continue;
                pclaiCoordinates.set(coordKey, [{
                    coordinates: entry.coordinates,
                    rgb:         entry.RGB,
                    start:       null,
                    end:         null,
                    percentage:  1,
                }]);
            }
        }

        // pclai_ave_rgb (some v1 files may have it)
        const pclaiAveRgb = (Array.isArray(raw.pclai_ave_rgb) && raw.pclai_ave_rgb.length === 3)
            ? raw.pclai_ave_rgb
            : null;

        // Assembly metadata — pass through as-is
        const assemblyMetadata = raw.assembly_metadata
            ? { count: raw.assembly_metadata.count || {}, frequency: raw.assembly_metadata.frequency || {} }
            : null;

        // OGDF coordinates
        const ogdfCoordinates = Array.isArray(raw.ogdf_coordinates) ? raw.ogdf_coordinates : [];

        // Range
        const defaultRange = raw.range ?? raw.default_range ?? null;

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
    const edges = (json.edge || []).map(e => ({
        startingNode: String(e.starting_node),
        endingNode:   String(e.ending_node),
    }));

    // -- Locus --
    const locus = {
        queriedLocus: json.locus ?? null,
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
function stripGenomePrefix(locusString) {
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
 *
 * @param {Array} assemblyArray  Raw v2 assembly or duplicated_assembly array
 * @param {Map<string, Array>} pclaiCoordinates  Map to populate (mutated)
 * @returns {AssemblyEntry[]}
 */
function normalizeV2Assemblies(assemblyArray, pclaiCoordinates) {
    const entries = [];

    for (const asm of assemblyArray) {
        const assemblyName = String(asm.assembly_name ?? '');
        const haplotype    = String(asm.haplotype ?? '');
        const coordKey     = `${assemblyName}#${haplotype}`;

        for (const meta of (asm.metadata || [])) {
            entries.push({
                assemblyName,
                haplotype,
                sequenceId:  String(meta.sequence_id ?? ''),
                pathStrand:  meta.path_strand ?? null,
                nodeStrand:  meta.node_strand ?? null,
                start:       meta.start ?? null,
                end:         meta.end ?? null,
                take:        meta.take ?? null,
            });

            // Extract PCLAI windows from this metadata entry
            if (Array.isArray(meta.pclai) && meta.pclai.length > 0 && meta.take === 'yes') {
                const windows = meta.pclai
                    .filter(w => Array.isArray(w.coordinates) && Array.isArray(w.RGB))
                    .map(w => ({
                        coordinates: w.coordinates,
                        rgb:         w.RGB,
                        start:       w.start ?? null,
                        end:         w.end ?? null,
                        percentage:  w.percentage ?? 1,
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

/**
 * @param {Object} json
 * @returns {import('./datasetModel.js').DatasetModel}
 */
function normalizeV2(json) {

    // -- Sequences --
    const sequences = new Map();
    if (json.sequence) {
        for (const [id, seq] of Object.entries(json.sequence)) {
            sequences.set(String(id), String(seq ?? ''));
        }
    }

    // -- Top-level assembly index --
    const assemblyIndex = new Map();
    if (json.assembly && typeof json.assembly === 'object') {
        for (const [key, val] of Object.entries(json.assembly)) {
            assemblyIndex.set(key, {
                sequenceId: String(val.sequence_id ?? ''),
                region:     String(val.region ?? ''),
            });
        }
    }

    // -- Nodes --
    const nodes = new Map();
    const nodeBag = json.node || {};

    for (const [key, raw] of Object.entries(nodeBag)) {
        const name = String(raw?.name ?? key);

        const length = Number.isFinite(raw?.length)
            ? Number(raw.length)
            : (sequences.get(name)?.length ?? 0);

        // PCLAI coordinates are extracted during assembly normalization
        const pclaiCoordinates = new Map();

        // Assemblies (unique mappings)
        const assemblies = normalizeV2Assemblies(raw.assembly || [], pclaiCoordinates);

        // Duplicated assemblies (multi-region mappings)
        const duplicatedAssemblies = normalizeV2Assemblies(raw.duplicated_assembly || [], pclaiCoordinates);

        // Assembly metadata — pass through as-is (unchanged between formats)
        const assemblyMetadata = raw.assembly_metadata
            ? { count: raw.assembly_metadata.count || {}, frequency: raw.assembly_metadata.frequency || {} }
            : null;

        // OGDF coordinates
        const ogdfCoordinates = Array.isArray(raw.ogdf_coordinates) ? raw.ogdf_coordinates : [];

        // Default range
        const defaultRange = raw.default_range ?? null;

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
    const edges = (json.edge || []).map(e => ({
        startingNode: String(e.starting_node),
        endingNode:   String(e.ending_node),
    }));

    // -- Locus (strip genome prefix so downstream parseLocusString works) --
    const locus = {
        queriedLocus: stripGenomePrefix(json.queried_locus),
        actualLocus:  stripGenomePrefix(json.actual_locus),
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
