/**
 * mountPcaChart — facade that bootstraps the PCA chart subsystem.
 *
 * Phase 3c of the PCA triangle refactor (issue #46). Replaces the
 * pcaChartService singleton: owns card chrome construction, button wiring,
 * reference-data fetch, dataset-load subscription, and the `PcaChart` +
 * `PcaChartController` instances.
 *
 * Returns a small handle callers drive: `reset`, `initializeGlobalBoundingBox`,
 * `selectedCoordinateKey`, and `destroy`.
 */

import eventBus from '../utils/eventBus.ts'
import { Draggable } from '../utils/draggable.js'
import { pclaiCoordinateService } from './pclaiCoordinateService.js'
import { PcaCoordinateSpace } from './pcaCoordinateSpace.js'
import { PcaChart } from './pcaChart.js'
import { PcaChartController } from './pcaChartController.js'
import { acquireAbsence, releaseAbsence } from './pcaAbsenceCoordinator.js'

const ABSENCE_PRESENTER_ID = 'pcaChart'

const DOT_SIZE_PERCENT = 1
const CHART_PADDING = 20
const DEFAULT_SURFACE_SIZE = 448
const REFERENCE_DATA_URL = '/datasets/hprc-reference-pca.tsv'

export function mountPcaChart({ containerId = 'pca-chart-container' } = {}) {
    const dom = createChartDOM(containerId)
    const { chartContainer, chartSurface, referenceDotsContainer, horizontalAxis, verticalAxis } = dom

    const chart = new PcaChart({
        chartSurface,
        referenceDotsContainer,
        horizontalAxis,
        verticalAxis,
        coordinateSpace: null,
    })

    let isVisible = false
    let isInitialized = false
    let coordinateSpace = null
    let referenceData = []

    const controller = new PcaChartController({
        isVisible: () => isVisible,
        isInitialized: () => isInitialized,
        clearChart: () => chart.clearChart(),
        renderCoordinateMap: (map) => {
            if (!map || map.size === 0) return
            chart.renderDots(map)
        },
        restoreReferenceDots: () => chart.restoreReferenceDots(),
    })
    controller.start()

    const draggable = new Draggable(chartContainer)
    const button = createButton(() => toggleChart())
    const referenceDataPromise = loadReferenceData().then(data => { referenceData = data })

    const datasetUnsub = eventBus.subscribe('datasetLoaded', () => {
        updateButtonState()
        if (isVisible && !pclaiCoordinateService.hasPCLAIData()) {
            hideChart()
        }
    })

    function updateButtonState() {
        if (!button) return
        const hasData = pclaiCoordinateService.hasPCLAIData()
        button.disabled = !hasData
        if (!hasData && isVisible) hideChart()
    }

    function showChart() {
        chartContainer.style.display = 'block'
        isVisible = true
        if (isInitialized && coordinateSpace) {
            chart.updateAxes()
            const existing = referenceDotsContainer.querySelectorAll('.pca-chart__reference-dot')
            if (!existing || existing.length === 0) {
                chart.renderReferenceDots(referenceData)
            }
            controller.refreshForVisibilityChange()
        }

        acquireAbsence(ABSENCE_PRESENTER_ID)
    }

    function hideChart() {
        chartContainer.style.display = 'none'
        isVisible = false
        releaseAbsence(ABSENCE_PRESENTER_ID)
    }

    function toggleChart() {
        if (!pclaiCoordinateService.hasPCLAIData()) return isVisible
        if (isVisible) hideChart()
        else showChart()
        return isVisible
    }

    function reset() {
        chart.clearChart()
        controller.currentNodeId = null
        isInitialized = false
        coordinateSpace = null
    }

    async function initializeGlobalBoundingBox() {
        await referenceDataPromise

        const datasetBbox = pclaiCoordinateService.getBoundingBox()
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
        if (datasetBbox) {
            minX = datasetBbox.x.min; maxX = datasetBbox.x.max
            minY = datasetBbox.y.min; maxY = datasetBbox.y.max
        }
        for (const p of referenceData) {
            if (p.x < minX) minX = p.x
            if (p.x > maxX) maxX = p.x
            if (p.y < minY) minY = p.y
            if (p.y > maxY) maxY = p.y
        }
        if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
            console.warn('mountPcaChart: No valid coordinates found')
            return
        }

        const dataBounds = {
            x: { min: minX, max: maxX, centroid: (minX + maxX) / 2, range: maxX - minX },
            y: { min: minY, max: maxY, centroid: (minY + maxY) / 2, range: maxY - minY },
        }

        return new Promise(resolve => {
            requestAnimationFrame(() => {
                const computed = window.getComputedStyle(chartContainer)
                const surfaceSize = parseFloat(computed.getPropertyValue('--pca-chart-surface-size')) || DEFAULT_SURFACE_SIZE
                coordinateSpace = new PcaCoordinateSpace(
                    dataBounds,
                    surfaceSize,
                    surfaceSize,
                    CHART_PADDING,
                    DOT_SIZE_PERCENT,
                )
                chart.setCoordinateSpace(coordinateSpace)
                isInitialized = true
                resolve()
            })
        })
    }

    function destroy() {
        datasetUnsub()
        controller.destroy()
        draggable.destroy()
        if (button && button.parentNode) button.parentNode.removeChild(button)
        if (chartContainer && chartContainer.parentNode) chartContainer.parentNode.removeChild(chartContainer)
    }

    return {
        reset,
        initializeGlobalBoundingBox,
        get selectedCoordinateKey() { return controller.selectedCoordinateKey },
        exportToSvg: () => chart.exportToSvg(),
        destroy,
    }
}

