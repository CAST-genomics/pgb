import {app} from "./main.js"
import eventBus from "./utils/eventBus.js"
import {colorToRGBString, getAppleCrayonColorByName, getRandomPastelAppleCrayonColor} from "./utils/color.js"
import { getLineXYZWithTrackBasepair, buildBpIndex, buildNodeEndpointMap, makeNodeRecordMap, getTrackParameterWithLineParameter } from "./utils/annotationTrackUtils.js"

class AnnotationRenderService {

    constructor(container, genomicService, geometryManager, raycastService) {

        this.container = container;
        this.genomicService = genomicService;
        this.geometryManager = geometryManager;
        this.raycastService = raycastService;

        this.bpIndex = undefined
        this.bpIndexMap = new Map()
        this.endpointMap = new Map()

        this.splineParameterMap = new Map()

        this.isSequenceRenderer = false

        this.createVisualFeedbackElement();

        this.resizeCanvas(container);

        this.setupEventHandlers()

        this.setupEventBusSubscriptions()

    }

    setupEventHandlers() {

        this.boundResizeHandler = this.resizeCanvas.bind(this, this.container);
        window.addEventListener('resize', this.boundResizeHandler);

        this.boundMouseMoveHandler = this.handleMouseMove.bind(this);
        this.container.addEventListener('mousemove', this.boundMouseMoveHandler);

        this.boundMouseEnterHandler = this.handleMouseEnter.bind(this);
        this.container.addEventListener('mouseenter', this.boundMouseEnterHandler);

        this.boundMouseLeaveHandler = this.handleMouseLeave.bind(this);
        this.container.addEventListener('mouseleave', this.boundMouseLeaveHandler);
    }

    setupEventBusSubscriptions() {
        this.emphasizeUnsub = eventBus.subscribe('assembly:emphasis', this.handleAssemblyEmphasis.bind(this))
        this.normalUnsub = eventBus.subscribe('assembly:normal', this.handleAssemblyNormal.bind(this))
        this.lineIntersectionUnsub = eventBus.subscribe('lineIntersection', this.handleLineIntersection.bind(this))
        this.clearIntersectioUnsub = eventBus.subscribe('clearIntersection', this.handleClearIntersection.bind(this))
    }

    async handleAssemblyEmphasis(data) {

        this.splineParameterMap.clear()

        const { assembly } = data

        this.assembly = assembly

        const { spine } = this.genomicService.assemblyWalkMap.get(assembly).spineFeatures
        const { nodes, edges } = spine

        this.bpIndex = buildBpIndex(spine);
        this.bpIndexMap = makeNodeRecordMap(this.bpIndex)

        const walkNodes = spine.nodes.map(n => n.id);

        this.endpointMap = buildNodeEndpointMap(walkNodes, this.geometryManager);

        const { chr } = this.genomicService.locus
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

        const [ genomeId, haplotype, sequence_id ] = assembly.split('#')
        const result = await app.genomeLibrary.getGenomePayload(genomeId)

        if (undefined === result) {
            this.isSequenceRenderer = true
            this.drawConfig = { nodes, chr, bpStart, bpEnd }
            this.renderGenomicExtents(this.drawConfig)
        } else {
            this.isSequenceRenderer = false
            const {geneFeatureSource, geneRenderer} = result
            this.featureSource = geneFeatureSource
            this.featureRenderer = geneRenderer
            const features = await this.getFeatures(chr, bpStart, bpEnd)
            this.renderGeneAnnotation({ container: this.container, bpStart, bpEnd, features })
        }

    }

    handleAssemblyNormal(data) {

        this.featureSource = undefined

        this.featureRenderer = undefined

        this.isSequenceRenderer = false

        this.drawConfig = undefined

        this.splineParameterMap.clear()

        this.bpIndexMap.clear()

        this.bpIndex = undefined

        this.endpointMap.clear()

        this.clear()
    }

