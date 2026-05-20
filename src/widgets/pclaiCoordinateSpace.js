/**
 * PclaiCoordinateSpace — pure projection math for the PCLAI chart.
 *
 * Maps data-space (x, y) coordinates to pixel-space dot positions on a
 * padded chart surface. Immutable: configuration changes return a new
 * instance rather than mutating state.
 *
 * Extracted from pclaiChartService.js as phase 1 of the PCLAI triangle refactor
 * (issue #46). The projection formulas here are the spec pinned by
 * src/__tests__/pclaiCoordinateSpace.test.js.
 */

export class PclaiCoordinateSpace {
    /**
     * @param {{ x: {min, max, range}, y: {min, max, range} }} boundingBox
     * @param {number} surfaceWidth   full chart surface width in px
     * @param {number} surfaceHeight  full chart surface height in px
     * @param {number} padding        inner padding on each side in px
     * @param {number} dotSizePercent dot diameter as percent of max available dimension
     */
    constructor(boundingBox, surfaceWidth, surfaceHeight, padding, dotSizePercent) {
        this.boundingBox = boundingBox
        this.surfaceWidth = surfaceWidth
        this.surfaceHeight = surfaceHeight
        this.padding = padding
        this.dotSizePercent = dotSizePercent

        this.availableWidth = surfaceWidth - 2 * padding
        this.availableHeight = surfaceHeight - 2 * padding
        this.maxAvailableDimension = Math.max(this.availableWidth, this.availableHeight)

        this._dotSize = this.maxAvailableDimension * dotSizePercent / 100
        this._halfDotSize = this._dotSize / 2
    }

    get dotSize() {
        return this._dotSize
    }

    /**
     * Project a data-space coordinate to a dot position on the chart surface.
     * The returned (left, top) is the top-left corner of the dot — the dot
     * visually centers on the projected point.
     *
     * Out-of-bbox coordinates clamp to [halfDotSize, surface - halfDotSize]
     * so dots never draw outside the surface.
     *
     * @param {number} x
     * @param {number} y
     * @returns {{ left: number, top: number, size: number }}
     */
    project(x, y) {
        const bbox = this.boundingBox
        const half = this._halfDotSize

        const scaledX = (x - bbox.x.min) / bbox.x.range * this.availableWidth + this.padding
        const scaledY = (y - bbox.y.min) / bbox.y.range * this.availableHeight + this.padding

        const clampedX = Math.max(half, Math.min(scaledX, this.surfaceWidth - half))
        const clampedY = Math.max(half, Math.min(scaledY, this.surfaceHeight - half))

        return {
            left: clampedX - half,
            top: clampedY - half,
            size: this._dotSize,
        }
    }

    /**
     * Return a new space with the given bounding box, preserving surface
     * dimensions, padding, and dot size percent.
     */
    withBoundingBox(boundingBox) {
        return new PclaiCoordinateSpace(
            boundingBox,
            this.surfaceWidth,
            this.surfaceHeight,
            this.padding,
            this.dotSizePercent,
        )
    }
}