// ── DOM construction ────────────────────────────────────────────────

function createChartDOM(containerId) {
    let container = document.getElementById(containerId)
    if (!container) {
        container = document.createElement('div')
        container.id = containerId
        container.className = 'pca-chart__card card position-absolute'
        container.style.display = 'none'
        document.body.appendChild(container)
    }

    if (!container.querySelector('.card-header')) {
        const header = document.createElement('div')
        header.className = 'card-header'
        const title = document.createElement('h5')
        title.className = 'card-title mb-0'
        title.textContent = 'PCA Chart'
        header.appendChild(title)
        container.appendChild(header)
    }

    let body = container.querySelector('.card-body')
    if (!body) {
        body = document.createElement('div')
        body.className = 'card-body'
        container.appendChild(body)
    }

    let surface = document.getElementById('pca-chart-surface')
    if (!surface) {
        surface = document.createElement('div')
        surface.id = 'pca-chart-surface'
        surface.className = 'pca-chart__surface'
        body.appendChild(surface)
    }

    let referenceContainer = document.getElementById('pca-chart-reference-dots')
    if (!referenceContainer) {
        referenceContainer = document.createElement('div')
        referenceContainer.id = 'pca-chart-reference-dots'
        referenceContainer.className = 'pca-chart__reference-dots'
        surface.appendChild(referenceContainer)
    }
    referenceContainer.style.opacity = '1'

    let horizontalAxis = document.getElementById('pca-chart-axis-horizontal')
    if (!horizontalAxis) {
        horizontalAxis = document.createElement('div')
        horizontalAxis.id = 'pca-chart-axis-horizontal'
        horizontalAxis.className = 'pca-chart__axis pca-chart__axis--horizontal'
        surface.appendChild(horizontalAxis)
    }

    let verticalAxis = document.getElementById('pca-chart-axis-vertical')
    if (!verticalAxis) {
        verticalAxis = document.createElement('div')
        verticalAxis.id = 'pca-chart-axis-vertical'
        verticalAxis.className = 'pca-chart__axis pca-chart__axis--vertical'
        surface.appendChild(verticalAxis)
    }

    if (!container.querySelector('.card-footer')) {
        const footer = document.createElement('div')
        footer.className = 'card-footer pca-chart__footer'
        container.appendChild(footer)
    }

    return {
        chartContainer: container,
        chartSurface: surface,
        referenceDotsContainer: referenceContainer,
        horizontalAxis,
        verticalAxis,
    }
}

function createButton(onClick) {
    const navbarNav = document.querySelector('.navbar-nav.ms-auto')
    if (!navbarNav) {
        console.warn('mountPcaChart: Could not find navbar-nav container for button')
        return null
    }

    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'btn btn-outline-secondary'
    button.id = 'pca-chart-button'
    button.textContent = 'PCA Chart'
    button.disabled = true
    button.addEventListener('click', onClick)

    const infoButton = document.getElementById('info-button')
    if (infoButton && infoButton.parentNode === navbarNav) {
        navbarNav.insertBefore(button, infoButton)
    } else {
        navbarNav.appendChild(button)
    }
    return button
}

async function loadReferenceData() {
    try {
        const response = await fetch(REFERENCE_DATA_URL)
        if (!response.ok) {
            console.warn('mountPcaChart: Failed to load reference PCA data:', response.statusText)
            return []
        }
        const text = await response.text()
        const lines = text.trim().split('\n').slice(1)
        const out = []
        for (const line of lines) {
            if (!line.trim()) continue
            const cols = line.split('\t')
            if (cols.length < 3) continue
            const x = parseFloat(cols[0])
            const y = parseFloat(cols[1])
            if (isNaN(x) || isNaN(y)) continue
            const match = cols[2].trim().match(/\(([\d.]+),\s*([\d.]+),\s*([\d.]+)\)/)
            if (!match) continue
            const r = Math.round(parseFloat(match[1]) * 255)
            const g = Math.round(parseFloat(match[2]) * 255)
            const b = Math.round(parseFloat(match[3]) * 255)
            out.push({ x, y, color: `rgb(${r}, ${g}, ${b})` })
        }
        console.log(`mountPcaChart: Loaded ${out.length} reference PCA data points`)
        return out
    } catch (error) {
        console.warn('mountPcaChart: Error loading reference PCA data:', error)
        return []
    }
}
