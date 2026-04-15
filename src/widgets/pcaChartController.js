/**
 * PcaChartController — owns event subscriptions and interaction state for
 * the PCA chart.
 *
 * Phase 3d of the PCA triangle refactor (issue #46) reshapes this into a
 * small state machine so the rendered chart is a pure function of
 * `{ hoveredNodeId, selectedCoordinateKey }`. Every event handler updates
 * that state and calls `render()`; the render path decides what dots to
 * draw. This fixes issue #47:
 *
 *   - Clicking the same coordinate key twice toggles it off (widget fires
 *     `pcaWidget:deselect`, controller clears `selectedCoordinateKey`).
 *   - Reference-dot desaturation is implicit: any non-idle state calls
 *     `chart.renderDots(...)` which de-emphasizes the reference layer;
 *     returning to idle calls `chart.clearChart()` which restores it.
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
        this.hoveredNodeId = null
        this.selectedCoordinateKey = null
        this.unsubscribes = []
    }

    /** Back-compat accessor. Prefer reading `hoveredNodeId` directly. */
    get currentNodeId() {
        return this.hoveredNodeId
    }
    set currentNodeId(value) {
        this.hoveredNodeId = value
    }

    start() {
        this.unsubscribes.push(
            eventBus.subscribe('lineIntersection', (data) => {
                if (!data || !data.nodeName) {
                    this.hoveredNodeId = null
                } else {
                    this.hoveredNodeId = data.nodeName
                }
                this.render()
            }),
        )

        this.unsubscribes.push(
            eventBus.subscribe('clearIntersection', () => {
                this.hoveredNodeId = null
                this.render()
            }),
        )

        this.unsubscribes.push(
            eventBus.subscribe('pcaWidget:emphasis', (data) => {
                this.selectedCoordinateKey = data.assembly.name
                this.render()
            }),
        )

        this.unsubscribes.push(
            eventBus.subscribe('pcaWidget:deselect', () => {
                this.selectedCoordinateKey = null
                this.render()
            }),
        )

        this.unsubscribes.push(
            eventBus.subscribe('pcaWidget:normal', () => {
                this.selectedCoordinateKey = null
                this.render()
            }),
        )
    }

    /**
     * Render the chart as a pure function of
     * `(hoveredNodeId, selectedCoordinateKey)`.
     *
     *   both null                       → idle (full-color reference only)
     *   hover set, no selection         → all keys for the hovered node
     *   selection set, no hover         → all nodes for the selected key
     *   hover + selection               → single dot for (node, key) if
     *                                     present, else idle
     */
    render() {
        if (!this.chartDelegate.isInitialized()) return
        if (!this.chartDelegate.isVisible()) return

        const hovered = this.hoveredNodeId
        const selected = this.selectedCoordinateKey

        if (!hovered && !selected) {
            this.chartDelegate.clearChart()
            return
        }

        if (hovered && !selected) {
            const map = pclaiCoordinateService.getCoordinatesForNode(hovered)
            if (!map || map.size === 0) {
                this.chartDelegate.clearChart()
                return
            }
            this.chartDelegate.renderCoordinateMap(map)
            return
        }

        if (!hovered && selected) {
            const map = pclaiCoordinateService.getCoordinatesForCoordinateKey(selected)
            if (!map || map.size === 0) {
                this.chartDelegate.clearChart()
                return
            }
            this.chartDelegate.renderCoordinateMap(map)
            return
        }

        // hovered && selected
        const map = pclaiCoordinateService.getCoordinatesForNode(hovered)
        if (!map || !map.has(selected)) {
            this.chartDelegate.clearChart()
            return
        }
        const filtered = new Map([[selected, map.get(selected)]])
        this.chartDelegate.renderCoordinateMap(filtered)
    }

    /** Called by the facade when the chart is re-shown. */
    refreshForVisibilityChange() {
        this.render()
    }

    destroy() {
        for (const unsub of this.unsubscribes) unsub()
        this.unsubscribes = []
        this.hoveredNodeId = null
        this.selectedCoordinateKey = null
    }
}