    handleLineIntersection(data) {

        if (0 === this.splineParameterMap.size) {
            return
        }

        const { t, nodeName } = data

        if (undefined === this.splineParameterMap.get(nodeName)) {
            return
        }

        const { bp, u:tOriented } = getTrackParameterWithLineParameter(nodeName, t, this.bpIndex, this.endpointMap, this.bpIndexMap)

        const { startParam, endParam } = this.splineParameterMap.get(nodeName)
        const param = startParam * ( 1 - tOriented) + endParam * tOriented

        this.visualFeedbackElement.style.display = 'block';

        const { width } = this.container.getBoundingClientRect();
        this.visualFeedbackElement.style.left = `${ Math.floor(width * param) }px`;
    }

    handleClearIntersection(data) {
        this.visualFeedbackElement.style.display = 'none';
        this.visualFeedbackElement.style.left = '-8px';
    }

    createVisualFeedbackElement() {
        this.visualFeedbackElement = document.createElement('div');
        this.visualFeedbackElement.className = 'pgb-gene-annotation-track-container__visual-feedback';
        this.container.appendChild(this.visualFeedbackElement);
    }

    renderGenomicExtents(config) {

        const { nodes, bpStart:assemblyBPStart, bpEnd:assemblyBPEnd } = config

        const canvas = this.container.querySelector('canvas')
        const { width, height } = canvas.getBoundingClientRect();

        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, width, height);

        const bpLength = Math.max(1, assemblyBPEnd - assemblyBPStart);
        const bpPerPixel = bpLength / width
        const pixelPerBP = 1/bpPerPixel

        ctx.fillStyle = colorToRGBString(getAppleCrayonColorByName('aluminum'))

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

    renderGeneAnnotation(renderConfig) {

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

    async getFeatures(chr, start, end) {
        return await this.featureSource.getFeatures({chr, start, end})
    }

    resizeCanvas(container) {
        const dpr = window.devicePixelRatio || 1;
        const {width, height} = container.getBoundingClientRect();

        // Set the canvas size in pixels
        const canvas = container.querySelector('canvas')
        canvas.width = width * dpr;
        canvas.height = height * dpr;

        // Scale the canvas context to match the device pixel ratio
        const ctx = canvas.getContext('2d')
        ctx.scale(dpr, dpr);

        // Set the canvas CSS size to match the container
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`

        if (false === this.isSequenceRenderer && this.drawConfig) {
            this.renderGeneAnnotation(this.drawConfig);
        } else if (true === this.isSequenceRenderer && this.drawConfig) {
            this.renderGenomicExtents(this.drawConfig)
        } else {
            ctx.clearRect(0, 0, width, height);
        }

    }

    handleMouseEnter(event) {
        this.raycastService.disable()
        this.visualFeedbackElement.style.display = 'block'
        this.visualFeedbackElement.style.left = '-8px'
    }

    handleMouseLeave(event) {
        this.raycastService.enable()
        this.visualFeedbackElement.style.display = 'none'
        this.visualFeedbackElement.style.left = '-8px'
    }

    handleMouseMove(event) {

        if (0 === this.splineParameterMap.size) {
            return
        }

        const { left, width } = this.container.getBoundingClientRect();
        const exe = event.clientX - left;

        this.visualFeedbackElement.style.left = `${exe}px`

        const param = (exe / width)

        const bp= Math.floor(this.bpStart * ( 1 - param) + this.bpEnd * param)

        const { nodeId, t, xyz:pointOnLine, u } = getLineXYZWithTrackBasepair(bp, this.bpIndex, this.endpointMap, this.geometryManager);


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
        this.raycastService.showVisualFeedback(pointOnLine, app.feedbackColor)
    }

    clear() {

        this.splineParameterMap.clear()

        this.bpIndex = undefined

        this.bpIndexMap.clear()

        this.endpointMap.clear()

        const { width, height } = this.container.getBoundingClientRect();
        const canvas = this.container.querySelector('canvas')
        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, width, height);
    }

    dispose() {

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

        this.drawConfig = null;

        this.featureSource = null;
        this.featureRenderer = null;

        this.splineParameterMap.clear()
    }

}

export default AnnotationRenderService;
