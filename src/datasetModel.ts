/**
 * datasetModel.ts — Canonical domain model for PGB datasets.
 *
 * Raw JSON from CiCi's API (v1 or v2) is normalized into this shape by
 * datasetParser.ts.  Every downstream consumer receives a DatasetModel
 * instead of raw JSON.
 */

// ── Format version ──────────────────────────────────────────────────

export type FormatVersion = 'v1' | 'v2';

// ── Domain interfaces ───────────────────────────────────────────────

export interface PclaiEntry {
    coordinates: [number, number];
    rgb: [number, number, number];
    start: number | null;
    end: number | null;
    percentage: number;
}

export interface AssemblyEntry {
    assemblyName: string;
    haplotype: string;
    sequenceId: string;
    pathStrand: string | null;
    nodeStrand: string | null;
    start: number | null;
    end: number | null;
    take: string | null;
}

export interface AssemblyMetadata {
    count: Record<string, unknown>;
    frequency: Record<string, unknown>;
}

export interface NodeModel {
    name: string;
    length: number;
    assemblies: AssemblyEntry[];
    duplicatedAssemblies: AssemblyEntry[];
    assemblyMetadata: AssemblyMetadata | null;
    pclaiCoordinates: Map<string, PclaiEntry[]>;
    pclaiAveRgb: [number, number, number] | null;
    ogdfCoordinates: Array<{ x: number; y: number }>;
    defaultRange: string | null;
}

export interface DatasetModel {
    formatVersion: FormatVersion;
    locus: { queriedLocus: string | null; actualLocus: string | null };
    assemblyIndex: Map<string, { sequenceId: string; region: string }> | null;
    sequences: Map<string, string>;
    nodes: Map<string, NodeModel>;
    edges: Array<{ startingNode: string; endingNode: string }>;
}

// ── Error class ─────────────────────────────────────────────────────

export class DatasetParseError extends Error {
    path: string | null;

    constructor(message: string, path?: string) {
        super(path ? `${message} (at ${path})` : message);
        this.name = 'DatasetParseError';
        this.path = path ?? null;
    }
}
