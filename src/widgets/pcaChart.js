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

const PCA_BACKGROUND_URL = '/images/pca_background_576_flipped.png'

const REFERENCE_DOTS_DEEMPHASIZED_CLASS = 'pca-chart__reference-dots--deemphasized'
const DOT_DEEMPHASIZED_CLASS = 'pca-chart__dot--deemphasized'
const DOT_HOVERED_CLASS = 'pca-chart__dot--hovered'

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

            const dot = document.createElement('div')
            dot.className = 'pca-chart__dot'
            dot.style.left = `${left}px`
            dot.style.top = `${top}px`
            dot.style.width = `${size}px`
            dot.style.height = `${size}px`
            dot.style.backgroundColor = coordinateData.rgbString

            dot.addEventListener('mouseenter', () => this._handleDotHover(dot))
            dot.addEventListener('mouseleave', () => this._handleDotLeave(dot))

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
            dot.style.left = `${left}px`
            dot.style.top = `${top}px`
            dot.style.width = `${size}px`
            dot.style.height = `${size}px`
            dot.style.backgroundColor = color

            fragment.appendChild(dot)
        }

        this.referenceDotsContainer.appendChild(fragment)
    }

    deemphasizeReferenceDots() {
        if (!this.referenceDotsContainer) return
        this.referenceDotsContainer.classList.add(REFERENCE_DOTS_DEEMPHASIZED_CLASS)
    }

    restoreReferenceDots() {
        if (!this.referenceDotsContainer) return
        this.referenceDotsContainer.classList.remove(REFERENCE_DOTS_DEEMPHASIZED_CLASS)
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

    _handleDotHover(hoveredDot) {
        hoveredDot.classList.add(DOT_HOVERED_CLASS)

        const allDots = this.chartSurface.querySelectorAll('.pca-chart__dot')
        allDots.forEach(dot => {
            if (dot !== hoveredDot) {
                dot.classList.add(DOT_DEEMPHASIZED_CLASS)
            }
        })
    }

    /**
     * Export the chart as an SVG Blob. Walks the live DOM so the export reflects
     * exactly what's on screen at idle (hover scale and grayscale are CSS-only,
     * so the inline geometry and backgroundColor we read here are always the
     * idle values). Background PNG is inlined as a base64 data URI so the file
     * is self-contained.
     *
     * @returns {Promise<Blob>}
     */
    async exportToSvg() {
        if (!this.coordinateSpace) throw new Error('PcaChart: cannot export before coordinate space is initialized')

        const w = this.coordinateSpace.surfaceWidth
        const h = this.coordinateSpace.surfaceHeight

        const backgroundDataUri = await fetchBackgroundAsDataUri(PCA_BACKGROUND_URL)

        const parts = []
        parts.push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`)
        parts.push(`<image href="${backgroundDataUri}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"/>`)

        for (const axisEl of [this.horizontalAxis, this.verticalAxis]) {
            if (!axisEl) continue
            const x = parseFloat(axisEl.style.left) || 0
            const y = parseFloat(axisEl.style.top) || 0
            const aw = parseFloat(axisEl.style.width) || 0
            const ah = parseFloat(axisEl.style.height) || 0
            parts.push(`<line x1="${x}" y1="${y}" x2="${x + aw}" y2="${y + ah}" stroke="#000" stroke-width="1"/>`)
        }

        if (this.referenceDotsContainer) {
            for (const dot of this.referenceDotsContainer.querySelectorAll('.pca-chart__reference-dot')) {
                parts.push(circleSvgFromDot(dot))
            }
        }
        if (this.chartSurface) {
            for (const dot of this.chartSurface.querySelectorAll('.pca-chart__dot')) {
                parts.push(circleSvgFromDot(dot))
            }
        }

        parts.push('</svg>')
        return new Blob([parts.join('')], { type: 'image/svg+xml' })
    }

    _handleDotLeave(dot) {
        dot.classList.remove(DOT_HOVERED_CLASS)

        const allDots = this.chartSurface.querySelectorAll('.pca-chart__dot')
        allDots.forEach(d => d.classList.remove(DOT_DEEMPHASIZED_CLASS))
    }
}

function circleSvgFromDot(dotEl) {
    const left = parseFloat(dotEl.style.left) || 0
    const top = parseFloat(dotEl.style.top) || 0
    const width = parseFloat(dotEl.style.width) || 0
    const height = parseFloat(dotEl.style.height) || 0
    const cx = left + width / 2
    const cy = top + height / 2
    const r = Math.min(width, height) / 2
    const fill = dotEl.style.backgroundColor || '#000'
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${escapeXmlAttr(fill)}"/>`
}

function escapeXmlAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

async function fetchBackgroundAsDataUri(url) {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`PcaChart export: failed to fetch background ${url}: ${response.status}`)
    const blob = await response.blob()
    return await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(blob)
    })
}

