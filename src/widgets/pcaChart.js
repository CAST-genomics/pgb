/**
 * PcaChart — DOM renderer for the PCA scatter chart.
 *
 * Owns the two dot-render loops (dataset dots + reference dots) and delegates
 * all coordinate math to an injected PcaCoordinateSpace. Knows nothing about
 * the event bus, the dataset model, or the card chrome — phase 3 of the PCA
 * triangle refactor (issue #46) will extract the controller and facade.
 *
 * Phase 2 surface: three entry points.
 */

export class PcaChart {
    /**
     * @param {{
     *   chartSurface: HTMLElement,
     *   referenceDotsContainer: HTMLElement,
     *   coordinateSpace: import('./pcaCoordinateSpace.js').PcaCoordinateSpace,
     *   fullOpacity?: number,
     * }} options
     */
    constructor({ chartSurface, referenceDotsContainer, coordinateSpace, fullOpacity = 1.0 }) {
        this.chartSurface = chartSurface
        this.referenceDotsContainer = referenceDotsContainer
        this.coordinateSpace = coordinateSpace
        this.fullOpacity = fullOpacity
    }

    setCoordinateSpace(coordinateSpace) {
        this.coordinateSpace = coordinateSpace
    }

    /**
     * Append dataset dots for a coordinate data map. Does not clear existing
     * dots — matches the pre-refactor behavior of pcaChartService.
     *
     * @param {Map<string, {coordinates: [number, number], rgbString: string}>} coordinateDataMap
     * @param {{ onDotHover?: (dot, size, centerX, centerY) => void,
     *           onDotLeave?: (dot, size, centerX, centerY) => void }} [handlers]
     */
    renderDots(coordinateDataMap, { onDotHover, onDotLeave } = {}) {
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
            dot.style.opacity = this.fullOpacity

            dot.dataset.originalColor = coordinateData.rgbString

            if (onDotHover) {
                dot.addEventListener('mouseenter', () => onDotHover(dot, size, centerX, centerY))
            }
            if (onDotLeave) {
                dot.addEventListener('mouseleave', () => onDotLeave(dot, size, centerX, centerY))
            }

            fragment.appendChild(dot)
        }

        this.chartSurface.appendChild(fragment)
    }

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
}
