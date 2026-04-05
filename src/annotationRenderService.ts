import {globals} from "./main.js"
import eventBus from "./utils/eventBus.ts"
import {getAppleCrayonColorByName} from "./utils/color/color.js"
import { getLineXYZWithTrackBasepair, buildBpIndex, buildNodeEndpointMap, makeNodeRecordMap, getTrackParameterWithLineParameter } from "./utils/annotationTrackUtils.js"
import RayCastService from "./raycastService.js"

class AnnotationRenderService {

    container: HTMLElement
    genomicService: any
    sceneManager: any
    raycastService: any

    bpIndex: any
    bpIndexMap: Map<string, any>
    endpointMap: Map<string, any>
    splineParameterMap: Map<string, { startParam: number; endParam: number }>

    hasGeneAnnotations: boolean

    visualFeedbackElement!: HTMLElement
    spinnerElement!: HTMLElement

    assembly: string | undefined
    bpStart: number | undefined
    bpEnd: number | undefined
    featureSource: any
    featureRenderer: any
    drawConfig: any

    private boundResizeHandler: () => void
    private boundMouseMoveHandler: (event: MouseEvent) => void
    private boundMouseEnterHandler: (event: MouseEvent) => void
    private boundMouseLeaveHandler: (event: MouseEvent) => void

    private emphasizeUnsub!: () => void
    private normalUnsub!: () => void
    private lineIntersectionUnsub!: () => void
    private clearIntersectioUnsub!: () => void

    private verticalBar: HTMLElement | null = null

    constructor(container: HTMLElement, genomicService: any, sceneManager: any, raycastService: any) {

        this.container = container;
        this.genomicService = genomicService;
        this.sceneManager = sceneManager;
        this.raycastService = raycastService;

        this.bpIndex = undefined
        this.bpIndexMap = new Map()
        this.endpointMap = new Map()

        this.splineParameterMap = new Map()

        /** True when gene annotation data is available; false when falling back to extent markers only. */
        this.hasGeneAnnotations = false

        this.boundResizeHandler = () => {}
        this.boundMouseMoveHandler = () => {}
        this.boundMouseEnterHandler = () => {}
        this.boundMouseLeaveHandler = () => {}

        this.createVisualFeedbackElement();

        this.createSpinnerElement();

        this.resizeCanvas(container);

        this.setupEventHandlers()

        this.setupEventBusSubscriptions()

    }

    setupEventHandlers(): void {

        this.boundResizeHandler = this.resizeCanvas.bind(this, this.container);
        window.addEventListener('resize', this.boundResizeHandler);

        this.boundMouseMoveHandler = this.handleMouseMove.bind(this);
        this.container.addEventListener('mousemove', this.boundMouseMoveHandler);

        this.boundMouseEnterHandler = this.handleMouseEnter.bind(this);
        this.container.addEventListener('mouseenter', this.boundMouseEnterHandler);

        this.boundMouseLeaveHandler = this.handleMouseLeave.bind(this);
        this.container.addEventListener('mouseleave', this.boundMouseLeaveHandler);
    }

    setupEventBusSubscriptions(): void {
        this.emphasizeUnsub = eventBus.subscribe('assembly:emphasis', this.handleAssemblyEmphasis.bind(this))
        this.normalUnsub = eventBus.subscribe('assembly:normal', this.handleAssemblyNormal.bind(this))
        this.lineIntersectionUnsub = eventBus.subscribe('lineIntersection', this.handleLineIntersection.bind(this))
        this.clearIntersectioUnsub = eventBus.subscribe('clearIntersection', this.handleClearIntersection.bind(this))
    }

