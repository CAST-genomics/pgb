import eventBus from './utils/eventBus.js';
import { pclaiCoordinateService } from './pclaiCoordinateService.js';
import { Draggable } from './utils/draggable.js';

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
        this.isVisible = false;
        this.currentNodeId = null;
        this.globalBoundingBox = null;
        this.eventUnsubscribe = null;
        this.dotSizePercent = 0.5; // Percentage of maximum available dimension (width or height)
        this.chartPadding = 20; // Padding in pixels
        this.isInitialized = false;
        this.draggable = null;

        this.createChartDOM();
        this.draggable = new Draggable(this.chartContainer);
        this.subscribeToNodeHover();

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

        if (!container.querySelector('.card-body')) {
            const body = document.createElement('div');
            body.className = 'card-body';
            const surface = document.createElement('div');
            surface.id = 'pca-chart-surface';
            surface.className = 'pca-chart__surface';
            body.appendChild(surface);
            container.appendChild(body);
        }

        this.chartSurface = document.getElementById('pca-chart-surface');
    }

    /**
     * Subscribe to node hover events
     */
    subscribeToNodeHover() {
        // Subscribe to lineIntersection events (node hover)
        const lineIntersectionUnsub = eventBus.subscribe('lineIntersection', (data) => {
            if (!data || !data.nodeName) {
                this.clearChart();
                return;
            }
            this.updateChartForNode(data.nodeName);
        });

        // Subscribe to clearIntersection events (mouse away from node)
        const clearIntersectionUnsub = eventBus.subscribe('clearIntersection', () => {
            this.clearChart();
        });

        // Store unsubscribe function that unsubscribes from both
        this.eventUnsubscribe = () => {
            lineIntersectionUnsub();
            clearIntersectionUnsub();
        };
    }

    /**
     * Initialize global bounding box by traversing all nodes
     */
    initializeGlobalBoundingBox() {
        this.globalBoundingBox = null;
        this.isInitialized = false;

        const allXCoords = [];
        const allYCoords = [];

        // Get all node IDs that have coordinates
        const nodeIds = pclaiCoordinateService.getAllNodeIds();

        if (nodeIds.length === 0) {
            console.warn('PCAChartService: No nodes with coordinates found');
            return;
        }

        // Traverse all nodes and collect all coordinates
        for (const nodeId of nodeIds) {
            const coordinatesMap = pclaiCoordinateService.getCoordinatesForNode(nodeId);
            if (!coordinatesMap) continue;

            for (const [assemblyKey, assemblyData] of coordinatesMap) {
                const [x, y] = assemblyData.coordinates;
                allXCoords.push(x);
                allYCoords.push(y);
            }
        }

        if (allXCoords.length === 0 || allYCoords.length === 0) {
            console.warn('PCAChartService: No valid coordinates found');
            return;
        }

        // Calculate global min/max
        const minX = Math.min(...allXCoords);
        const maxX = Math.max(...allXCoords);
        const minY = Math.min(...allYCoords);
        const maxY = Math.max(...allYCoords);

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

        // Use requestAnimationFrame to ensure DOM is ready, then read CSS variables
        requestAnimationFrame(() => {
            const computedStyle = window.getComputedStyle(this.chartContainer);
            
            // Extract CSS custom property values
            const cardWidth = parseFloat(computedStyle.getPropertyValue('--pca-chart-card-width')) || 400;
            const cardHeight = parseFloat(computedStyle.getPropertyValue('--pca-chart-card-height')) || 400;
            const headerHeight = parseFloat(computedStyle.getPropertyValue('--pca-chart-header-height')) || 60;
            
            // Calculate square surface dimensions
            const availableDimension = cardHeight - headerHeight;
            const surfaceWidth = availableDimension;
            const surfaceHeight = availableDimension;

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

        this.isInitialized = true;

        console.log(`PCAChartService: Initialized global bounding box - x: [${dataBounds.x.min.toFixed(3)}, ${dataBounds.x.max.toFixed(3)}], y: [${dataBounds.y.min.toFixed(3)}, ${dataBounds.y.max.toFixed(3)}]`);
        console.log(`PCAChartService: Surface dimensions: ${surfaceWidth.toFixed(1)} x ${surfaceHeight.toFixed(1)}px`);
    }

    /**
     * Update chart for a specific node
     * @param {string} nodeId - The node identifier
     */
    updateChartForNode(nodeId) {
        if (!this.isInitialized) {
            console.warn('PCAChartService: Not initialized. Call initializeGlobalBoundingBox() first.');
            return;
        }

        const coordinatesMap = pclaiCoordinateService.getCoordinatesForNode(nodeId);
        if (!coordinatesMap || coordinatesMap.size === 0) {
            this.clearChart();
            return;
        }

        this.currentNodeId = nodeId;
        this.renderDots(coordinatesMap, this.globalBoundingBox);
    }

    /**
     * Render dots on chart surface
     * @param {Map} coordinatesMap - Map of assemblyKey -> coordinateData
     * @param {Object} globalBoundingBox - Global bounding box
     */
    renderDots(coordinatesMap, globalBoundingBox) {
        if (!this.chartSurface) {
            console.error('PCAChartService: Chart surface not found');
            return;
        }

        // Clear existing dots
        this.chartSurface.innerHTML = '';

        // Validate ranges (handle division by zero)
        if (globalBoundingBox.x.range === 0 || globalBoundingBox.y.range === 0) {
            console.warn('PCAChartService: Invalid bounding box ranges (division by zero)');
            return;
        }

        // Calculate dot size as percentage of maximum available dimension
        const dotSizePx = (globalBoundingBox.maxAvailableDimension * this.dotSizePercent / 100);
        const halfDotSize = dotSizePx / 2;

        // Use DocumentFragment for batch DOM updates
        const fragment = document.createDocumentFragment();

        for (const [assemblyKey, assemblyData] of coordinatesMap) {
            const [x, y] = assemblyData.coordinates;
            const color = assemblyData.color;

            // Scale coordinates to fit within available pixel space
            // Map data coordinates [minX, maxX] -> [padding, surfaceWidth - padding]
            const scaledX = (x - globalBoundingBox.x.min) / globalBoundingBox.x.range * 
                          globalBoundingBox.availableWidth + this.chartPadding;
            const scaledY = (y - globalBoundingBox.y.min) / globalBoundingBox.y.range * 
                          globalBoundingBox.availableHeight + this.chartPadding;

            // Clamp values to chart bounds
            const clampedX = Math.max(halfDotSize, Math.min(scaledX, globalBoundingBox.surfaceWidth - halfDotSize));
            const clampedY = Math.max(halfDotSize, Math.min(scaledY, globalBoundingBox.surfaceHeight - halfDotSize));

            // Create dot element
            const dot = document.createElement('div');
            dot.className = 'pca-chart__dot';
            dot.style.position = 'absolute';
            dot.style.left = `${clampedX - halfDotSize}px`;
            dot.style.top = `${clampedY - halfDotSize}px`;
            dot.style.width = `${dotSizePx}px`;
            dot.style.height = `${dotSizePx}px`;
            dot.style.backgroundColor = color;
            dot.style.borderRadius = '50%';
            dot.style.border = '1px solid transparent';
            dot.style.cursor = 'pointer';
            dot.style.transition = 'border-color 0.2s ease, border-width 0.2s ease, z-index 0.2s ease';

            // Add hover effect
            dot.addEventListener('mouseenter', () => {
                dot.style.borderColor = '#333';
                dot.style.borderWidth = '2px';
                dot.style.zIndex = '10';
            });

            dot.addEventListener('mouseleave', () => {
                dot.style.borderColor = 'transparent';
                dot.style.borderWidth = '1px';
                dot.style.zIndex = '1';
            });

            fragment.appendChild(dot);
        }

        this.chartSurface.appendChild(fragment);
    }

    /**
     * Clear chart dots
     */
    clearChart() {
        if (this.chartSurface) {
            this.chartSurface.innerHTML = '';
        }
        this.currentNodeId = null;
    }

    /**
     * Reset service for new dataset
     */
    reset() {
        this.clearChart();
        this.isInitialized = false;
        this.globalBoundingBox = null;
        this.currentNodeId = null;
    }

    /**
     * Show chart
     */
    showChart() {
        if (this.chartContainer) {
            this.chartContainer.style.display = 'block';
            this.isVisible = true;
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
        if (this.isVisible) {
            this.hideChart();
        } else {
            this.showChart();
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
        if (this.eventUnsubscribe) {
            this.eventUnsubscribe();
            this.eventUnsubscribe = null;
        }
        if (this.chartContainer && this.chartContainer.parentNode) {
            this.chartContainer.parentNode.removeChild(this.chartContainer);
        }
        this.chartContainer = null;
        this.chartSurface = null;
    }

    /**
     * Get the singleton instance
     * @returns {PCAChartService} The singleton instance
     */
    static getInstance() {
        if (!PCAChartService.instance) {
            PCAChartService.instance = new PCAChartService();
        }
        return PCAChartService.instance;
    }
}

// Create and export the singleton instance
const pcaChartService = new PCAChartService();

export { PCAChartService, pcaChartService };

