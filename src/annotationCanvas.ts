import {getAppleCrayonColorByName} from "./utils/color/color.js"
import appConfig from "./appConfig.js"

/**
 * Owns the annotation track's canvas, visual feedback element, and spinner.
 * Handles DPR-aware resize and two rendering modes (gene annotations vs. extent markers).
 *
 * No events, no coordinate math — just DOM and canvas drawing.
 */
class AnnotationCanvas {

    private container: HTMLElement
    private visualFeedbackElement: HTMLElement
    private spinnerElement: HTMLElement
    private overlayCanvas: HTMLCanvasElement | null
    private overlayConfig: { anchors: any[]; bpStart: number; bpEnd: number } | undefined

    hasGeneAnnotations: boolean
    featureRenderer: any
    private drawConfig: any

    constructor(container: HTMLElement) {
        this.container = container

        this.hasGeneAnnotations = false
        this.featureRenderer = undefined
        this.drawConfig = undefined

        this.visualFeedbackElement = this.createVisualFeedbackElement()
        this.spinnerElement = this.createSpinnerElement()
        this.overlayCanvas = appConfig.diagnostic?.bpBandOverlay ? this.createOverlayCanvas() : null
        this.overlayConfig = undefined

        this.resize()
    }

    /** Draw gene features (exons, introns, etc.) when annotation data is available. */
    renderGeneAnnotation(renderConfig: any): void {

        if (renderConfig) {
            const {bpStart, bpEnd, features} = renderConfig

            const canvas = this.container.querySelector('canvas')!
            const {width: pixelWidth, height: pixelHeight} = canvas.getBoundingClientRect()

            const bpPerPixel = (bpEnd - bpStart) / pixelWidth
            const viewportWidth = pixelWidth

            const context = (canvas as HTMLCanvasElement).getContext('2d')
            this.drawConfig = {container: this.container, bpStart, bpEnd, features, context, bpPerPixel, viewportWidth, pixelWidth, pixelHeight}
            this.featureRenderer.draw(this.drawConfig)
        }
    }

    /** Draw vertical tick marks at anchor boundaries when gene annotation data is unavailable. */
    renderGenomicExtents(config: any): void {

        const { anchors, bpStart: assemblyBPStart, bpEnd: assemblyBPEnd } = config

        this.drawConfig = config

        const canvas = this.container.querySelector('canvas')!
        const { width, height } = canvas.getBoundingClientRect();

        const ctx = (canvas as HTMLCanvasElement).getContext('2d')!
        ctx.clearRect(0, 0, width, height);

        const bpLength = Math.max(1, assemblyBPEnd - assemblyBPStart);
        const pixelPerBP = width / bpLength

        ctx.fillStyle = getAppleCrayonColorByName('aluminum', true)

        for (let i = 0; i < anchors.length; i++) {
            const { refStart, refEnd } = anchors[i]

            const extentStart = Math.floor((refStart - assemblyBPStart) * pixelPerBP)
            const extentEnd   = Math.floor((refEnd   - assemblyBPStart) * pixelPerBP)

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

        const bpLength = Math.max(1, bpEnd - bpStart)
        const pixelPerBP = width / bpLength

        for (const anchor of anchors) {
            const x0 = (anchor.refStart - bpStart) * pixelPerBP
            const x1 = (anchor.refEnd - bpStart) * pixelPerBP
            ctx.fillStyle = bpBandColorForNode(anchor.nodeId)
            ctx.fillRect(x0, 0, Math.max(1, x1 - x0), height)
        }
    }

    resize(): void {
        const dpr = window.devicePixelRatio || 1;
        const {width, height} = this.container.getBoundingClientRect();

        const canvas = this.container.querySelector('canvas') as HTMLCanvasElement
        canvas.width = width * dpr;
        canvas.height = height * dpr;

        const ctx = canvas.getContext('2d')!
        ctx.scale(dpr, dpr);

        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`

        if (this.overlayCanvas) {
            this.overlayCanvas.width = width * dpr
            this.overlayCanvas.height = height * dpr
            this.overlayCanvas.getContext('2d')!.scale(dpr, dpr)
            this.overlayCanvas.style.width = `${width}px`
            this.overlayCanvas.style.height = `${height}px`
        }

        if (this.hasGeneAnnotations && this.drawConfig) {
            this.renderGeneAnnotation(this.drawConfig);
        } else if (!this.hasGeneAnnotations && this.drawConfig) {
            this.renderGenomicExtents(this.drawConfig)
        } else {
            ctx.clearRect(0, 0, width, height);
        }

        if (this.overlayConfig) this.renderBpBandOverlay(this.overlayConfig)
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
        const { width, height } = this.container.getBoundingClientRect();
        const canvas = this.container.querySelector('canvas') as HTMLCanvasElement
        const ctx = canvas.getContext('2d')!
        ctx.clearRect(0, 0, width, height);

        if (this.overlayCanvas) {
            this.overlayConfig = undefined
            this.overlayCanvas.getContext('2d')!.clearRect(0, 0, width, height)
        }
    }

    showFeedbackAtParam(param: number): void {
        this.visualFeedbackElement.style.display = 'block';
        const { width } = this.container.getBoundingClientRect();
        this.visualFeedbackElement.style.left = `${Math.floor(width * param)}px`;
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
        this.drawConfig = null;
        this.featureRenderer = null;
        this.overlayCanvas = null;
        this.overlayConfig = undefined;
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

    private createOverlayCanvas(): HTMLCanvasElement {
        const el = document.createElement('canvas');
        el.className = 'pgb-gene-annotation-track-container__bp-band-overlay';
        this.container.appendChild(el);
        return el;
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
