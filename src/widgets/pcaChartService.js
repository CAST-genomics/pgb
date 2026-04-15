import eventBus from '../utils/eventBus.ts';
import { pclaiCoordinateService } from './pclaiCoordinateService.js';
import { Draggable } from '../utils/draggable.js';
import { PcaCoordinateSpace } from './pcaCoordinateSpace.js';
import { PcaChart } from './pcaChart.js';
import { PcaChartController } from './pcaChartController.js';

/**
 * PCAChartService - Manages and renders PCA chart visualization
 * Displays dots on a div-based chart when users hover over nodes in the pangenome graph.
 * Uses a single global coordinate space for all nodes.
 * Implemented as a singleton to ensure single instance across the application.
 */
class PCAChartService {
    constructor(containerId = 'pca-chart-container') {
        if (PCAChartService.instance) {
            return PCAChartService.instance;
        }

        this.containerId = containerId;
        this.chartContainer = null;
        this.chartSurface = null;
        this.referenceDotsContainer = null; // Separate container for reference dots
        this.horizontalAxis = null; // Horizontal axis line element
        this.verticalAxis = null; // Vertical axis line element
        this.isVisible = false;
        this.globalBoundingBox = null;
        this.eventUnsubscribes = []; // Array to store all unsubscribe functions
        // Phase 3a of #46: interaction state (currentNodeId, selectedCoordinateKey)
        // and event subscriptions move to PcaChartController.
        this.controller = new PcaChartController({
            isVisible: () => this.isVisible,
            isInitialized: () => this.isInitialized,
            clearChart: () => this.clearChart(),
            renderCoordinateMap: (map) => this.renderDots(map, this.globalBoundingBox),
            restoreReferenceDots: () => this.restoreReferenceDots(),
        });
        this.dotSizePercent = 1; // Percentage of maximum available dimension (width or height)
        this.chartPadding = 20; // Padding in pixels
        this.isInitialized = false;
        this.draggable = null;
        this.referenceData = []; // Array of {x: number, y: number, color: string} for reference PCA data
        this.referenceDataPromise = null; // Promise for reference data loading
        this.button = null; // Reference to the PCA Chart button

        // Opacity constants for emphasis/de-emphasis (all controlled via JavaScript inline styles)
        this.OPACITY_FULL = 1.0; // Full opacity (still used for the reference container init)

        this.createChartDOM();
        this.createButton();
        this.draggable = new Draggable(this.chartContainer);
        this.controller.start();
        this.subscribeToDatasetLoad();
        this.referenceDataPromise = this.loadReferenceData(); // Load reference data asynchronously, store promise

        PCAChartService.instance = this;
    }

