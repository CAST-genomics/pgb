/**
 * Where a haplotype's PCLAI coordinate lands in the inset. Pure, DOM-free, and the one
 * place two measured facts about the ancestry colour ramp are written down.
 *
 * ## The ramp's domain is the reference cloud's extent
 *
 * x ∈ [−1.813, 0.786], y ∈ [−1.424, 1.509]. Established by decoding
 * `public/images/pca-chart-background.png` and sampling it at all 3,122 points of
 * `public/datasets/hprc-reference-pca.tsv`: under this mapping the mean RGB distance
 * between the ramp and each point's *own* colour is **13.4** (median 9.0). The ramp is a
 * **legend, not decoration**, and this is its axis calibration.
 *
 * ## y increases downward
 *
 * The same test with y flipped gives a mean distance of **174.3** (median 178.9). So the
 * un-flipped projection is correct rather than the latent SVG-shaped bug it resembles, and
 * `PclaiCoordinateSpace.project` — which does the same thing for PGB's own PCLAI chart —
 * is right too. Nobody will re-derive either fact; both come from
 * `docs/adr/0003-passive-pclai-inset.md`, which is where they were measured.
 *
 * ## Framed to the ramp, not to the document
 *
 * The inset maps this domain onto its whole surface and the ramp image is stretched over
 * the same box, so the legend is exact by construction with no crop arithmetic. Framing
 * tight to the document's own points would use a little more of the panel — about 5% of
 * each axis — at the cost of putting every dot on a colour that is not its own, and of
 * making two loci's insets incomparable. The inset is a position report, and "over on the
 * left lobe" has to mean the same thing twice.
 *
 * ## Not `PclaiCoordinateSpace`
 *
 * That class projects the *dataset's* per-node coordinates into PGB's PCLAI chart card,
 * carries padding and a dot size, and lives with the widget that owns it. This projects
 * one document's per-strand coordinates into a panel that publishes nothing. Different
 * data, different lifecycle, different panel — deliberately two, per ADR 0003. They must
 * agree on the arithmetic, which is why the measurements are stated rather than assumed.
 */

import type { Point, Size } from './geometry.ts'

/**
 * The span of PCLAI coordinates the ramp image covers, corner to corner.
 *
 * A measurement, not a framing choice: change it and the ramp under the dots stops being
 * their legend. The digits are the reference cloud's own extent, kept in full because
 * rounding them to the three decimals the ADR quotes would move the corners by half a
 * pixel at any size a panel can be.
 */
export const RAMP_DOMAIN = {
    x: { min: -1.8129293612932906, max: 0.7856702103116423 },
    y: { min: -1.4238203965523002, max: 1.509197752913014 }
}

/**
 * Where `placement` sits on a `surface` css pixels across, measured from its top-left
 * corner with **y down** — the coordinate system the inset positions its dots in.
 *
 * **Not clamped.** A coordinate outside the domain projects outside the surface and is
 * clipped there. Pulling it to the edge instead would draw a dot on a colour that is not
 * its own, which is the thing this module exists to prevent; and a haplotype placed
 * outside the reference cloud is a finding rather than a rendering problem. No document
 * surveyed has one — all 363, 452, 374 and 365 placed strands across the four committed
 * documents lie inside the domain.
 */
export function projectPlacement(placement: Point, surface: Size): Point {
    return {
        x: fraction(placement.x, RAMP_DOMAIN.x) * surface.width,
        y: fraction(placement.y, RAMP_DOMAIN.y) * surface.height
    }
}

function fraction(value: number, span: { min: number, max: number }): number {
    return (value - span.min) / (span.max - span.min)
}
