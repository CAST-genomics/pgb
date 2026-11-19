import {getAppleCrayonColorHexStringByName} from "./utils/color/color.js"
import appConfig from "./appConfig.js"
import {
    contentHeight, DEFAULT_DISPLAY_MODE, DISPLAY_MODE_LABELS, DISPLAY_MODES,
    featureRowCount, trackGeometry,
    type DisplayMode, type TrackGeometry,
} from "./annotationTrackLayout.ts"

/**
 * Owns the annotation track's canvas, visual feedback element, spinner, and
 * display-mode control. Handles DPR-aware sizing and two rendering modes
 * (gene annotations vs. extent markers).
 *
 * The track has a fixed height. Gene annotations are laid out in feature rows
 * according to the display mode (Collapsed / Squished / Expanded); rows that
 * overflow scroll vertically inside the scroller. The feedback line, spinner,
 * and mode control live outside the scroller so they stay put while it scrolls.
 *
 * No events, no bp ↔ node math — just DOM and canvas drawing.
 */
class AnnotationCanvas {

    private container: HTMLElement
    private scroller: HTMLElement
    private canvas: HTMLCanvasElement
    private displayModeControl: HTMLElement
    private displayMode: DisplayMode
    private visualFeedbackElement: HTMLElement
    private spinnerElement: HTMLElement
    private overlayCanvas: HTMLCanvasElement | null
    private overlayConfig: { anchors: any[]; bpStart: number; bpEnd: number } | undefined
    private deEmphasisCanvas: HTMLCanvasElement
    private deEmphasisConfig: { anchors: any[]; walkNodeIds: Set<string> | null; bpStart: number; bpEnd: number } | undefined

    hasGeneAnnotations: boolean
    featureRenderer: any
    private drawConfig: any

    constructor(container: HTMLElement) {
        this.container = container
        this.scroller = container.querySelector('.pgb-gene-annotation-track-container__scroller') as HTMLElement
        this.canvas = this.scroller.querySelector('canvas') as HTMLCanvasElement
        this.displayMode = DEFAULT_DISPLAY_MODE

        this.hasGeneAnnotations = false
        this.featureRenderer = undefined
        this.drawConfig = undefined

        this.visualFeedbackElement = this.createVisualFeedbackElement()
        this.spinnerElement = this.createSpinnerElement()
        this.overlayCanvas = appConfig.diagnostic?.bpBandOverlay ? this.createOverlayCanvas() : null
        this.overlayConfig = undefined
        this.deEmphasisCanvas = this.createDeEmphasisCanvas()
        this.deEmphasisConfig = undefined
        this.displayModeControl = this.createDisplayModeControl()

        this.resize()
    }

    /**
     * Width (css px) of the drawable track — the scroller's client width, which
     * excludes the reserved scrollbar gutter. Drawing and hover both map
     * through this one width.
     */
    get trackWidth(): number {
        return this.scroller.clientWidth
    }

    /** Left edge (client px) of the drawable track. */
    get trackLeft(): number {
        return this.scroller.getBoundingClientRect().left
    }

    get viewportHeight(): number {
        return this.scroller.clientHeight
    }

    geometry(bpStart: number, bpEnd: number): TrackGeometry {
        return trackGeometry(bpStart, bpEnd, this.trackWidth)
    }

    getDisplayMode(): DisplayMode {
        return this.displayMode
    }

    /** Switch display mode, redraw, and return to the top feature row. */
    setDisplayMode(mode: DisplayMode): void {
        if (mode === this.displayMode) return
        this.displayMode = mode
        this.syncDisplayModeControl()
        this.resetScroll()
        this.resize()
    }

    resetScroll(): void {
        this.scroller.scrollTop = 0
    }