    /**
     * Create chart DOM structure
     */
    createChartDOM() {
        // Check if container already exists
        let container = document.getElementById(this.containerId);
        if (!container) {
            // Create container and append to body
            container = document.createElement('div');
            container.id = this.containerId;
            container.className = 'pca-chart__card card position-absolute';
            container.style.display = 'none';
            document.body.appendChild(container);
        }

        this.chartContainer = container;

        // Create card structure
        if (!container.querySelector('.card-header')) {
            const header = document.createElement('div');
            header.className = 'card-header';
            const title = document.createElement('h5');
            title.className = 'card-title mb-0';
            title.textContent = 'PCA Chart';
            header.appendChild(title);
            container.appendChild(header);
        }

        // Ensure card-body exists
        let body = container.querySelector('.card-body');
        if (!body) {
            body = document.createElement('div');
            body.className = 'card-body';
            container.appendChild(body);
        }

        // Ensure chart surface exists
        let surface = document.getElementById('pca-chart-surface');
        if (!surface) {
            surface = document.createElement('div');
            surface.id = 'pca-chart-surface';
            surface.className = 'pca-chart__surface';
            body.appendChild(surface);
        }

        // Ensure reference dots container exists as child of surface
        let referenceContainer = document.getElementById('pca-chart-reference-dots');
        if (!referenceContainer) {
            referenceContainer = document.createElement('div');
            referenceContainer.id = 'pca-chart-reference-dots';
            referenceContainer.className = 'pca-chart__reference-dots';
            referenceContainer.style.opacity = this.OPACITY_FULL; // Initialize with full opacity (controlled via JavaScript)
            surface.appendChild(referenceContainer);
        } else {
            // Ensure existing container has opacity set (controlled via JavaScript)
            referenceContainer.style.opacity = this.OPACITY_FULL;
        }

        // Ensure axes exist
        let horizontalAxis = document.getElementById('pca-chart-axis-horizontal');
        if (!horizontalAxis) {
            horizontalAxis = document.createElement('div');
            horizontalAxis.id = 'pca-chart-axis-horizontal';
            horizontalAxis.className = 'pca-chart__axis pca-chart__axis--horizontal';
            surface.appendChild(horizontalAxis);
        }

        let verticalAxis = document.getElementById('pca-chart-axis-vertical');
        if (!verticalAxis) {
            verticalAxis = document.createElement('div');
            verticalAxis.id = 'pca-chart-axis-vertical';
            verticalAxis.className = 'pca-chart__axis pca-chart__axis--vertical';
            surface.appendChild(verticalAxis);
        }

        if (!container.querySelector('.card-footer')) {
            const footer = document.createElement('div');
            footer.className = 'card-footer pca-chart__footer';
            container.appendChild(footer);
        }

        // Store references to DOM elements
        this.chartSurface = surface;
        this.referenceDotsContainer = referenceContainer;
        this.horizontalAxis = horizontalAxis;
        this.verticalAxis = verticalAxis;
    }

    /**
     * Create and wire up the PCA Chart button in the navbar
     */
    createButton() {

        // Find the navbar nav container where buttons are placed
        const navbarNav = document.querySelector('.navbar-nav.ms-auto');
        if (!navbarNav) {
            console.warn('PCAChartService: Could not find navbar-nav container for button');
            return;
        }

        // Create the button
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-outline-secondary';
        button.id = 'pca-chart-button';
        button.textContent = 'PCA Chart';
        button.disabled = true; // Initially disabled until dataset with PCLAI data is loaded

        button.addEventListener('click', () => {
            this.toggleChart();
        });

        // Store button reference
        this.button = button;

        // Insert button before the info button (if it exists) or at the end
        const infoButton = document.getElementById('info-button');
        if (infoButton && infoButton.parentNode === navbarNav) {
            navbarNav.insertBefore(button, infoButton);
        } else {
            navbarNav.appendChild(button);
        }
    }

    /**
     * Subscribe to node hover events
     */
    /** Backwards-compatible accessor used by app.ts. Forwards to controller. */
    get selectedCoordinateKey() {
        return this.controller.selectedCoordinateKey;
    }

    /**
     * Subscribe to dataset load events
     */
    subscribeToDatasetLoad() {
        const datasetLoadedUnsub = eventBus.subscribe('datasetLoaded', (data) => {
            // Update button state based on whether PCLAI data is available
            this.updateButtonState();

            // If chart is visible but new dataset doesn't have PCLAI data, hide the chart
            if (this.isVisible && !pclaiCoordinateService.hasPCLAIData()) {
                this.hideChart();

                // const nodeSet = app.geometryManager.geometryFactory.getNodeNameSet();
                // const edgeSet = app.geometryManager.geometryFactory.getEdgeNameSet();
                // eventBus.publish('pcaChart:normal', { nodeSet, edgeSet });

            } else if (this.isVisible && pclaiCoordinateService.hasPCLAIData()) {

                // Chart is visible and new dataset has PCLAI data, update emphasis
                // app.setActiveScene('nodeEmphasisScene', true);
                // const nodeSet = new Set(pclaiCoordinateService.getNodeIdsWithPCLAICoordinates());
                // const edgeSet = new Set();
                // eventBus.publish('pcaChart:emphasis', { assembly:{ name: 'unnamed' }, nodeSet, edgeSet });

            }
        });

        // Store unsubscribe function
        this.eventUnsubscribes.push(datasetLoadedUnsub);
    }

