/**
 * PcaChart — view owner for the PCA scatter chart.
 *
 * Owns the chart surface, axes, and reference-dot container. Renders dataset
 * dots and reference dots through an injected PcaCoordinateSpace. Handles
 * per-dot hover emphasis, reference-dot desaturation, and axis positioning.
 *
 * Phase 3b of the PCA triangle refactor (issue #46) absorbs view concerns
 * that previously lived on pcaChartService. PcaChart knows nothing about
 * the event bus, the dataset model, or the card chrome — PcaChartController
 * owns event wiring and the mountPcaChart facade (phase 3c) will own
 * bootstrap.
 */

const OPACITY_FULL = 1.0
const OPACITY_REFERENCE_DEEMPHASIZED = 0.25
const OPACITY_DATASET_DEEMPHASIZED = 0.05
const EMPHASIS_SIZE_MULTIPLIER = 1.5

export class PcaChart {
    /**
     * @param {{
     *   chartSurface: HTMLElement,
     *   referenceDotsContainer: HTMLElement,
     *   horizontalAxis?: HTMLElement,
     *   verticalAxis?: HTMLElement,
     *   coordinateSpace?: import('./pcaCoordinateSpace.js').PcaCoordinateSpace,
     * }} options
     */
    constructor({ chartSurface, referenceDotsContainer, horizontalAxis, verticalAxis, coordinateSpace }) {
        this.chartSurface = chartSurface
        this.referenceDotsContainer = referenceDotsContainer
        this.horizontalAxis = horizontalAxis
        this.verticalAxis = verticalAxis
        this.coordinateSpace = coordinateSpace
    }

    setCoordinateSpace(coordinateSpace) {
        this.coordinateSpace = coordinateSpace
        this.updateAxes()
    }

    // ── Dataset dots ────────────────────────────────────────────────

    /**
     * Render dataset dots for a coordinate data map. Desaturates reference
     * dots, clears existing dataset dots, then renders new ones with hover
     * emphasis attached.
     *
     * @param {Map<string, {coordinates: [number, number], rgbString: string}>} coordinateDataMap
     */
    renderDots(coordinateDataMap) {
        this.deemphasizeReferenceDots()
        this.clearDatasetDots()

        const space = this.coordinateSpace
        const fragment = document.createDocumentFragment()

        for (const [, coordinateData] of coordinateDataMap) {
            const [x, y] = coordinateData.coordinates
            const { left, top, size } = space.project(x, y)
            const centerX = left + size / 2
            const centerY = top + size / 2

            const dot = document.createElement('div')
            dot.className = 'pca-chart__dot'
            dot.style.position = 'absolute'
            dot.style.left = `${left}px`
            dot.style.top = `${top}px`
            dot.style.width = `${size}px`
            dot.style.height = `${size}px`
            dot.style.backgroundColor = coordinateData.rgbString
            dot.style.borderRadius = '50%'
            dot.style.border = '1px solid transparent'
            dot.style.opacity = OPACITY_FULL
            dot.dataset.originalColor = coordinateData.rgbString

            dot.addEventListener('mouseenter', () => this._handleDotHover(dot, size, centerX, centerY))
            dot.addEventListener('mouseleave', () => this._handleDotLeave(dot, size, centerX, centerY))

            fragment.appendChild(dot)
        }

        this.chartSurface.appendChild(fragment)
    }

    clearDatasetDots() {
        if (!this.chartSurface) return
        const datasetDots = this.chartSurface.querySelectorAll('.pca-chart__dot')
        datasetDots.forEach(dot => dot.remove())
    }

    /**
     * Clear dataset dots and restore reference dots to full color and opacity.
     * This is the "return to idle" operation.
     */
    clearChart() {
        this.clearDatasetDots()
        this.restoreReferenceDots()
    }

    // ── Reference dots ──────────────────────────────────────────────

    /**
     * Clear and re-render reference dots into the reference container.
     *
     * @param {Array<{x: number, y: number, color: string}>} referenceData
     */
    renderReferenceDots(referenceData) {
        if (!this.referenceDotsContainer) return

        this.referenceDotsContainer.innerHTML = ''

        const space = this.coordinateSpace
        const fragment = document.createDocumentFragment()

        for (const refPoint of referenceData) {
            const { x, y, color } = refPoint
            const { left, top, size } = space.project(x, y)

            const dot = document.createElement('div')
            dot.className = 'pca-chart__reference-dot'
            dot.style.position = 'absolute'
            dot.style.left = `${left}px`
            dot.style.top = `${top}px`
            dot.style.width = `${size}px`
            dot.style.height = `${size}px`
            dot.style.backgroundColor = color
            dot.style.borderRadius = '50%'
            dot.style.border = '1px solid transparent'
            dot.dataset.originalColor = color

            fragment.appendChild(dot)
        }

        this.referenceDotsContainer.appendChild(fragment)
    }