    /** Draw gene features (exons, introns, etc.) when annotation data is available. */
    renderGeneAnnotation(renderConfig: any): void {

        if (renderConfig) {
            const {bpStart, bpEnd, features} = renderConfig

            this.featureRenderer.displayMode = this.displayMode

            const rowCount = featureRowCount(features, bpStart, bpEnd)
            const pixelHeight = contentHeight(this.displayMode, rowCount, this.viewportHeight, this.featureRenderer)
            this.sizeCanvases(pixelHeight)

            const { trackWidth: pixelWidth, bpPerPixel } = this.geometry(bpStart, bpEnd)
            const viewportWidth = pixelWidth

            const context = this.canvas.getContext('2d')
            this.drawConfig = {container: this.container, bpStart, bpEnd, features, context, bpPerPixel, viewportWidth, pixelWidth, pixelHeight}
            this.featureRenderer.draw(this.drawConfig)
        }

        this.displayModeControl.style.display = this.hasGeneAnnotations ? 'block' : 'none'
    }

    /** Draw vertical tick marks at anchor boundaries when gene annotation data is unavailable. */
    renderGenomicExtents(config: any): void {

        const { anchors, bpStart: assemblyBPStart, bpEnd: assemblyBPEnd } = config

        this.drawConfig = config
        this.displayModeControl.style.display = 'none'

        const height = this.viewportHeight
        this.sizeCanvases(height)

        const { trackWidth: width, pxFromBp } = this.geometry(assemblyBPStart, assemblyBPEnd)

        const ctx = this.canvas.getContext('2d')!
        ctx.clearRect(0, 0, width, height);

        ctx.fillStyle = getAppleCrayonColorHexStringByName('aluminum')

        for (let i = 0; i < anchors.length; i++) {
            const { refStart, refEnd } = anchors[i]

            const extentStart = Math.floor(pxFromBp(refStart))
            const extentEnd   = Math.floor(pxFromBp(refEnd))

            if (i > 0) {
                ctx.fillRect(extentStart, 0, 1, height)
            }

            if (i < anchors.length - 1) {
                ctx.fillRect(extentEnd - 1, 0, 1, height)
            }
        }

    }

    /**
     * Diagnostic: paint each node's bp extent with a deterministic color on a
     * translucent overlay canvas above the primary track. Invariant: the cursor
     * at arc-length fraction u along a node should land inside that node's
     * colored band at position u within the band.
     */
    renderBpBandOverlay(config: { anchors: any[]; bpStart: number; bpEnd: number }): void {
        if (!this.overlayCanvas) return

        this.overlayConfig = config

        const { anchors, bpStart, bpEnd } = config
        const { width, height } = this.overlayCanvas.getBoundingClientRect()
        const ctx = this.overlayCanvas.getContext('2d')!

        ctx.clearRect(0, 0, width, height)

        const { pxFromBp } = this.geometry(bpStart, bpEnd)

        for (const anchor of anchors) {
            const x0 = pxFromBp(anchor.refStart)
            const x1 = pxFromBp(anchor.refEnd)
            ctx.fillStyle = bpBandColorForNode(anchor.nodeId)
            ctx.fillRect(x0, 0, Math.max(1, x1 - x0), height)
        }
    }

    /**
     * Paint translucent grey rectangles over reference ranges whose anchor nodeId
     * is NOT in `walkNodeIds`. Mirrors 3D gray de-emphasis used in Assembly Walk mode.
     * Pass walkNodeIds=null (Subgraph mode) to clear without painting.
     */
    renderDeEmphasisOverlay(config: { anchors: any[]; walkNodeIds: Set<string> | null; bpStart: number; bpEnd: number }): void {
        this.deEmphasisConfig = config

        const { anchors, walkNodeIds, bpStart, bpEnd } = config
        const { width, height } = this.deEmphasisCanvas.getBoundingClientRect()
        const ctx = this.deEmphasisCanvas.getContext('2d')!

        ctx.clearRect(0, 0, width, height)

        if (!walkNodeIds) return

        const { pxFromBp } = this.geometry(bpStart, bpEnd)

        ctx.imageSmoothingEnabled = false
        ctx.fillStyle = 'rgba(120, 120, 120, 0.45)'

        for (const anchor of anchors) {
            if (walkNodeIds.has(anchor.nodeId)) continue
            const x0 = Math.floor(pxFromBp(anchor.refStart))
            const x1 = Math.floor(pxFromBp(anchor.refEnd))
            ctx.fillRect(x0, 0, Math.max(1, x1 - x0), height)
        }
    }