    /**
     * Subscribe to PCA widget events
     */
    /**
     * Update button enabled/disabled state based on PCLAI data availability
     */
    updateButtonState() {
        if (this.button) {
            const hasData = pclaiCoordinateService.hasPCLAIData();
            this.button.disabled = !hasData;
            if (!hasData) {
                // If button is disabled and chart is visible, hide the chart
                if (this.isVisible) {
                    this.hideChart();
                }
            }
        }
    }

    /**
     * Load reference PCA data from TSV file
     * Parses hprc-reference-pca.tsv and stores as array of {x, y, color} objects
     */
    async loadReferenceData() {
        try {
            const response = await fetch('/datasets/hprc-reference-pca.tsv');
            if (!response.ok) {
                console.warn('PCAChartService: Failed to load reference PCA data:', response.statusText);
                return;
            }

            const text = await response.text();
            const lines = text.trim().split('\n');

            // Skip header row (first line)
            const dataLines = lines.slice(1);

            this.referenceData = [];

            for (const line of dataLines) {
                if (!line.trim()) continue; // Skip empty lines

                const columns = line.split('\t');
                if (columns.length < 3) continue; // Skip malformed lines

                const x = parseFloat(columns[0]);
                const y = parseFloat(columns[1]);
                const rgbString = columns[2].trim();

                // Skip invalid coordinates
                if (isNaN(x) || isNaN(y)) continue;

                // Parse RGB tuple string: "(r, g, b)" where r, g, b are floats 0-1
                // Convert to HTML color string: "rgb(r, g, b)" where r, g, b are integers 0-255
                const rgbMatch = rgbString.match(/\(([\d.]+),\s*([\d.]+),\s*([\d.]+)\)/);
                if (!rgbMatch) continue;

                const r = Math.round(parseFloat(rgbMatch[1]) * 255);
                const g = Math.round(parseFloat(rgbMatch[2]) * 255);
                const b = Math.round(parseFloat(rgbMatch[3]) * 255);

                const color = `rgb(${r}, ${g}, ${b})`;

                this.referenceData.push({ x, y, color });
            }

            console.log(`PCAChartService: Loaded ${this.referenceData.length} reference PCA data points`);
        } catch (error) {
            console.warn('PCAChartService: Error loading reference PCA data:', error);
            this.referenceData = []; // Ensure it's an empty array on error
        }
    }

    /**
     * Initialize global bounding box by traversing all nodes
     * Ensures reference data is loaded before calculating bounding box
     */
    async initializeGlobalBoundingBox() {
        this.globalBoundingBox = null;
        this.isInitialized = false;

        // Ensure reference data is loaded before proceeding
        if (this.referenceDataPromise) {
            await this.referenceDataPromise;
        }

        // Start from the dataset bbox computed in the parser; widen it with
        // reference data (which lives outside the dataset).
        const datasetBbox = pclaiCoordinateService.getBoundingBox();

        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;

        if (datasetBbox) {
            minX = datasetBbox.x.min; maxX = datasetBbox.x.max;
            minY = datasetBbox.y.min; maxY = datasetBbox.y.max;
        }

        for (const refPoint of this.referenceData) {
            if (refPoint.x < minX) minX = refPoint.x;
            if (refPoint.x > maxX) maxX = refPoint.x;
            if (refPoint.y < minY) minY = refPoint.y;
            if (refPoint.y > maxY) maxY = refPoint.y;
        }

        if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
            console.warn('PCAChartService: No valid coordinates found');
            return;
        }

        const xRange = maxX - minX;
        const yRange = maxY - minY;

        // Get actual pixel dimensions of chart surface
        // Use requestAnimationFrame to ensure DOM is rendered and dimensions are accurate
        if (!this.chartSurface) {
            console.warn('PCAChartService: Chart surface not found during initialization');
            return;
        }

        // Store data ranges first
        const dataBounds = {
            x: {
                min: minX,
                max: maxX,
                centroid: (minX + maxX) / 2,
                range: xRange
            },
            y: {
                min: minY,
                max: maxY,
                centroid: (minY + maxY) / 2,
                range: yRange
            }
        };

        // Get pixel dimensions from CSS custom properties (single source of truth)
        // Read dimensions from the computed styles of the chart container
        if (!this.chartContainer) {
            console.warn('PCAChartService: Chart container not found during initialization');
            return;
        }

