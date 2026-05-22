/**
 * datasetValidator.ts — Validates raw JSON datasets before normalization.
 *
 * Checks required fields, structural shapes, and value types for the v3
 * format.  Throws DatasetParseError with a JSON path on the first problem
 * found.
 */

import { DatasetParseError } from './datasetModel.js';

// ── Public API ───────────────────────────────────────────────────────

export function validateRawDataset(json: Record<string, unknown>): void {
    validateV3(json);
}

// ── Shared helpers ──────────────────────────────────────────────────

function requireField(obj: Record<string, unknown>, field: string, path: string): unknown {
    if (obj[field] === undefined || obj[field] === null) {
        throw new DatasetParseError(`Missing required field "${field}"`, path);
    }
    return obj[field];
}

function requireArray(value: unknown, path: string): asserts value is unknown[] {
    if (!Array.isArray(value)) {
        throw new DatasetParseError(`Expected array`, path);
    }
}

function requireObject(value: unknown, path: string): asserts value is Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new DatasetParseError(`Expected object`, path);
    }
}

function validateOgdfCoordinates(coords: unknown, path: string): void {
    requireArray(coords, path);
    for (let i = 0; i < coords.length; i++) {
        const pt = coords[i];
        const ptPath = `${path}[${i}]`;
        requireObject(pt, ptPath);
        if (typeof pt.x !== 'number' || !Number.isFinite(pt.x)) {
            throw new DatasetParseError(`Expected finite number for x`, `${ptPath}.x`);
        }
        if (typeof pt.y !== 'number' || !Number.isFinite(pt.y)) {
            throw new DatasetParseError(`Expected finite number for y`, `${ptPath}.y`);
        }
    }
}

function validateEdges(edges: unknown, path: string): void {
    requireArray(edges, path);
    for (let i = 0; i < edges.length; i++) {
        const e = edges[i];
        const ePath = `${path}[${i}]`;
        requireObject(e, ePath);
        requireField(e, 'starting_node', ePath);
        requireField(e, 'ending_node', ePath);
    }
}

// ── V3 validation ───────────────────────────────────────────────────

function validateV3(json: Record<string, unknown>): void {
    // Locus — at least one of queried_locus / actual_locus required
    if (!json.queried_locus && !json.actual_locus) {
        throw new DatasetParseError('Missing required field "queried_locus" or "actual_locus"', 'root');
    }

    // Node bag
    const nodeBag = requireField(json, 'node', 'root');
    requireObject(nodeBag, 'node');

    const nodeKeys = Object.keys(nodeBag);
    if (nodeKeys.length === 0) {
        throw new DatasetParseError('Dataset contains no nodes', 'node');
    }

    for (const key of nodeKeys) {
        const raw = nodeBag[key];
        const nPath = `node.${key}`;
        requireObject(raw, nPath);

        // ogdf_coordinates — required
        const ogdf = requireField(raw, 'ogdf_coordinates', nPath);
        validateOgdfCoordinates(ogdf, `${nPath}.ogdf_coordinates`);

        // length
        if (raw.length !== undefined) {
            if (typeof raw.length !== 'number' || !Number.isFinite(raw.length)) {
                throw new DatasetParseError(`Expected finite number for length`, `${nPath}.length`);
            }
        }

        // assembly — array of assembly groups
        if (raw.assembly !== undefined) {
            requireArray(raw.assembly, `${nPath}.assembly`);
            for (let ai = 0; ai < raw.assembly.length; ai++) {
                const asm = raw.assembly[ai];
                const aPath = `${nPath}.assembly[${ai}]`;
                requireObject(asm, aPath);
                requireField(asm, 'assembly_name', aPath);

                // metadata array
                if (asm.metadata !== undefined) {
                    requireArray(asm.metadata, `${aPath}.metadata`);
                    for (let mi = 0; mi < asm.metadata.length; mi++) {
                        const meta = asm.metadata[mi];
                        const mPath = `${aPath}.metadata[${mi}]`;
                        requireObject(meta, mPath);

                        // pclai_hg38 / pclai_asm — entirely optional; malformed
                        // entries are silently skipped by the normalizer.
                    }
                }
            }
        }

        // duplicated_assembly — same shape as assembly
        if (raw.duplicated_assembly !== undefined) {
            requireArray(raw.duplicated_assembly, `${nPath}.duplicated_assembly`);
            // Structural validation identical to assembly — reuse inline
            for (let ai = 0; ai < raw.duplicated_assembly.length; ai++) {
                const asm = raw.duplicated_assembly[ai];
                const aPath = `${nPath}.duplicated_assembly[${ai}]`;
                requireObject(asm, aPath);
                requireField(asm, 'assembly_name', aPath);
            }
        }
    }

    // Edges
    if (json.edge !== undefined) {
        validateEdges(json.edge, 'edge');
    }

    // Top-level assembly index — optional object
    if (json.assembly !== undefined) {
        requireObject(json.assembly, 'assembly');
    }
}