    async handleAssemblyEmphasis(data: { assembly: { name: string } }): Promise<void> {

        this.splineParameterMap.clear()

        const { assembly } = data

        this.assembly = assembly.name

        const { spine } = this.genomicService.assemblyWalkMap.get(this.assembly).spineFeatures
        const { nodes, edges } = spine

        this.bpIndex = buildBpIndex(spine);
        this.bpIndexMap = makeNodeRecordMap(this.bpIndex)

        const walkNodes = spine.nodes.map((n: any) => n.id);

        this.endpointMap = buildNodeEndpointMap(walkNodes, this.sceneManager);

        const chr = this.genomicService.getSequenceId(this.assembly)
        const bpStart = nodes[0].bpStart
        const bpEnd = nodes[ nodes.length - 1].bpEnd

        this.bpStart = bpStart
        this.bpEnd = bpEnd

        const bpExtent = bpEnd - bpStart

        for (const node of nodes) {
            const startParam = (node.bpStart - bpStart) / bpExtent;
            const endParam = (node.bpEnd - bpStart) / bpExtent;
            this.splineParameterMap.set(node.id, {startParam, endParam})
        }

        const genomeLibraryKey = this.genomicService.getGenomeLibraryKey(this.assembly)

        this.showSpinner()

        console.log(`AnnotationRenderService: loading genome payload for "${genomeLibraryKey}" ...`)
        console.time(`AnnotationRenderService: genome payload "${genomeLibraryKey}"`)
        // @ts-ignore — app is a late-bound export from unchecked JS
        const result = await globals.app.genomeLibrary.getGenomePayload(genomeLibraryKey)
        console.timeEnd(`AnnotationRenderService: genome payload "${genomeLibraryKey}"`)

        if (undefined === result) {
            // Unknown genome: no RefSeq/annotation data — fall back to extent markers only
            this.hasGeneAnnotations = false
            this.drawConfig = { nodes, chr, bpStart, bpEnd }
            this.renderGenomicExtents(this.drawConfig)
        } else {
            this.hasGeneAnnotations = true
            const {geneFeatureSource, geneRenderer} = result
            this.featureSource = geneFeatureSource
            this.featureRenderer = geneRenderer
            console.log(`AnnotationRenderService: fetching features for ${chr}:${bpStart}-${bpEnd} ...`)
            console.time(`AnnotationRenderService: features fetched`)
            const features = await this.getFeatures(chr, bpStart, bpEnd)
            console.timeEnd(`AnnotationRenderService: features fetched`)
            console.log(`AnnotationRenderService: ${features ? features.length : 0} features returned`)
            this.renderGeneAnnotation({ container: this.container, bpStart, bpEnd, features })
        }

        this.hideSpinner()

    }

    handleAssemblyNormal(data: any): void {

        this.featureSource = undefined

        this.featureRenderer = undefined

        this.hasGeneAnnotations = false

        this.drawConfig = undefined

        this.splineParameterMap.clear()

        this.bpIndexMap.clear()

        this.bpIndex = undefined

        this.endpointMap.clear()

        this.clear()
    }

    handleLineIntersection(data: { t: number; nodeName: string }): void {

        if (0 === this.splineParameterMap.size) {
            return
        }

        const { t, nodeName } = data

        if (undefined === this.splineParameterMap.get(nodeName)) {
            return
        }

        const { bp, u:tOriented } = getTrackParameterWithLineParameter(nodeName, t, this.bpIndex, this.endpointMap, this.bpIndexMap)

        const { startParam, endParam } = this.splineParameterMap.get(nodeName)!
        const param = startParam * ( 1 - tOriented) + endParam * tOriented

        this.visualFeedbackElement.style.display = 'block';

        const { width } = this.container.getBoundingClientRect();
        this.visualFeedbackElement.style.left = `${ Math.floor(width * param) }px`;
    }

    handleClearIntersection(data: Record<string, never>): void {
        this.visualFeedbackElement.style.display = 'none';
        this.visualFeedbackElement.style.left = '-8px';
    }

    createVisualFeedbackElement(): void {
        this.visualFeedbackElement = document.createElement('div');
        this.visualFeedbackElement.className = 'pgb-gene-annotation-track-container__visual-feedback';
        this.container.appendChild(this.visualFeedbackElement);
    }

    createSpinnerElement(): void {
        this.spinnerElement = document.createElement('div');
        this.spinnerElement.className = 'pgb-gene-annotation-track-container__spinner';
        this.spinnerElement.innerHTML = '<div class="spinner-border text-secondary" role="status"><span class="visually-hidden">Loading...</span></div>';
        this.container.appendChild(this.spinnerElement);
    }

    showSpinner(): void {
        this.spinnerElement.style.display = 'block';
    }

    hideSpinner(): void {
        this.spinnerElement.style.display = 'none';
    }

