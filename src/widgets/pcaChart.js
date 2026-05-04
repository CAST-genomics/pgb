/**
 * PcaChart — view owner for the PCA scatter chart.
 *
 * Owns the chart surface, axes, and reference-dot container. Renders dataset
 * dots and reference dots through an injected PcaCoordinateSpace. Handles
 * reference-dot desaturation and axis positioning. The chart is presentation-
 * only — there are no user interactions on the chart itself; visual state is
 * driven externally via `renderDots` / `clearChart`.
 *
 * Phase 3b of the PCA triangle refactor (issue #46) absorbs view concerns
 * that previously lived on pcaChartService. PcaChart knows nothing about
 * the event bus, the dataset model, or the card chrome — PcaChartController
 * owns event wiring and the mountPcaChart facade (phase 3c) will own
 * bootstrap.
 */

const REFERENCE_DOTS_DEEMPHASIZED_CLASS = 'pca-chart__reference-dots--deemphasized'
const DOT_EMPHASIZED_CLASS = 'pca-chart__dot--emphasized'

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
     * dots, clears existing dataset dots, then renders new ones.
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
            dot.className = `pca-chart__dot ${DOT_EMPHASIZED_CLASS}`
            dot.style.left = `${left}px`
            dot.style.top = `${top}px`
            dot.style.width = `${size}px`
            dot.style.height = `${size}px`
            dot.style.backgroundColor = coordinateData.rgbString

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

    /**
     * Export the chart as an SVG Blob. Reflects the chart's current visual
     * state by reading the live computed styles, so CSS-driven modifiers
     * (`--deemphasized` reference layer, `--emphasized` dataset dots) round
     * trip into the SVG. The chart surface's computed `background-image` is
     * fetched and inlined as a base64 data URI so the file is self-contained.
     *
     * @returns {Promise<Blob>}
     */
    async exportToSvg() {
        if (!this.coordinateSpace) throw new Error('PcaChart: cannot export before coordinate space is initialized')
        if (!this.chartSurface) throw new Error('PcaChart: cannot export without chart surface')

        const w = this.coordinateSpace.surfaceWidth
        const h = this.coordinateSpace.surfaceHeight

        const bgImage = getComputedStyle(this.chartSurface).backgroundImage
        const backgroundUrl = firstUrlFromBackgroundImage(bgImage)
        if (!backgroundUrl) {
            throw new Error(
                'PcaChart export: chart surface has no `url(...)` in computed background-image; cannot inline background',
            )
        }
        const backgroundDataUri = await fetchBackgroundAsDataUri(backgroundUrl)

        const referenceDeemphasized = !!this.referenceDotsContainer
            && this.referenceDotsContainer.classList.contains(REFERENCE_DOTS_DEEMPHASIZED_CLASS)
        const referenceOpacity = referenceDeemphasized
            ? parseFloat(getComputedStyle(this.referenceDotsContainer).opacity) || 1
            : 1

        const datasetDots = this.chartSurface
            ? Array.from(this.chartSurface.querySelectorAll('.pca-chart__dot'))
            : []
        const datasetEmphasis = readDatasetEmphasis(datasetDots[0])

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
            const groupAttrs = referenceDeemphasized ? ` opacity="${referenceOpacity}"` : ''
            parts.push(`<g${groupAttrs}>`)
            for (const dot of this.referenceDotsContainer.querySelectorAll('.pca-chart__reference-dot')) {
                parts.push(referenceCircleSvg(dot))
            }
            parts.push('</g>')
        }

        for (const dot of datasetDots) {
            parts.push(datasetCircleSvg(dot, datasetEmphasis))
        }

        parts.push('</svg>')
        return new Blob([parts.join('')], { type: 'image/svg+xml' })
    }
}

function referenceCircleSvg(dotEl) {
    const { cx, cy, r } = circleGeometry(dotEl)
    // Computed style — not inline — so the deemphasized override is honored.
    const fill = getComputedStyle(dotEl).backgroundColor || '#000'
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${escapeXmlAttr(fill)}"/>`
}

function datasetCircleSvg(dotEl, emphasis) {
    const { cx, cy, r } = circleGeometry(dotEl)
    const fill = dotEl.style.backgroundColor || '#000'
    const scaledR = r * emphasis.scale
    let strokeAttrs = ''
    if (emphasis.strokeWidth > 0) {
        strokeAttrs = ` stroke="${escapeXmlAttr(emphasis.strokeColor)}" stroke-width="${emphasis.strokeWidth * emphasis.scale}"`
    }
    return `<circle cx="${cx}" cy="${cy}" r="${scaledR}" fill="${escapeXmlAttr(fill)}"${strokeAttrs}/>`
}

function circleGeometry(dotEl) {
    const left = parseFloat(dotEl.style.left) || 0
    const top = parseFloat(dotEl.style.top) || 0
    const width = parseFloat(dotEl.style.width) || 0
    const height = parseFloat(dotEl.style.height) || 0
    return {
        cx: left + width / 2,
        cy: top + height / 2,
        r: Math.min(width, height) / 2,
    }
}

/**
 * Sample the computed style of a representative dataset dot to recover the
 * `--emphasized` border + scale. All dataset dots carry the same modifier so
 * one sample is enough; we avoid per-dot getComputedStyle calls.
 *
 * @returns {{ scale: number, strokeWidth: number, strokeColor: string }}
 */
function readDatasetEmphasis(sampleDot) {
    if (!sampleDot) return { scale: 1, strokeWidth: 0, strokeColor: 'none' }
    const cs = getComputedStyle(sampleDot)
    return {
        scale: parseScaleFromTransform(cs.transform),
        strokeWidth: parseFloat(cs.borderTopWidth) || 0,
        strokeColor: cs.borderTopColor || 'none',
    }
}

function parseScaleFromTransform(transform) {
    if (!transform || transform === 'none') return 1
    const match = transform.match(/^matrix\(([^)]+)\)/)
    if (!match) return 1
    const a = parseFloat(match[1].split(',')[0])
    return Number.isFinite(a) && a > 0 ? a : 1
}

function escapeXmlAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

/**
 * Returns the first URL string inside `url(...)` from a computed `background-image`
 * value, or null if none (e.g. `none` or only gradients).
 *
 * @param {string} backgroundImage
 * @returns {string | null}
 */
function firstUrlFromBackgroundImage(backgroundImage) {
    if (!backgroundImage || backgroundImage === 'none') return null
    const idx = backgroundImage.indexOf('url(')
    if (idx === -1) return null
    let i = idx + 4
    while (i < backgroundImage.length && /\s/.test(backgroundImage[i])) i++
    if (i >= backgroundImage.length) return null
    const q = backgroundImage[i]
    if (q === '"' || q === "'") {
        const end = backgroundImage.indexOf(q, i + 1)
        if (end === -1) return null
        return backgroundImage.slice(i + 1, end)
    }
    const end = backgroundImage.indexOf(')', i)
    if (end === -1) return null
    return backgroundImage.slice(i, end).trim()
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

