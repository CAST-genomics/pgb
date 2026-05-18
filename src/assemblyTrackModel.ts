/**
 * AssemblyTrackModel — authoritative data for the annotation track.
 *
 * Built once per assembly at ingest from:
 *   - the dataset's top-level `assembly` section (region start/end, sequence_id)
 *   - each node's per-assembly metadata (start, end, node_strand)
 *
 * The annotation track consumes this model directly. No cumulative-length
 * synthesis; every anchor is positioned by its own reference coordinates.
 *
 * "Anchor" = a per-node reference extent used for bp ↔ node mapping.
 * Reserved word "band" refers to the optional diagnostic painted overlay
 * (see AnnotationCanvas.renderBpBandOverlay).
 */

import type { DatasetModel, AssemblyEntry } from './datasetModel.js'

export interface AssemblyTrackAnchor {
    nodeId: string
    refStart: number
    refEnd: number
    nodeStrand: '+' | '-'
    lengthBp: number
}

export interface AssemblyTrackModel {
    assemblyKey: string
    sequenceId: string
    regionStart: number
    regionEnd: number
    anchors: AssemblyTrackAnchor[]
    walkNodeIds: Set<string>
}

function parseRegion(region: string): { start: number; end: number } | null {
    const m = region.match(/^(\d+)-(\d+)$/)
    if (!m) return null
    const start = parseInt(m[1], 10)
    const end = parseInt(m[2], 10)
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null
    return { start, end }
}

function normalizeStrand(s: string | null | undefined): '+' | '-' {
    return s === '-' ? '-' : '+'
}

/**
 * Build an AssemblyTrackModel for `assemblyKey` (triple form "name#hap#seqId").
 * Returns null if the assembly isn't in the dataset's assemblyIndex.
 */
export function buildAssemblyTrackModel(
    dataset: DatasetModel,
    assemblyKey: string,
    walkNodeIds: Set<string>,
): AssemblyTrackModel | null {

    if (!dataset.assemblyIndex) return null

    const [assemblyName, haplotype, sequenceIdFromKey] = assemblyKey.split('#')
    const indexKey = `${assemblyName}#${haplotype}`
    const entry = dataset.assemblyIndex.get(indexKey)
    if (!entry) return null

    const region = parseRegion(entry.region)
    if (!region) return null

    const sequenceId = entry.sequenceId || sequenceIdFromKey

    const anchors: AssemblyTrackAnchor[] = []

    const collect = (asms: AssemblyEntry[], nodeId: string) => {
        for (const a of asms) {
            if (a.assemblyName !== assemblyName) continue
            if (a.haplotype !== haplotype) continue
            if (a.sequenceId !== sequenceId) continue
            if (a.start === null || a.end === null) continue
            if (!Number.isFinite(a.start) || !Number.isFinite(a.end)) continue
            anchors.push({
                nodeId,
                refStart: a.start,
                refEnd: a.end,
                nodeStrand: normalizeStrand(a.nodeStrand),
                lengthBp: Math.max(0, a.end - a.start),
            })
        }
    }

    for (const [nodeId, node] of dataset.nodes) {
        collect(node.assemblies, nodeId)
        collect(node.duplicatedAssemblies, nodeId)
    }

    anchors.sort((a, b) => a.refStart - b.refStart)

    return {
        assemblyKey,
        sequenceId,
        regionStart: region.start,
        regionEnd: region.end,
        anchors,
        walkNodeIds,
    }
}
