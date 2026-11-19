/**
 * Pure geometry for the annotation track: display modes, feature-row extent,
 * and the bp ↔ pixel ↔ track-param mapping.
 *
 * Drawing and hover must agree on one measured track width — if they don't,
 * genes drift off the nodes they correspond to and the bidirectional mapping
 * breaks. Both sides build their mapping from `trackGeometry` so they can't
 * diverge.
 */

export type DisplayMode = 'COLLAPSED' | 'SQUISHED' | 'EXPANDED'

export const DISPLAY_MODES: readonly DisplayMode[] = ['COLLAPSED', 'SQUISHED', 'EXPANDED']

export const DEFAULT_DISPLAY_MODE: DisplayMode = 'EXPANDED'

export const DISPLAY_MODE_LABELS: Record<DisplayMode, string> = {
    COLLAPSED: 'Collapsed',
    SQUISHED: 'Squished',
    EXPANDED: 'Expanded',
}

/** Row metrics of the vendored FeatureRenderer (margin, expanded/squished row heights). */
export interface RowMetrics {
    margin: number
    expandedRowHeight: number
    squishedRowHeight: number
}

interface RowedFeature {
    start: number
    end: number
    row?: number
}

/**
 * Number of feature rows needed to show every feature overlapping
 * [bpStart, bpEnd]. Rows are assigned upstream by the feature source's packer;
 * this only reads them. Independent of display mode.
 */
export function featureRowCount(features: RowedFeature[] | undefined, bpStart: number, bpEnd: number): number {
    if (!features || features.length === 0) return 0
    let maxRow = -1
    for (const f of features) {
        if (f.end < bpStart || f.start > bpEnd) continue
        const row = f.row ?? 0
        if (row > maxRow) maxRow = row
    }
    return maxRow + 1
}

/**
 * Height (css px) of the drawn annotation content. Never shorter than the
 * track viewport; taller only when the feature rows overflow it, in which case
 * the track scrolls.
 */
export function contentHeight(mode: DisplayMode, rowCount: number, viewportHeight: number, metrics: RowMetrics): number {
    if (mode === 'COLLAPSED' || rowCount <= 0) return viewportHeight
    const rowHeight = mode === 'SQUISHED' ? metrics.squishedRowHeight : metrics.expandedRowHeight
    return Math.max(viewportHeight, Math.ceil(metrics.margin + rowCount * rowHeight))
}

export interface TrackGeometry {
    readonly trackWidth: number
    readonly bpPerPixel: number
    pxFromBp(bp: number): number
    paramFromPx(px: number): number
    pxFromParam(param: number): number
}

/** The single bp ↔ pixel ↔ param mapping shared by drawing and hover. */
export function trackGeometry(bpStart: number, bpEnd: number, trackWidth: number): TrackGeometry {
    const width = Math.max(1, trackWidth)
    const bpLength = Math.max(1, bpEnd - bpStart)
    const bpPerPixel = bpLength / width
    return {
        trackWidth: width,
        bpPerPixel,
        pxFromBp: (bp: number) => (bp - bpStart) / bpPerPixel,
        paramFromPx: (px: number) => px / width,
        pxFromParam: (param: number) => param * width,
    }
}