    /** Draw vertical tick marks at node boundaries when gene annotation data is unavailable. */
    renderGenomicExtents(config: any): void {

        const { nodes, bpStart:assemblyBPStart, bpEnd:assemblyBPEnd } = config

        const canvas = this.container.querySelector('canvas')!
        const { width, height } = canvas.getBoundingClientRect();

        const ctx = (canvas as HTMLCanvasElement).getContext('2d')!
        ctx.clearRect(0, 0, width, height);

        const bpLength = Math.max(1, assemblyBPEnd - assemblyBPStart);
        const bpPerPixel = bpLength / width
        const pixelPerBP = 1/bpPerPixel

        ctx.fillStyle = getAppleCrayonColorByName('aluminum', true)

        let i= 0
        for (const { bpStart, bpEnd } of nodes){

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

    /** Draw gene features (exons, introns, etc.) when annotation data is available. */
    renderGeneAnnotation(renderConfig: any): void {

        if (renderConfig) {
            const {container, bpStart, bpEnd} = renderConfig

            const canvas = container.querySelector('canvas')
            const {width: pixelWidth, height: pixelHeight} = canvas.getBoundingClientRect()

            const bpPerPixel = (bpEnd - bpStart) / pixelWidth
            const viewportWidth = pixelWidth

            const context = canvas.getContext('2d')
            this.drawConfig = {...renderConfig, context, bpPerPixel, viewportWidth, pixelWidth, pixelHeight}
            this.featureRenderer.draw(this.drawConfig)
        }
    }

    async getFeatures(chr: string, start: number, end: number): Promise<any> {
        return await this.featureSource.getFeatures({chr, start, end})
    }

    resizeCanvas(container: HTMLElement): void {
        const dpr = window.devicePixelRatio || 1;
        const {width, height} = container.getBoundingClientRect();

        // Set the canvas size in pixels
        const canvas = container.querySelector('canvas') as HTMLCanvasElement
        canvas.width = width * dpr;
        canvas.height = height * dpr;

        // Scale the canvas context to match the device pixel ratio
        const ctx = canvas.getContext('2d')!
        ctx.scale(dpr, dpr);

        // Set the canvas CSS size to match the container
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`

        // Re-render using the same mode as the last emphasis
        if (this.hasGeneAnnotations && this.drawConfig) {
            this.renderGeneAnnotation(this.drawConfig);
        } else if (!this.hasGeneAnnotations && this.drawConfig) {
            this.renderGenomicExtents(this.drawConfig)
        } else {
            ctx.clearRect(0, 0, width, height);
        }

    }

    handleMouseEnter(event: MouseEvent): void {
        this.raycastService.disable()
        this.visualFeedbackElement.style.display = 'block'
        this.visualFeedbackElement.style.left = '-8px'
    }

    handleMouseLeave(event: MouseEvent): void {
        this.raycastService.enable()
        this.visualFeedbackElement.style.display = 'none'
        this.visualFeedbackElement.style.left = '-8px'
    }

    handleMouseMove(event: MouseEvent): void {

        if (0 === this.splineParameterMap.size) {
            return
        }

        const { left, width } = this.container.getBoundingClientRect();
        const exe = event.clientX - left;

        this.visualFeedbackElement.style.left = `${exe}px`

        const param = (exe / width)

        const bp= Math.floor(this.bpStart! * ( 1 - param) + this.bpEnd! * param)

        const result = getLineXYZWithTrackBasepair(bp, this.bpIndex, this.endpointMap, this.sceneManager);
        if (!result) return;
        const { nodeId, t, xyz:pointOnLine, u } = result;


        /*
        let nodeId
        let u
        for (const [ node, bpExtent ] of this.splineParameterMap) {
            if (bpExtent.startParam <= param && bpExtent.endParam >= param){
                nodeId = node
                u = (param - bpExtent.startParam) / (bpExtent.endParam - bpExtent.startParam)
                break
            }
        }

        // const spline = this.geometryManager.getSpline(nodeId)
        // const pointOnLine = spline.getPoint(u)

        // class ParametricLine implements methods to interpret a Line2 object
        // as a one-dimensional parametric line. This establishes a mapping: xyz <--> t
        // where t: 0-1
        const parametricLine = this.geometryManager.getLine(nodeId)
        const pointOnLine = parametricLine.getPoint(u, 'world')

         */

        // this.raycastService.showVisualFeedback(pointOnLine, parametricLine.material.color)
        this.raycastService.showVisualFeedback(pointOnLine, RayCastService.VISUAL_FEEDBACK_NAME_COLOR_THREE_JS)
    }

    clear(): void {

        this.splineParameterMap.clear()

        this.bpIndex = undefined

        this.bpIndexMap.clear()

        this.endpointMap.clear()

        const { width, height } = this.container.getBoundingClientRect();
        const canvas = this.container.querySelector('canvas') as HTMLCanvasElement
        const ctx = canvas.getContext('2d')!
        ctx.clearRect(0, 0, width, height);
    }

    dispose(): void {

        this.emphasizeUnsub()

        this.normalUnsub()

        this.lineIntersectionUnsub()

        this.clearIntersectioUnsub()

        window.removeEventListener('resize', this.boundResizeHandler);

        // Remove mouse event listeners
        if (this.container) {
            this.container.removeEventListener('mousemove', this.boundMouseMoveHandler);
            this.container.removeEventListener('mouseenter', this.boundMouseEnterHandler);
            this.container.removeEventListener('mouseleave', this.boundMouseLeaveHandler);
        }

        // Remove the vertical bar element
        if (this.verticalBar && this.verticalBar.parentNode) {
            this.verticalBar.parentNode.removeChild(this.verticalBar);
            this.verticalBar = null;
        }

        if (this.spinnerElement && this.spinnerElement.parentNode) {
            this.spinnerElement.parentNode.removeChild(this.spinnerElement);
            (this as any).spinnerElement = null;
        }

        this.drawConfig = null;

        this.featureSource = null;
        this.featureRenderer = null;

        this.splineParameterMap.clear()
    }

}

export default AnnotationRenderService;
