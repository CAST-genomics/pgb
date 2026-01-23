import eventBus from '../utils/eventBus.js';
import { pclaiCoordinateService } from './pclaiCoordinateService.js';
import { Draggable } from '../utils/draggable.js';

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
        this.currentNodeId = null;
        this.globalBoundingBox = null;
        this.eventUnsubscribes = []; // Array to store all unsubscribe functions
        this.selectedCoordinateKey = null; // Track selected coordinate key from PCA widget
        this.dotSizePercent = 1; // Percentage of maximum available dimension (width or height)
        this.chartPadding = 20; // Padding in pixels
        this.isInitialized = false;
        this.draggable = null;
        this.referenceData = []; // Array of {x: number, y: number, color: string} for reference PCA data
        this.referenceDataPromise = null; // Promise for reference data loading
        this.button = null; // Reference to the PCA Chart button
        
        // Opacity constants for emphasis/de-emphasis (all controlled via JavaScript inline styles)
        this.OPACITY_FULL = 1.0; // Full opacity
        this.OPACITY_REFERENCE_DEEMPHASIZED = 0.25; // Reference dots when dataset dots shown
        this.OPACITY_DATASET_DEEMPHASIZED = 0.05; // Dataset dots when another dot is hovered (reduced further for grayscale effect)
        
        // Size multiplier for emphasis
        this.EMPHASIS_SIZE_MULTIPLIER = 1.5; // Increase dot size by 50% when hovered

        this.createChartDOM();
        this.createButton();
        this.draggable = new Draggable(this.chartContainer);
        this.subscribeToNodeHover();
        this.subscribeToDatasetLoad();
        this.subscribeToPCAWidgetEvents();
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
            // Clear the current node ID since mouse is no longer over a node
            this.currentNodeId = null;
            
            // Clear dataset dots only (reference dots are in separate container and unaffected)
            // If a coordinate key is selected, show all dots for that key instead of clearing
            if (this.selectedCoordinateKey && this.isVisible) {
                this.renderAllDotsForCoordinateKey(this.selectedCoordinateKey);
            } else {
                this.clearChart();
            }
        });

        // Store unsubscribe functions
        this.eventUnsubscribes.push(lineIntersectionUnsub);
        this.eventUnsubscribes.push(clearIntersectionUnsub);
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
    subscribeToPCAWidgetEvents() {
        // Subscribe to pcaWidget:emphasis events
        const pcaWidgetEmphasisUnsub = eventBus.subscribe('pcaWidget:emphasis', (data) => {
            // Store the selected coordinate key for filtering chart dots
            const { assembly } = data;
            this.selectedCoordinateKey = assembly.name;
            
            if (this.isVisible) {
                if (this.currentNodeId) {
                    // Node is hovered - show that node's dots filtered by coordinate key
                    this.updateChartForNode(this.currentNodeId);
                } else {
                    // No node hovered - show all dots for selected coordinate key
                    this.renderAllDotsForCoordinateKey(this.selectedCoordinateKey);
                }
            }
        });

        // Subscribe to pcaWidget:normal events
        const pcaWidgetNormalUnsub = eventBus.subscribe('pcaWidget:normal', (data) => {
            // Clear the selected coordinate key to show all dots again
            this.selectedCoordinateKey = null;
            
            if (this.isVisible) {
                // Always restore reference dots immediately when coordinate key is deselected
                this.restoreReferenceDots();
                
                if (this.currentNodeId) {
                    // Node is hovered - show all dots for that node (unfiltered)
                    this.updateChartForNode(this.currentNodeId);
                } else {
                    // No node hovered - clear dataset dots, restore reference dots opacity
                    this.clearChart();
                }
            }
        });

        // Store unsubscribe functions
        this.eventUnsubscribes.push(pcaWidgetEmphasisUnsub);
        this.eventUnsubscribes.push(pcaWidgetNormalUnsub);
    }

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
            const response = await fetch('/hprc-project/hprc-reference-pca.tsv');
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

        const allXCoords = [];
        const allYCoords = [];

        // Get all node IDs that have coordinates
        const nodeIds = pclaiCoordinateService.getNodeIdsWithPCLAICoordinates();

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

        // Also include reference data coordinates in bounding box calculation
        for (const refPoint of this.referenceData) {
            allXCoords.push(refPoint.x);
            allYCoords.push(refPoint.y);
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

        this.isInitialized = true;

        console.log(`PCAChartService: Initialized global bounding box - x: [${dataBounds.x.min.toFixed(3)}, ${dataBounds.x.max.toFixed(3)}], y: [${dataBounds.y.min.toFixed(3)}, ${dataBounds.y.max.toFixed(3)}]`);
        console.log(`PCAChartService: Surface dimensions: ${surfaceWidth.toFixed(1)} x ${surfaceHeight.toFixed(1)}px`);

        // Position axes at origin (0,0)
        this.updateAxes();

        // Reference dots will be rendered when chart is shown, not during initialization
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

        let coordinatesMap = pclaiCoordinateService.getCoordinatesForNode(nodeId);
        if (!coordinatesMap || coordinatesMap.size === 0) {
            this.clearChart();
            return;
        }

        // Filter coordinate map by selected coordinate key if one is set
        if (this.selectedCoordinateKey) {
            if (coordinatesMap.has(this.selectedCoordinateKey)) {
                // Create filtered map with only the selected coordinate key
                coordinatesMap = new Map([[this.selectedCoordinateKey, coordinatesMap.get(this.selectedCoordinateKey)]]);
            } else {
                // Node doesn't have the selected coordinate key, clear the chart
                this.clearChart();
                return;
            }
        }

        this.currentNodeId = nodeId;
        this.renderDots(coordinatesMap, this.globalBoundingBox);
    }

    /**
     * Update axis positions based on origin (0,0) in data coordinate space
     * Uses bbox.surfaceWidth and bbox.surfaceHeight which are the actual rendered dimensions
     * from CSS (single source of truth)
     */
    updateAxes() {
        if (!this.isInitialized || !this.globalBoundingBox) {
            return;
        }

        const bbox = this.globalBoundingBox;

        // Calculate where (0,0) maps to in pixel coordinates
        // Using the same scaling logic as renderDots
        const originX = (0 - bbox.x.min) / bbox.x.range * bbox.availableWidth + this.chartPadding;
        const originY = (0 - bbox.y.min) / bbox.y.range * bbox.availableHeight + this.chartPadding;

        // Position horizontal axis (1px tall, full width of surface)
        // bbox.surfaceWidth is the actual rendered dimension from CSS (single source of truth)
        if (this.horizontalAxis) {
            this.horizontalAxis.style.position = 'absolute';
            this.horizontalAxis.style.left = '0px';
            this.horizontalAxis.style.top = `${originY}px`;
            this.horizontalAxis.style.width = `${bbox.surfaceWidth}px`;
            this.horizontalAxis.style.height = '1px';
            this.horizontalAxis.style.backgroundColor = '#000';
            this.horizontalAxis.style.pointerEvents = 'none';
            this.horizontalAxis.style.zIndex = '0'; // Below dots so dots occlude axes
        }

        // Position vertical axis (1px wide, full height of surface)
        // bbox.surfaceHeight is the actual rendered dimension from CSS (single source of truth)
        if (this.verticalAxis) {
            this.verticalAxis.style.position = 'absolute';
            this.verticalAxis.style.left = `${originX}px`;
            this.verticalAxis.style.top = '0px';
            this.verticalAxis.style.width = '1px';
            this.verticalAxis.style.height = `${bbox.surfaceHeight}px`;
            this.verticalAxis.style.backgroundColor = '#000';
            this.verticalAxis.style.pointerEvents = 'none';
            this.verticalAxis.style.zIndex = '0'; // Below dots so dots occlude axes
        }
    }

    /**
     * Render reference dots in separate container (isolated from hover behavior)
     * @param {Object} globalBoundingBox - Global bounding box
     */
    renderReferenceDots(globalBoundingBox) {
        console.log('PCAChartService: renderReferenceDots() called', {
            hasContainer: !!this.referenceDotsContainer,
            hasChartSurface: !!this.chartSurface,
            referenceDataLength: this.referenceData?.length,
            boundingBox: globalBoundingBox
        });

        // Ensure reference dots container exists
        if (!this.referenceDotsContainer) {
            // Try to find it again
            this.referenceDotsContainer = document.getElementById('pca-chart-reference-dots');
            if (!this.referenceDotsContainer && this.chartSurface) {
                // Create it if it doesn't exist
                const referenceContainer = document.createElement('div');
                referenceContainer.id = 'pca-chart-reference-dots';
                referenceContainer.className = 'pca-chart__reference-dots';
                referenceContainer.style.opacity = this.OPACITY_FULL; // Initialize with full opacity (controlled via JavaScript)
                this.chartSurface.appendChild(referenceContainer);
                this.referenceDotsContainer = referenceContainer;
                console.log('PCAChartService: Created reference dots container');
            }
        }

        if (!this.referenceDotsContainer) {
            console.error('PCAChartService: Reference dots container not found and could not be created');
            return;
        }
        
        // Ensure reference dots container starts with full opacity (controlled via JavaScript)
        this.referenceDotsContainer.style.opacity = this.OPACITY_FULL;

        // Check if reference data is loaded
        if (!this.referenceData || this.referenceData.length === 0) {
            console.warn('PCAChartService: No reference data available to render', {
                referenceData: this.referenceData,
                length: this.referenceData?.length
            });
            return;
        }

        // Clear existing reference dots
        this.referenceDotsContainer.innerHTML = '';

        // Validate ranges (handle division by zero)
        if (globalBoundingBox.x.range === 0 || globalBoundingBox.y.range === 0) {
            console.warn('PCAChartService: Invalid bounding box ranges for reference dots (division by zero)', {
                xRange: globalBoundingBox.x.range,
                yRange: globalBoundingBox.y.range
            });
            return;
        }

        // Calculate dot size as percentage of maximum available dimension
        const dotSizePx = (globalBoundingBox.maxAvailableDimension * this.dotSizePercent / 100);
        const halfDotSize = dotSizePx / 2;

        // Use DocumentFragment for batch DOM updates
        const fragment = document.createDocumentFragment();

        console.log(`PCAChartService: Rendering ${this.referenceData.length} reference dots`, {
            container: this.referenceDotsContainer,
            containerExists: !!this.referenceDotsContainer,
            boundingBox: globalBoundingBox
        });

        // Render reference dots
        for (const refPoint of this.referenceData) {
            const { x, y, color } = refPoint;

            // Scale coordinates to fit within available pixel space
            const scaledX = (x - globalBoundingBox.x.min) / globalBoundingBox.x.range *
                          globalBoundingBox.availableWidth + this.chartPadding;
            const scaledY = (y - globalBoundingBox.y.min) / globalBoundingBox.y.range *
                          globalBoundingBox.availableHeight + this.chartPadding;

            // Clamp values to chart bounds
            const clampedX = Math.max(halfDotSize, Math.min(scaledX, globalBoundingBox.surfaceWidth - halfDotSize));
            const clampedY = Math.max(halfDotSize, Math.min(scaledY, globalBoundingBox.surfaceHeight - halfDotSize));

            // Create dot element with reference dot class
            const dot = document.createElement('div');
            dot.className = 'pca-chart__reference-dot';
            dot.style.position = 'absolute';
            dot.style.left = `${clampedX - halfDotSize}px`;
            dot.style.top = `${clampedY - halfDotSize}px`;
            dot.style.width = `${dotSizePx}px`;
            dot.style.height = `${dotSizePx}px`;
            dot.style.backgroundColor = color;
            dot.style.borderRadius = '50%';
            dot.style.border = '1px solid transparent';
            
            // Store original color for restoration after de-emphasis
            dot.dataset.originalColor = color;

            fragment.appendChild(dot);
        }

        this.referenceDotsContainer.appendChild(fragment);
        const renderedDots = this.referenceDotsContainer.querySelectorAll('.pca-chart__reference-dot');
        console.log(`PCAChartService: Successfully rendered ${this.referenceData.length} reference dots. DOM contains ${renderedDots.length} dot elements.`);
    }

    /**
     * Render dots from a coordinate data map (unified rendering helper)
     * @param {Map} coordinateDataMap - Map where keys can be assemblyKey or nodeId, values are {coordinates, rgbThreeJS, rgbString}
     * @param {Object} globalBoundingBox - Global bounding box
     * @private
     */
    renderDotsFromCoordinateDataMap(coordinateDataMap, globalBoundingBox) {
        if (!this.chartSurface) {
            console.error('PCAChartService: Chart surface not found');
            return;
        }

        // Validate ranges (handle division by zero)
        if (globalBoundingBox.x.range === 0 || globalBoundingBox.y.range === 0) {
            console.warn('PCAChartService: Invalid bounding box ranges (division by zero)');
            return;
        }

        // If no coordinates provided, return early
        if (!coordinateDataMap || coordinateDataMap.size === 0) {
            return;
        }

        // Calculate dot size as percentage of maximum available dimension
        const dotSizePx = (globalBoundingBox.maxAvailableDimension * this.dotSizePercent / 100);
        const halfDotSize = dotSizePx / 2;

        // Use DocumentFragment for batch DOM updates
        const fragment = document.createDocumentFragment();

        // Render dots (works for both assemblyKey->coordinateData and nodeId->coordinateData maps)
        for (const [key, coordinateData] of coordinateDataMap) {
            const [x, y] = coordinateData.coordinates;

            // Scale coordinates to fit within available pixel space
            // Map data coordinates [minX, maxX] -> [padding, surfaceWidth - padding]
            const scaledX = (x - globalBoundingBox.x.min) / globalBoundingBox.x.range * globalBoundingBox.availableWidth + this.chartPadding;
            const scaledY = (y - globalBoundingBox.y.min) / globalBoundingBox.y.range * globalBoundingBox.availableHeight + this.chartPadding;

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
            dot.style.backgroundColor = coordinateData.rgbString;
            dot.style.borderRadius = '50%';
            dot.style.border = '1px solid transparent';
            dot.style.opacity = this.OPACITY_FULL; // Initialize with full opacity (controlled via JavaScript)
            
            // Store original color for restoration after de-emphasis
            dot.dataset.originalColor = coordinateData.rgbString;
            
            // Add hover event listeners
            dot.addEventListener('mouseenter', () => this.handleDotHover(dot, dotSizePx, clampedX, clampedY));
            dot.addEventListener('mouseleave', () => this.handleDotLeave(dot, dotSizePx, clampedX, clampedY));

            fragment.appendChild(dot);
        }

        this.chartSurface.appendChild(fragment);
    }

    /**
     * Deemphasize reference dots by converting to grayscale and reducing opacity
     * @private
     */
    deemphasizeReferenceDots() {
        if (!this.referenceDotsContainer) return;
        
        const referenceDots = this.referenceDotsContainer.querySelectorAll('.pca-chart__reference-dot');
        referenceDots.forEach(dot => {
            // Store original color if not already stored
            if (!dot.dataset.originalColor) {
                dot.dataset.originalColor = dot.style.backgroundColor;
            }
            // Convert to grayscale and reduce opacity
            const grayscaleColor = this.rgbToGrayscale(dot.dataset.originalColor);
            dot.style.backgroundColor = grayscaleColor;
        });
        this.referenceDotsContainer.style.opacity = this.OPACITY_REFERENCE_DEEMPHASIZED;
    }

    /**
     * Restore reference dots to original colors and full opacity
     * @private
     */
    restoreReferenceDots() {
        if (!this.referenceDotsContainer) return;
        
        const referenceDots = this.referenceDotsContainer.querySelectorAll('.pca-chart__reference-dot');
        referenceDots.forEach(dot => {
            // Restore original color if stored
            if (dot.dataset.originalColor) {
                dot.style.backgroundColor = dot.dataset.originalColor;
            }
        });
        this.referenceDotsContainer.style.opacity = this.OPACITY_FULL;
    }

    /**
     * Render dataset dots on chart surface (reference dots are in separate container)
     * @param {Map} coordinatesMap - Map of assemblyKey -> coordinateData
     * @param {Object} globalBoundingBox - Global bounding box
     */
    renderDots(coordinatesMap, globalBoundingBox) {
        // Deemphasize reference dots when dataset dots are displayed (grayscale + reduced opacity)
        this.deemphasizeReferenceDots();

        // Clear existing dataset dots only (preserve reference dots container)
        // Remove only elements with class 'pca-chart__dot', not the reference container
        const datasetDots = this.chartSurface.querySelectorAll('.pca-chart__dot');
        datasetDots.forEach(dot => dot.remove());

        // Use unified rendering helper
        this.renderDotsFromCoordinateDataMap(coordinatesMap, globalBoundingBox);
    }

    /**
     * Render all dots for a specific coordinate key across all nodes
     * @param {string} coordinateKey - The coordinate key to render dots for
     */
    renderAllDotsForCoordinateKey(coordinateKey) {
        if (!this.isInitialized || !this.globalBoundingBox) {
            console.warn('PCAChartService: Not initialized. Cannot render dots for coordinate key.');
            return;
        }

        // Get all coordinates for this coordinate key across all nodes
        const nodeCoordinatesMap = pclaiCoordinateService.getCoordinatesForCoordinateKey(coordinateKey);
        
        if (!nodeCoordinatesMap || nodeCoordinatesMap.size === 0) {
            // No nodes have this coordinate key, clear dataset dots
            const datasetDots = this.chartSurface.querySelectorAll('.pca-chart__dot');
            datasetDots.forEach(dot => dot.remove());
            return;
        }

        // Deemphasize reference dots when dataset dots are displayed (grayscale + reduced opacity)
        this.deemphasizeReferenceDots();

        // Clear existing dataset dots only (preserve reference dots container)
        const datasetDots = this.chartSurface.querySelectorAll('.pca-chart__dot');
        datasetDots.forEach(dot => dot.remove());

        // Use unified rendering helper to render all dots for this coordinate key
        this.renderDotsFromCoordinateDataMap(nodeCoordinatesMap, this.globalBoundingBox);
    }

    /**
     * Convert RGB color string to grayscale
     * @param {string} rgbString - RGB color string like "rgb(255, 128, 64)"
     * @returns {string} Grayscale RGB string
     * @private
     */
    rgbToGrayscale(rgbString) {
        // Extract RGB values from string like "rgb(255, 128, 64)"
        const match = rgbString.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (!match) {
            return rgbString; // Return original if parsing fails
        }
        
        const r = parseInt(match[1], 10);
        const g = parseInt(match[2], 10);
        const b = parseInt(match[3], 10);
        
        // Calculate luminance using standard formula: 0.299*R + 0.587*G + 0.114*B
        const luminance = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        
        return `rgb(${luminance}, ${luminance}, ${luminance})`;
    }

    /**
     * Handle dot hover - increase size by 50% and de-emphasize other dots (grayscale + reduced opacity)
     * @param {HTMLElement} hoveredDot - The dot being hovered
     * @param {number} dotSizePx - Original dot size in pixels
     * @param {number} clampedX - X position of the dot
     * @param {number} clampedY - Y position of the dot
     */
    handleDotHover(hoveredDot, dotSizePx, clampedX, clampedY) {
        // Increase size by 50% (1.5x multiplier)
        const emphasizedSize = dotSizePx * this.EMPHASIS_SIZE_MULTIPLIER;
        const halfEmphasizedSize = emphasizedSize / 2;
        
        hoveredDot.style.width = `${emphasizedSize}px`;
        hoveredDot.style.height = `${emphasizedSize}px`;
        hoveredDot.style.zIndex = '10'; // Bring hovered dot to front
        // Adjust position to keep dot centered
        hoveredDot.style.left = `${clampedX - halfEmphasizedSize}px`;
        hoveredDot.style.top = `${clampedY - halfEmphasizedSize}px`;
        
        // De-emphasize all other dots: convert to grayscale and reduce opacity
        const allDots = this.chartSurface.querySelectorAll('.pca-chart__dot');
        allDots.forEach(dot => {
            if (dot !== hoveredDot) {
                // Store original color if not already stored
                if (!dot.dataset.originalColor) {
                    dot.dataset.originalColor = dot.style.backgroundColor;
                }
                // Convert to grayscale and reduce opacity
                const grayscaleColor = this.rgbToGrayscale(dot.dataset.originalColor);
                dot.style.backgroundColor = grayscaleColor;
                dot.style.opacity = this.OPACITY_DATASET_DEEMPHASIZED;
            }
        });
    }

    /**
     * Handle dot leave - restore original size, color, and opacity
     * @param {HTMLElement} dot - The dot that was hovered
     * @param {number} dotSizePx - Original dot size in pixels
     * @param {number} clampedX - X position of the dot
     * @param {number} clampedY - Y position of the dot
     */
    handleDotLeave(dot, dotSizePx, clampedX, clampedY) {
        // Restore original size
        const halfDotSize = dotSizePx / 2;
        dot.style.width = `${dotSizePx}px`;
        dot.style.height = `${dotSizePx}px`;
        dot.style.zIndex = '1'; // Restore default z-index
        dot.style.left = `${clampedX - halfDotSize}px`;
        dot.style.top = `${clampedY - halfDotSize}px`;
        
        // Restore original color and opacity of all dots
        const allDots = this.chartSurface.querySelectorAll('.pca-chart__dot');
        allDots.forEach(d => {
            // Restore original color if stored
            if (d.dataset.originalColor) {
                d.style.backgroundColor = d.dataset.originalColor;
            }
            d.style.opacity = this.OPACITY_FULL;
        });
    }

    /**
     * Clear chart dots
     */
    clearChart() {
        if (this.chartSurface) {
            // Clear only dataset dots, preserve reference dots container
            const datasetDots = this.chartSurface.querySelectorAll('.pca-chart__dot');
            datasetDots.forEach(dot => dot.remove());
        }

        // Restore reference dots to original colors and full opacity
        this.restoreReferenceDots();

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
        console.log('PCAChartService: showChart() called', {
            chartContainer: !!this.chartContainer,
            isInitialized: this.isInitialized,
            globalBoundingBox: !!this.globalBoundingBox,
            referenceDotsContainer: !!this.referenceDotsContainer,
            referenceDataLength: this.referenceData?.length
        });

        if (this.chartContainer) {
            this.chartContainer.style.display = 'block';
            this.isVisible = true;

            // Render reference dots when chart is shown (if not already rendered)
            if (this.isInitialized && this.globalBoundingBox) {
                // Update axes position
                this.updateAxes();

                // Check if reference dots already exist in DOM
                const existingDots = this.referenceDotsContainer?.querySelectorAll('.pca-chart__reference-dot');
                console.log('PCAChartService: Checking for existing dots', {
                    existingDotsCount: existingDots?.length || 0,
                    willRender: !existingDots || existingDots.length === 0
                });
                if (!existingDots || existingDots.length === 0) {
                    console.log('PCAChartService: Calling renderReferenceDots()');
                    this.renderReferenceDots(this.globalBoundingBox);
                }

                // If a coordinate key is selected, show all dots for that key
                if (this.selectedCoordinateKey) {
                    this.renderAllDotsForCoordinateKey(this.selectedCoordinateKey);
                }
            } else {
                console.warn('PCAChartService: Cannot render reference dots - not initialized or missing bounding box', {
                    isInitialized: this.isInitialized,
                    hasBoundingBox: !!this.globalBoundingBox
                });
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