        // Read surface size directly from CSS custom property (single source of truth)
        if (!this.chartContainer) {
            console.warn('PCAChartService: Chart container not found during initialization');
            return;
        }

        // Use requestAnimationFrame to ensure DOM is ready and CSS is applied
        requestAnimationFrame(() => {
            const computedStyle = window.getComputedStyle(this.chartContainer);

            // Read surface size directly from CSS custom property (single source of truth)
            // Surface is square, so we only need one dimension
            const surfaceSize = parseFloat(computedStyle.getPropertyValue('--pca-chart-surface-size')) || 448;
            const surfaceWidth = surfaceSize;
            const surfaceHeight = surfaceSize;

            this.finishInitialization(dataBounds, surfaceWidth, surfaceHeight);
        });

    }

    /**
     * Complete initialization with pixel dimensions
     * @private
     */
    finishInitialization(dataBounds, surfaceWidth, surfaceHeight) {
        // Calculate available space for data (accounting for padding)
        const availableWidth = surfaceWidth - (2 * this.chartPadding);
        const availableHeight = surfaceHeight - (2 * this.chartPadding);
        const maxAvailableDimension = Math.max(availableWidth, availableHeight);

        // Store global bounding box with data ranges and pixel dimensions
        this.globalBoundingBox = {
            ...dataBounds,
            // Pixel dimensions for scaling
            surfaceWidth: surfaceWidth,
            surfaceHeight: surfaceHeight,
            availableWidth: availableWidth,
            availableHeight: availableHeight,
            maxAvailableDimension: maxAvailableDimension
        };

        // Phase 2 of PCA triangle refactor (issue #46): projection math and
        // dot DOM are delegated to PcaCoordinateSpace + PcaChart. The service
        // still owns card chrome, axes, reference-data fetch, and event wiring.
        this.coordinateSpace = new PcaCoordinateSpace(
            dataBounds,
            surfaceWidth,
            surfaceHeight,
            this.chartPadding,
            this.dotSizePercent,
        );
        if (this.pcaChart) {
            this.pcaChart.setCoordinateSpace(this.coordinateSpace);
        } else {
            this.pcaChart = new PcaChart({
                chartSurface: this.chartSurface,
                referenceDotsContainer: this.referenceDotsContainer,
                horizontalAxis: this.horizontalAxis,
                verticalAxis: this.verticalAxis,
                coordinateSpace: this.coordinateSpace,
            });
            this.pcaChart.updateAxes();
        }

        this.isInitialized = true;

        console.log(`PCAChartService: Initialized global bounding box - x: [${dataBounds.x.min.toFixed(3)}, ${dataBounds.x.max.toFixed(3)}], y: [${dataBounds.y.min.toFixed(3)}, ${dataBounds.y.max.toFixed(3)}]`);
        console.log(`PCAChartService: Surface dimensions: ${surfaceWidth.toFixed(1)} x ${surfaceHeight.toFixed(1)}px`);

        // Reference dots will be rendered when chart is shown, not during initialization
    }

    /**
     * Render reference dots. Ensures the container exists (lazily) and
     * delegates to PcaChart.
     */
    renderReferenceDots() {
        // Ensure reference dots container exists
        if (!this.referenceDotsContainer) {
            this.referenceDotsContainer = document.getElementById('pca-chart-reference-dots');
            if (!this.referenceDotsContainer && this.chartSurface) {
                const referenceContainer = document.createElement('div');
                referenceContainer.id = 'pca-chart-reference-dots';
                referenceContainer.className = 'pca-chart__reference-dots';
                referenceContainer.style.opacity = this.OPACITY_FULL;
                this.chartSurface.appendChild(referenceContainer);
                this.referenceDotsContainer = referenceContainer;
            }
        }

        if (!this.referenceDotsContainer) {
            console.error('PCAChartService: Reference dots container not found and could not be created');
            return;
        }

        this.referenceDotsContainer.style.opacity = this.OPACITY_FULL;

        if (!this.referenceData || this.referenceData.length === 0) {
            console.warn('PCAChartService: No reference data available to render');
            return;
        }

        // Keep PcaChart's container reference in sync (lazily created above).
        this.pcaChart.referenceDotsContainer = this.referenceDotsContainer;
        this.pcaChart.renderReferenceDots(this.referenceData);
    }

    /**
     * Render dataset dots by delegating to PcaChart.
     * @param {Map} coordinatesMap
     */
    renderDots(coordinatesMap) {
        if (!coordinatesMap || coordinatesMap.size === 0) return;
        this.pcaChart.renderDots(coordinatesMap);
    }

    /**
     * Clear chart dots and restore reference dots. Delegates to PcaChart.
     */
    clearChart() {
        if (this.pcaChart) {
            this.pcaChart.clearChart();
        }
        this.controller.currentNodeId = null;
    }

    /**
     * Restore reference dots — thin forward so the controller delegate
     * can reach the chart without a direct PcaChart reference (phase 3c
     * removes this indirection).
     */
    restoreReferenceDots() {
        if (this.pcaChart) this.pcaChart.restoreReferenceDots();
    }

    /**
     * Reset service for new dataset
     */
    reset() {
        this.clearChart();
        this.isInitialized = false;
        this.globalBoundingBox = null;
        this.controller.currentNodeId = null;
    }

    /**
     * Show chart
     */
    showChart() {
        console.log('PCAChartService: showChart()');

        if (this.chartContainer) {
            this.chartContainer.style.display = 'block';
            this.isVisible = true;

            // Render reference dots when chart is shown (if not already rendered)
            if (this.isInitialized && this.globalBoundingBox) {

                this.pcaChart.updateAxes();

                // Check if reference dots already exist in DOM
                const existingDots = this.referenceDotsContainer?.querySelectorAll('.pca-chart__reference-dot');
                if (!existingDots || existingDots.length === 0) {
                    this.renderReferenceDots();
                }

                // If a coordinate key is selected, re-render through the controller
                this.controller.refreshForVisibilityChange();
            } else {
                console.warn('PCAChartService: showChart() - not initialized or missing bounding box - do not render dots', { isInitialized: this.isInitialized, hasBoundingBox: !!this.globalBoundingBox });
            }
        }
    }

    /**
     * Hide chart
     */
    hideChart() {
        if (this.chartContainer) {
            this.chartContainer.style.display = 'none';
            this.isVisible = false;
        }
    }

    /**
     * Toggle chart visibility
     * @returns {boolean} New visibility state
     */
    toggleChart() {
        // Safety check: don't toggle if no PCLAI data is available
        if (!pclaiCoordinateService.hasPCLAIData()) {
            console.warn('PCAChartService: Cannot toggle chart - no PCLAI data available');
            return this.isVisible;
        }

        if (this.isVisible) {

            this.hideChart();

            // const nodeSet = app.geometryManager.geometryFactory.getNodeNameSet()
            // const edgeSet = app.geometryManager.geometryFactory.getEdgeNameSet()
            // eventBus.publish('pcaChart:normal', { nodeSet, edgeSet })

        } else {

            // app.setActiveScene('nodeEmphasisScene', true)
            //
            // const nodeSet = new Set(pclaiCoordinateService.getNodeIdsWithPCLAICoordinates())
            // const edgeSet = new Set()
            // eventBus.publish('pcaChart:emphasis', { assembly:{ name: 'unnamed' }, nodeSet, edgeSet })

            this.showChart()

        }
        return this.isVisible;
    }

    /**
     * Dispose of service
     */
    dispose() {
        if (this.draggable) {
            this.draggable.destroy();
            this.draggable = null;
        }
        // Unsubscribe from all events
        this.eventUnsubscribes.forEach(unsub => unsub());
        this.eventUnsubscribes = [];
        this.controller.destroy();
        if (this.chartContainer && this.chartContainer.parentNode) {
            this.chartContainer.parentNode.removeChild(this.chartContainer);
        }
        this.chartContainer = null;
        this.chartSurface = null;
    }
}

// Create and export the singleton instance
const pcaChartService = new PCAChartService();

export { PCAChartService, pcaChartService };

