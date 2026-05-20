import {globals} from "./main.js"
import eventBus from "./utils/eventBus.ts"
import RayCastService from "./raycastService.js"
import AnnotationCoordinateIndex from "./annotationCoordinateIndex.ts"
import AnnotationCanvas from "./annotationCanvas.ts"

/**
 * Wires event bus subscriptions and DOM mouse handlers to the coordinate
 * index and canvas. Orchestrates the assembly emphasis lifecycle:
 * build index → load genome → render annotations.
 *
 * No DOM manipulation, no coordinate math — just event wiring and orchestration.
 */
class AnnotationTrackController {

    private container: HTMLElement
    private genomicService: any
    private sceneManager: any
    private raycastService: any

    private coordinateIndex: AnnotationCoordinateIndex
    private canvas: AnnotationCanvas

    private assembly: string | undefined

    private boundResizeHandler: () => void
    private boundMouseMoveHandler: (event: MouseEvent) => void
    private boundMouseEnterHandler: (event: MouseEvent) => void
    private boundMouseLeaveHandler: (event: MouseEvent) => void

    private emphasizeUnsub!: () => void
    private normalUnsub!: () => void
    private pclaiEmphasizeUnsub!: () => void
    private pclaiDeselectUnsub!: () => void
    private lineIntersectionUnsub!: () => void
    private clearIntersectionUnsub!: () => void

    constructor(deps: {
        container: HTMLElement
        coordinateIndex: AnnotationCoordinateIndex
        canvas: AnnotationCanvas
        genomicService: any
        sceneManager: any
        raycastService: any
    }) {
        this.container = deps.container
        this.coordinateIndex = deps.coordinateIndex
        this.canvas = deps.canvas
        this.genomicService = deps.genomicService
        this.sceneManager = deps.sceneManager
        this.raycastService = deps.raycastService

        this.boundResizeHandler = () => this.canvas.resize()
        this.boundMouseMoveHandler = this.handleMouseMove.bind(this)
        this.boundMouseEnterHandler = this.handleMouseEnter.bind(this)
        this.boundMouseLeaveHandler = this.handleMouseLeave.bind(this)
    }

    start(): void {
        window.addEventListener('resize', this.boundResizeHandler)
        this.container.addEventListener('mousemove', this.boundMouseMoveHandler)
        this.container.addEventListener('mouseenter', this.boundMouseEnterHandler)
        this.container.addEventListener('mouseleave', this.boundMouseLeaveHandler)

        this.emphasizeUnsub = eventBus.subscribe('assembly:emphasis', this.handleAssemblyEmphasis.bind(this))
        this.normalUnsub = eventBus.subscribe('assembly:normal', this.handleAssemblyNormal.bind(this))
        this.pclaiEmphasizeUnsub = eventBus.subscribe('pclaiWidget:emphasis', this.handleAssemblyEmphasis.bind(this))
        this.pclaiDeselectUnsub = eventBus.subscribe('pclaiWidget:deselect', this.handleAssemblyNormal.bind(this))
        this.lineIntersectionUnsub = eventBus.subscribe('lineIntersection', this.handleLineIntersection.bind(this))
        this.clearIntersectionUnsub = eventBus.subscribe('clearIntersection', this.handleClearIntersection.bind(this))
    }

    destroy(): void {
        this.emphasizeUnsub()
        this.normalUnsub()
        this.pclaiEmphasizeUnsub()
        this.pclaiDeselectUnsub()
        this.lineIntersectionUnsub()
        this.clearIntersectionUnsub()

        window.removeEventListener('resize', this.boundResizeHandler)
        this.container.removeEventListener('mousemove', this.boundMouseMoveHandler)
        this.container.removeEventListener('mouseenter', this.boundMouseEnterHandler)
        this.container.removeEventListener('mouseleave', this.boundMouseLeaveHandler)

    }

