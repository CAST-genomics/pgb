/**
 * datasetModel.ts — Canonical domain model for PGB datasets.
 *
 * Raw JSON from CiCi's API (v1, v2, or v3) is normalized into this shape by
 * datasetParser.ts.  Every downstream consumer receives a DatasetModel
 * instead of raw JSON.
 */

// ── Format version ──────────────────────────────────────────────────

export type FormatVersion = 'v1' | 'v2' | 'v3';

// ── PCLAI coordinate systems ────────────────────────────────────────
//
// v3 datasets carry two coordinate systems per node, `hg38` and `asm`.
// v1/v2 datasets are tagged `hg38` (single-system).

export type PclaiCoordSystem = 'hg38' | 'asm';

export const PCLAI_COORD_SYSTEMS: ReadonlyArray<PclaiCoordSystem> = ['hg38', 'asm'];

// ── Domain interfaces ───────────────────────────────────────────────

export interface PclaiEntry {
    coordinates: [number, number];
    rgb: [number, number, number];
    start: number | null;
    end: number | null;
    percentage: number | null;
    confidenceScore: string | null;
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
    pclaiCoordinatesBySystem: Map<PclaiCoordSystem, Map<string, PclaiEntry[]>>;
    pclaiAveRgb: [number, number, number] | null;
    ogdfCoordinates: Array<{ x: number; y: number }>;
    defaultRange: string | null;
}

export interface PclaiBoundingBox {
    x: { min: number; max: number; centroid: number };
    y: { min: number; max: number; centroid: number };
}

export interface DatasetIndex {
    pclaiBoundingBoxBySystem: Map<PclaiCoordSystem, PclaiBoundingBox>;
    pclaiCoordinateKeysBySystem: Map<PclaiCoordSystem, Set<string>>;
    pclaiAbsentNodes: Set<string>;
    assemblyTotals: { totalAssemblies: number };
    hasPclaiData: boolean;
    hasAssemblyMetadata: boolean;
}

export interface DatasetModel {
    formatVersion: FormatVersion;
    locus: { queriedLocus: string | null; actualLocus: string | null };
    assemblyIndex: Map<string, { sequenceId: string; region: string }> | null;
    sequences: Map<string, string>;
    nodes: Map<string, NodeModel>;
    edges: Array<{ startingNode: string; endingNode: string }>;
    index: DatasetIndex;
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