    /**
     * Size the primary canvas and the content overlays to the track width and
     * the given content height (css px), DPR-aware. Resetting a canvas's
     * backing store clears it, so callers redraw afterwards.
     */
    private sizeCanvases(height: number): void {
        const dpr = window.devicePixelRatio || 1
        const width = this.trackWidth

        const canvases = [this.canvas, this.deEmphasisCanvas, this.overlayCanvas].filter(Boolean) as HTMLCanvasElement[]
        for (const c of canvases) {
            c.width = Math.round(width * dpr)
            c.height = Math.round(height * dpr)
            c.style.width = `${width}px`
            c.style.height = `${height}px`
            c.getContext('2d')!.setTransform(dpr, 0, 0, dpr, 0, 0)
        }

        // Keep the mode control clear of the scrollbar gutter (0 with overlay scrollbars).
        const gutter = this.scroller.offsetWidth - this.scroller.clientWidth
        this.displayModeControl.style.right = `${4 + gutter}px`
    }

    /** Re-layout and redraw everything from the retained configs (window resize, mode change). */
    resize(): void {
        if (this.hasGeneAnnotations && this.drawConfig) {
            this.renderGeneAnnotation(this.drawConfig);
        } else if (!this.hasGeneAnnotations && this.drawConfig) {
            this.renderGenomicExtents(this.drawConfig)
        } else {
            this.sizeCanvases(this.viewportHeight)
        }

        if (this.overlayConfig) this.renderBpBandOverlay(this.overlayConfig)
        if (this.deEmphasisConfig) this.renderDeEmphasisOverlay(this.deEmphasisConfig)
    }

    /**
     * Render the current gene-annotation draw config to an offscreen canvas at
     * `scale`× the on-screen pixel density and return a PNG Blob. Logical
     * width/height (i.e. the bp-to-pixel mapping) is preserved; only the
     * backing-store resolution increases.
     */
    async exportToPng(scale: number): Promise<Blob> {
        if (!this.hasGeneAnnotations || !this.featureRenderer || !this.drawConfig) {
            throw new Error('No annotation data available to export')
        }
        const { bpStart, bpEnd, features, bpPerPixel, viewportWidth, pixelWidth, pixelHeight } = this.drawConfig

        const offscreen = document.createElement('canvas')
        offscreen.width = Math.round(pixelWidth * scale)
        offscreen.height = Math.round(pixelHeight * scale)
        const ctx = offscreen.getContext('2d')!
        ctx.scale(scale, scale)

        this.featureRenderer.draw({
            container: this.container,
            bpStart, bpEnd, features,
            context: ctx,
            bpPerPixel, viewportWidth, pixelWidth, pixelHeight,
        })

        return new Promise<Blob>((resolve, reject) => {
            offscreen.toBlob(
                blob => blob ? resolve(blob) : reject(new Error('toBlob returned null')),
                'image/png'
            )
        })
    }

    clear(): void {
        this.drawConfig = undefined
        this.overlayConfig = undefined
        this.deEmphasisConfig = undefined
        this.displayModeControl.style.display = 'none'
        this.resetScroll()
        // Re-sizing clears every canvas and collapses the content to the viewport.
        this.sizeCanvases(this.viewportHeight)
    }

    showFeedbackAtParam(param: number): void {
        this.visualFeedbackElement.style.display = 'block';
        this.visualFeedbackElement.style.left = `${Math.floor(this.trackWidth * param)}px`;
    }

    showFeedbackAtPixel(px: number): void {
        this.visualFeedbackElement.style.display = 'block';
        this.visualFeedbackElement.style.left = `${px}px`;
    }

    hideFeedback(): void {
        this.visualFeedbackElement.style.display = 'none';
        this.visualFeedbackElement.style.left = '-8px';
    }

    showSpinner(): void {
        this.spinnerElement.style.display = 'block';
    }

