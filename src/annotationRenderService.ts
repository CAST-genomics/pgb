import {globals} from "./main.js"
import eventBus from "./utils/eventBus.ts"
import RayCastService from "./raycastService.js"
import AnnotationCoordinateIndex from "./annotationCoordinateIndex.ts"
import AnnotationCanvas from "./annotationCanvas.ts"

class AnnotationRenderService {

    container: HTMLElement
    genomicService: any
    sceneManager: any
    raycastService: any

    coordinateIndex: AnnotationCoordinateIndex
    canvas: AnnotationCanvas

    assembly: string | undefined
    featureSource: any

    private boundResizeHandler: () => void
    private boundMouseMoveHandler: (event: MouseEvent) => void
    private boundMouseEnterHandler: (event: MouseEvent) => void
    private boundMouseLeaveHandler: (event: MouseEvent) => void

    private emphasizeUnsub!: () => void
    private normalUnsub!: () => void
    private lineIntersectionUnsub!: () => void
    private clearIntersectioUnsub!: () => void

    constructor(container: HTMLElement, genomicService: any, sceneManager: any, raycastService: any) {

        this.container = container;
        this.genomicService = genomicService;
        this.sceneManager = sceneManager;
        this.raycastService = raycastService;

        this.coordinateIndex = new AnnotationCoordinateIndex()
        this.canvas = new AnnotationCanvas(container)

        this.boundResizeHandler = () => {}
        this.boundMouseMoveHandler = () => {}
        this.boundMouseEnterHandler = () => {}
        this.boundMouseLeaveHandler = () => {}

        this.setupEventHandlers()

        this.setupEventBusSubscriptions()

    }

    setupEventHandlers(): void {

        this.boundResizeHandler = () => this.canvas.resize();
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

        const { assembly } = data

        this.assembly = assembly.name

        const { spine } = this.genomicService.assemblyWalkMap.get(this.assembly).spineFeatures

        const { nodes, bpStart, bpEnd } = this.coordinateIndex.build(spine, this.sceneManager)

        const chr = this.genomicService.getSequenceId(this.assembly)

        const genomeLibraryKey = this.genomicService.getGenomeLibraryKey(this.assembly)

        this.canvas.showSpinner()

        console.log(`AnnotationRenderService: loading genome payload for "${genomeLibraryKey}" ...`)
        console.time(`AnnotationRenderService: genome payload "${genomeLibraryKey}"`)
        // @ts-ignore — app is a late-bound export from unchecked JS
        const result = await globals.app.genomeLibrary.getGenomePayload(genomeLibraryKey)
        console.timeEnd(`AnnotationRenderService: genome payload "${genomeLibraryKey}"`)

        if (undefined === result) {
            // Unknown genome: no RefSeq/annotation data — fall back to extent markers only
            this.canvas.hasGeneAnnotations = false
            this.canvas.renderGenomicExtents({ nodes, chr, bpStart, bpEnd })
        } else {
            this.canvas.hasGeneAnnotations = true
            const {geneFeatureSource, geneRenderer} = result
            this.featureSource = geneFeatureSource
            this.canvas.featureRenderer = geneRenderer
            console.log(`AnnotationRenderService: fetching features for ${chr}:${bpStart}-${bpEnd} ...`)
            console.time(`AnnotationRenderService: features fetched`)
            const features = await this.getFeatures(chr, bpStart, bpEnd)
            console.timeEnd(`AnnotationRenderService: features fetched`)
            console.log(`AnnotationRenderService: ${features ? features.length : 0} features returned`)
            this.canvas.renderGeneAnnotation({ bpStart, bpEnd, features })
        }

        this.canvas.hideSpinner()

    }

    handleAssemblyNormal(data: any): void {

        this.featureSource = undefined

        this.canvas.hasGeneAnnotations = false
        this.canvas.featureRenderer = undefined

        this.coordinateIndex.clear()

        this.canvas.clear()
    }

    handleLineIntersection(data: { t: number; nodeName: string }): void {

        if (this.coordinateIndex.isEmpty) {
            return
        }

        const { t, nodeName } = data

        const param = this.coordinateIndex.getTrackParamFromLineIntersection(nodeName, t)
        if (param === null) return

        this.canvas.showFeedbackAtParam(param)
    }

    handleClearIntersection(data: Record<string, never>): void {
        this.canvas.hideFeedback()
    }

    async getFeatures(chr: string, start: number, end: number): Promise<any> {
        return await this.featureSource.getFeatures({chr, start, end})
    }

    handleMouseEnter(event: MouseEvent): void {
        this.raycastService.disable()
        this.canvas.hideFeedback()
    }

    handleMouseLeave(event: MouseEvent): void {
        this.raycastService.enable()
        this.canvas.hideFeedback()
    }

    handleMouseMove(event: MouseEvent): void {

        if (this.coordinateIndex.isEmpty) {
            return
        }

        const { left, width } = this.container.getBoundingClientRect();
        const exe = event.clientX - left;

        this.canvas.showFeedbackAtPixel(exe)

        const param = (exe / width)

        const result = this.coordinateIndex.getXYZFromTrackParam(param, this.sceneManager)
        if (!result) return;
        const { xyz: pointOnLine } = result;

        this.raycastService.showVisualFeedback(pointOnLine, RayCastService.VISUAL_FEEDBACK_NAME_COLOR_THREE_JS)
    }

    clear(): void {
        this.coordinateIndex.clear()
        this.canvas.clear()
    }

    dispose(): void {

        this.emphasizeUnsub()

        this.normalUnsub()

        this.lineIntersectionUnsub()

        this.clearIntersectioUnsub()

        window.removeEventListener('resize', this.boundResizeHandler);

        if (this.container) {
            this.container.removeEventListener('mousemove', this.boundMouseMoveHandler);
            this.container.removeEventListener('mouseenter', this.boundMouseEnterHandler);
            this.container.removeEventListener('mouseleave', this.boundMouseLeaveHandler);
        }

        this.canvas.dispose()

        this.featureSource = null;

        this.coordinateIndex.clear()
    }

}

export default AnnotationRenderService;
