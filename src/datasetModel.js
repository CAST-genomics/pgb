/**
 * datasetModel.js — Canonical domain model for PGB datasets.
 *
 * Raw JSON from CiCi's API (v1 or v2) is normalized into this shape by
 * datasetParser.js.  Every downstream consumer receives a DatasetModel
 * instead of raw JSON.
 */

// ── Error class ──────────────────────────────────────────────────────

export class DatasetParseError extends Error {
    /**
     * @param {string} message  Human-readable description
     * @param {string} [path]   JSON path to the offending field (e.g. "node.5504+.ogdf_coordinates")
     */
    constructor(message, path) {
        super(path ? `${message} (at ${path})` : message);
        this.name = 'DatasetParseError';
        this.path = path ?? null;
    }
}

// ── JSDoc typedefs ───────────────────────────────────────────────────

/**
 * @typedef {Object} PclaiEntry
 * @property {[number, number]}   coordinates  PCA coordinates
 * @property {[number, number, number]} rgb     RGB 0-255
 * @property {number|null}        start        Locus start (v2 window; null for v1)
 * @property {number|null}        end          Locus end   (v2 window; null for v1)
 * @property {number}             percentage   Fraction of node covered (1 for v1)
 */

/**
 * @typedef {Object} AssemblyEntry
 * @property {string}      assemblyName
 * @property {string}      haplotype
 * @property {string}      sequenceId
 * @property {string|null} pathStrand   (v2 only)
 * @property {string|null} nodeStrand   (v2 only)
 * @property {number|null} start        (v2 only)
 * @property {number|null} end          (v2 only)
 * @property {string|null} take         "yes"|"no" (v2 only)
 */

/**
 * @typedef {Object} NodeModel
 * @property {string}  name
 * @property {number}  length
 * @property {AssemblyEntry[]}  assemblies
 * @property {AssemblyEntry[]}  duplicatedAssemblies  (empty for v1)
 * @property {{ count: Object, frequency: Object }|null} assemblyMetadata
 * @property {Map<string, PclaiEntry[]>} pclaiCoordinates  coordKey → entries
 * @property {[number,number,number]|null} pclaiAveRgb
 * @property {Array<{x: number, y: number}>} ogdfCoordinates
 * @property {string|null} defaultRange
 */

/**
 * @typedef {Object} DatasetModel
 * @property {'v1'|'v2'}  formatVersion
 * @property {{ queriedLocus: string, actualLocus: string|null }} locus
 * @property {Map<string, { sequenceId: string, region: string }>|null} assemblyIndex
 * @property {Map<string, string>} sequences
 * @property {Map<string, NodeModel>} nodes
 * @property {Array<{ startingNode: string, endingNode: string }>} edges
 */