    hideSpinner(): void {
        this.spinnerElement.style.display = 'none';
    }

    dispose(): void {
        if (this.visualFeedbackElement?.parentNode) {
            this.visualFeedbackElement.parentNode.removeChild(this.visualFeedbackElement);
        }
        if (this.spinnerElement?.parentNode) {
            this.spinnerElement.parentNode.removeChild(this.spinnerElement);
        }
        if (this.overlayCanvas?.parentNode) {
            this.overlayCanvas.parentNode.removeChild(this.overlayCanvas);
        }
        if (this.deEmphasisCanvas?.parentNode) {
            this.deEmphasisCanvas.parentNode.removeChild(this.deEmphasisCanvas);
        }
        if (this.displayModeControl?.parentNode) {
            this.displayModeControl.parentNode.removeChild(this.displayModeControl);
        }
        this.drawConfig = null;
        this.featureRenderer = null;
        this.overlayCanvas = null;
        this.overlayConfig = undefined;
        this.deEmphasisConfig = undefined;
    }

    private createVisualFeedbackElement(): HTMLElement {
        const el = document.createElement('div');
        el.className = 'pgb-gene-annotation-track-container__visual-feedback';
        this.container.appendChild(el);
        return el;
    }

    private createSpinnerElement(): HTMLElement {
        const el = document.createElement('div');
        el.className = 'pgb-gene-annotation-track-container__spinner';
        el.innerHTML = '<div class="spinner-border text-secondary" role="status"><span class="visually-hidden">Loading...</span></div>';
        this.container.appendChild(el);
        return el;
    }

    // Content overlays live inside the scroller so they scroll with the feature rows.
    private createOverlayCanvas(): HTMLCanvasElement {
        const el = document.createElement('canvas');
        el.className = 'pgb-gene-annotation-track-container__bp-band-overlay';
        this.scroller.appendChild(el);
        return el;
    }

    private createDeEmphasisCanvas(): HTMLCanvasElement {
        const el = document.createElement('canvas');
        el.className = 'pgb-gene-annotation-track-container__deemphasis-overlay';
        this.scroller.appendChild(el);
        return el;
    }

    private createDisplayModeControl(): HTMLElement {
        const el = document.createElement('div');
        el.className = 'btn-group btn-group-sm pgb-gene-annotation-track-container__display-mode';
        el.setAttribute('role', 'group');
        el.setAttribute('aria-label', 'Annotation display mode');

        for (const mode of DISPLAY_MODES) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'btn btn-outline-secondary';
            button.dataset.displayMode = mode;
            button.textContent = DISPLAY_MODE_LABELS[mode];
            button.addEventListener('click', () => this.setDisplayMode(mode));
            el.appendChild(button);
        }

        // Hovering the control is not hovering the genome: keep the track's
        // mousemove (track → 3D dot) from firing underneath it.
        el.addEventListener('mousemove', event => event.stopPropagation());

        this.container.appendChild(el);
        this.syncDisplayModeControlOn(el);
        return el;
    }

    private syncDisplayModeControl(): void {
        this.syncDisplayModeControlOn(this.displayModeControl)
    }

    private syncDisplayModeControlOn(el: HTMLElement): void {
        for (const button of Array.from(el.querySelectorAll('button'))) {
            const active = (button as HTMLElement).dataset.displayMode === this.displayMode
            button.classList.toggle('active', active)
            button.setAttribute('aria-pressed', String(active))
        }
    }
}

/**
 * Deterministic HSL color from a node name. djb2 hash → hue in [0, 360).
 * Translucent alpha so the underlying track (gene features / extent ticks)
 * still reads through the band.
 */
function bpBandColorForNode(nodeName: string): string {
    let h = 5381
    for (let i = 0; i < nodeName.length; i++) {
        h = ((h << 5) + h) + nodeName.charCodeAt(i)
    }
    const hue = ((h % 360) + 360) % 360
    return `hsla(${hue}, 70%, 55%, 0.35)`
}

export default AnnotationCanvas