    private async handleAssemblyEmphasis(data: { assembly: { name: string }; resolvedAssemblyKey?: string; mode?: 'walk' | 'subgraph' }): Promise<void> {

        const { assembly, resolvedAssemblyKey, mode } = data

        this.assembly = resolvedAssemblyKey ?? assembly.name

        const trackModel = this.genomicService.getAssemblyTrackModel(this.assembly)
        if (!trackModel) {
            // Producer (e.g. PCLAI widget) emphasized an assembly with no track model
            // (no assemblyIndex entry, or no node metadata for this assembly).
            // Leave any prior annotation track in place; clearing would create flicker on transient selections.
            return
        }

        const { anchors, bpStart, bpEnd } = this.coordinateIndex.build(trackModel)

        const chr = this.genomicService.getSequenceId(this.assembly)

        const genomeLibraryKey = this.genomicService.getGenomeLibraryKey(this.assembly)

        this.canvas.showSpinner()

        console.log(`AnnotationTrackController: loading genome payload for "${genomeLibraryKey}" ...`)
        console.time(`AnnotationTrackController: genome payload "${genomeLibraryKey}"`)
        // @ts-ignore — app is a late-bound export from unchecked JS
        const result = await globals.app.genomeLibrary.getGenomePayload(genomeLibraryKey)
        console.timeEnd(`AnnotationTrackController: genome payload "${genomeLibraryKey}"`)

        if (undefined === result) {
            // Unknown genome: no RefSeq/annotation data — fall back to extent markers only
            this.canvas.hasGeneAnnotations = false
            this.canvas.renderGenomicExtents({ anchors, chr, bpStart, bpEnd })
        } else {
            this.canvas.hasGeneAnnotations = true
            const {geneFeatureSource, geneRenderer} = result
            this.canvas.featureRenderer = geneRenderer
            console.log(`AnnotationTrackController: fetching features for ${chr}:${bpStart}-${bpEnd} ...`)
            console.time(`AnnotationTrackController: features fetched`)
            const features = await geneFeatureSource.getFeatures({chr, start: bpStart, end: bpEnd})
            console.timeEnd(`AnnotationTrackController: features fetched`)
            console.log(`AnnotationTrackController: ${features ? features.length : 0} features returned`)
            this.canvas.renderGeneAnnotation({ bpStart, bpEnd, features })
        }

        // Walk-mode veil: grey out off-walk anchor ranges. Mapping is untouched.
        const walkNodeIds = mode === 'walk' ? trackModel.walkNodeIds : null
        this.canvas.renderDeEmphasisOverlay({ anchors, walkNodeIds, bpStart, bpEnd })

        // Diagnostic overlay (no-op unless appConfig.diagnostic.bpBandOverlay is on).
        this.canvas.renderBpBandOverlay({ anchors, bpStart, bpEnd })

        this.canvas.hideSpinner()

    }

    private handleAssemblyNormal(data: any): void {

        this.canvas.hasGeneAnnotations = false
        this.canvas.featureRenderer = undefined

        this.coordinateIndex.clear()

        this.canvas.clear()
    }

    private handleLineIntersection(data: { t: number; nodeName: string }): void {

        if (this.coordinateIndex.isEmpty) {
            return
        }

        const { t, nodeName } = data

        const param = this.coordinateIndex.getTrackParamFromLineIntersection(nodeName, t)
        if (param === null) return

        this.canvas.showFeedbackAtParam(param)
    }

    private handleClearIntersection(data: Record<string, never>): void {
        this.canvas.hideFeedback()
    }

    private handleMouseEnter(event: MouseEvent): void {
        this.raycastService.disable()
        this.canvas.hideFeedback()
    }

    private handleMouseLeave(event: MouseEvent): void {
        this.raycastService.enable()
        this.canvas.hideFeedback()
    }

    private handleMouseMove(event: MouseEvent): void {

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
}

export default AnnotationTrackController