    deemphasizeReferenceDots() {
        if (!this.referenceDotsContainer) return

        const referenceDots = this.referenceDotsContainer.querySelectorAll('.pca-chart__reference-dot')
        referenceDots.forEach(dot => {
            if (!dot.dataset.originalColor) {
                dot.dataset.originalColor = dot.style.backgroundColor
            }
            dot.style.backgroundColor = rgbToGrayscale(dot.dataset.originalColor)
        })
        this.referenceDotsContainer.style.opacity = OPACITY_REFERENCE_DEEMPHASIZED
    }

    restoreReferenceDots() {
        if (!this.referenceDotsContainer) return

        const referenceDots = this.referenceDotsContainer.querySelectorAll('.pca-chart__reference-dot')
        referenceDots.forEach(dot => {
            if (dot.dataset.originalColor) {
                dot.style.backgroundColor = dot.dataset.originalColor
            }
        })
        this.referenceDotsContainer.style.opacity = OPACITY_FULL
    }

    // ── Axes ────────────────────────────────────────────────────────

    /**
     * Position the axes so they pass through data-space origin (0, 0).
     * Uses the current coordinate space and the surface dimensions stored in it.
     */
    updateAxes() {
        if (!this.coordinateSpace) return

        const space = this.coordinateSpace
        const bbox = space.boundingBox
        const originX = (0 - bbox.x.min) / bbox.x.range * space.availableWidth + space.padding
        const originY = (0 - bbox.y.min) / bbox.y.range * space.availableHeight + space.padding

        if (this.horizontalAxis) {
            this.horizontalAxis.style.position = 'absolute'
            this.horizontalAxis.style.left = '0px'
            this.horizontalAxis.style.top = `${originY}px`
            this.horizontalAxis.style.width = `${space.surfaceWidth}px`
            this.horizontalAxis.style.height = '1px'
            this.horizontalAxis.style.backgroundColor = '#000'
            this.horizontalAxis.style.pointerEvents = 'none'
            this.horizontalAxis.style.zIndex = '0'
        }
        if (this.verticalAxis) {
            this.verticalAxis.style.position = 'absolute'
            this.verticalAxis.style.left = `${originX}px`
            this.verticalAxis.style.top = '0px'
            this.verticalAxis.style.width = '1px'
            this.verticalAxis.style.height = `${space.surfaceHeight}px`
            this.verticalAxis.style.backgroundColor = '#000'
            this.verticalAxis.style.pointerEvents = 'none'
            this.verticalAxis.style.zIndex = '0'
        }
    }

    // ── Dot hover (private) ─────────────────────────────────────────

    _handleDotHover(hoveredDot, dotSizePx, centerX, centerY) {
        const emphasizedSize = dotSizePx * EMPHASIS_SIZE_MULTIPLIER
        const halfEmphasizedSize = emphasizedSize / 2

        hoveredDot.style.width = `${emphasizedSize}px`
        hoveredDot.style.height = `${emphasizedSize}px`
        hoveredDot.style.zIndex = '10'
        hoveredDot.style.left = `${centerX - halfEmphasizedSize}px`
        hoveredDot.style.top = `${centerY - halfEmphasizedSize}px`

        const allDots = this.chartSurface.querySelectorAll('.pca-chart__dot')
        allDots.forEach(dot => {
            if (dot !== hoveredDot) {
                if (!dot.dataset.originalColor) {
                    dot.dataset.originalColor = dot.style.backgroundColor
                }
                dot.style.backgroundColor = rgbToGrayscale(dot.dataset.originalColor)
                dot.style.opacity = OPACITY_DATASET_DEEMPHASIZED
            }
        })
    }

    _handleDotLeave(dot, dotSizePx, centerX, centerY) {
        const halfDotSize = dotSizePx / 2
        dot.style.width = `${dotSizePx}px`
        dot.style.height = `${dotSizePx}px`
        dot.style.zIndex = '1'
        dot.style.left = `${centerX - halfDotSize}px`
        dot.style.top = `${centerY - halfDotSize}px`

        const allDots = this.chartSurface.querySelectorAll('.pca-chart__dot')
        allDots.forEach(d => {
            if (d.dataset.originalColor) {
                d.style.backgroundColor = d.dataset.originalColor
            }
            d.style.opacity = OPACITY_FULL
        })
    }
}

function rgbToGrayscale(rgbString) {
    const match = rgbString.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
    if (!match) return rgbString
    const r = parseInt(match[1], 10)
    const g = parseInt(match[2], 10)
    const b = parseInt(match[3], 10)
    const luminance = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
    return `rgb(${luminance}, ${luminance}, ${luminance})`
}
