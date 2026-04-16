import {getAppleCrayonColorByName} from "./utils/color/color.js"

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

    /** Draw vertical tick marks at node boundaries when gene annotation data is unavailable. */
    renderGenomicExtents(config: any): void {

        const { nodes, bpStart: assemblyBPStart, bpEnd: assemblyBPEnd } = config

        this.drawConfig = config

        const canvas = this.container.querySelector('canvas')!
        const { width, height } = canvas.getBoundingClientRect();

        const ctx = (canvas as HTMLCanvasElement).getContext('2d')!
        ctx.clearRect(0, 0, width, height);

        const bpLength = Math.max(1, assemblyBPEnd - assemblyBPStart);
        const bpPerPixel = bpLength / width
        const pixelPerBP = 1/bpPerPixel

        ctx.fillStyle = getAppleCrayonColorByName('aluminum', true)

        let i = 0
        for (const { bpStart, bpEnd } of nodes) {

            const extentStartBP = bpStart - assemblyBPStart
            const extentStart = Math.floor(extentStartBP * pixelPerBP)

            const extentEndBP = bpEnd - assemblyBPStart
            const extentEnd = Math.floor(extentEndBP * pixelPerBP)

            if (i > 0) {
                ctx.fillRect(extentStart, 0, 1, height)
            }

            if (i < nodes.length - 1) {
                ctx.fillRect(extentEnd - 1, 0, 1, height)
            }
            ++i
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

        if (this.hasGeneAnnotations && this.drawConfig) {
            this.renderGeneAnnotation(this.drawConfig);
        } else if (!this.hasGeneAnnotations && this.drawConfig) {
            this.renderGenomicExtents(this.drawConfig)
        } else {
            ctx.clearRect(0, 0, width, height);
        }
    }

    clear(): void {
        this.drawConfig = undefined
        const { width, height } = this.container.getBoundingClientRect();
        const canvas = this.container.querySelector('canvas') as HTMLCanvasElement
        const ctx = canvas.getContext('2d')!
        ctx.clearRect(0, 0, width, height);
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
        this.drawConfig = null;
        this.featureRenderer = null;
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
}

export default AnnotationCanvas
