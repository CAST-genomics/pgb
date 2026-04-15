/**
 * PcaChartController — owns the event subscriptions and interaction state
 * for the PCA chart.
 *
 * Phase 3a of the PCA triangle refactor (issue #46) extracts this file as a
 * pure move: the behavior is bug-for-bug identical to what pcaChartService
 * did previously, including the #47 bug where re-clicking a widget assembly
 * does not toggle off. Phase 3c fixes that inside this file once the
 * extraction has settled.
 *
 * Today the controller delegates view updates back to pcaChartService. Phase
 * 3b moves those view concerns into PcaChart, at which point the delegate
 * collapses to a `PcaChart` reference.
 */

import eventBus from '../utils/eventBus.ts'
import { pclaiCoordinateService } from './pclaiCoordinateService.js'

export class PcaChartController {
    /**
     * @param {{
     *   isVisible: () => boolean,
     *   isInitialized: () => boolean,
     *   clearChart: () => void,
     *   renderCoordinateMap: (map) => void,
     *   restoreReferenceDots: () => void,
     * }} chartDelegate
     */
    constructor(chartDelegate) {
        this.chartDelegate = chartDelegate
        this.currentNodeId = null
        this.selectedCoordinateKey = null
        this.unsubscribes = []
    }

    get hoveredNodeId() {
        return this.currentNodeId
    }

    start() {
        this.unsubscribes.push(
            eventBus.subscribe('lineIntersection', (data) => {
                if (!data || !data.nodeName) {
                    this.chartDelegate.clearChart()
                    return
                }
                this.updateChartForNode(data.nodeName)
            }),
        )

        this.unsubscribes.push(
            eventBus.subscribe('clearIntersection', () => {
                this.currentNodeId = null
                if (this.selectedCoordinateKey && this.chartDelegate.isVisible()) {
                    this.renderAllDotsForCoordinateKey(this.selectedCoordinateKey)
                } else {
                    this.chartDelegate.clearChart()
                }
            }),
        )

        this.unsubscribes.push(
            eventBus.subscribe('pcaWidget:emphasis', (data) => {
                const { assembly } = data
                this.selectedCoordinateKey = assembly.name

                if (!this.chartDelegate.isVisible()) return

                if (this.currentNodeId) {
                    this.updateChartForNode(this.currentNodeId)
                } else {
                    this.renderAllDotsForCoordinateKey(this.selectedCoordinateKey)
                }
            }),
        )

        this.unsubscribes.push(
            eventBus.subscribe('pcaWidget:normal', () => {
                this.selectedCoordinateKey = null
                if (!this.chartDelegate.isVisible()) return

                this.chartDelegate.restoreReferenceDots()

                if (this.currentNodeId) {
                    this.updateChartForNode(this.currentNodeId)
                } else {
                    this.chartDelegate.clearChart()
                }
            }),
        )
    }

    /**
     * Render dots for a hovered node, filtered by the currently-selected
     * coordinate key if one exists.
     */
    updateChartForNode(nodeId) {
        if (!this.chartDelegate.isInitialized()) {
            console.warn('PcaChartController: chart not initialized')
            return
        }

        let coordinatesMap = pclaiCoordinateService.getCoordinatesForNode(nodeId)
        if (!coordinatesMap || coordinatesMap.size === 0) {
            this.chartDelegate.clearChart()
            return
        }

        if (this.selectedCoordinateKey) {
            if (coordinatesMap.has(this.selectedCoordinateKey)) {
                coordinatesMap = new Map([
                    [this.selectedCoordinateKey, coordinatesMap.get(this.selectedCoordinateKey)],
                ])
            } else {
                this.chartDelegate.clearChart()
                return
            }
        }

        this.currentNodeId = nodeId
        this.chartDelegate.renderCoordinateMap(coordinatesMap)
    }

    /**
     * Render every node's dots for a given coordinate key.
     */
    renderAllDotsForCoordinateKey(coordinateKey) {
        if (!this.chartDelegate.isInitialized()) {
            console.warn('PcaChartController: chart not initialized')
            return
        }

        const nodeCoordinatesMap = pclaiCoordinateService.getCoordinatesForCoordinateKey(coordinateKey)
        if (!nodeCoordinatesMap || nodeCoordinatesMap.size === 0) {
            this.chartDelegate.clearChart()
            return
        }

        this.chartDelegate.renderCoordinateMap(nodeCoordinatesMap)
    }

    /**
     * Called by the service when the chart is re-shown. If state is present,
     * re-render so the chart reflects the current hover/selection.
     */
    refreshForVisibilityChange() {
        if (!this.chartDelegate.isVisible()) return
        if (this.selectedCoordinateKey) {
            if (this.currentNodeId) {
                this.updateChartForNode(this.currentNodeId)
            } else {
                this.renderAllDotsForCoordinateKey(this.selectedCoordinateKey)
            }
        }
    }

    destroy() {
        for (const unsub of this.unsubscribes) unsub()
        this.unsubscribes = []
        this.currentNodeId = null
        this.selectedCoordinateKey = null
    }
}
