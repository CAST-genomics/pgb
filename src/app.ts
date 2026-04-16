import * as THREE from 'three'
import CameraManager from './cameraManager.js'
import MapControlsFactory from './mapControlsFactory.js'
import RendererFactory from './rendererFactory.js'
import RayCastService from "./raycastService.js"
import {loadPath} from './utils/utils.js'
import eventBus from './utils/eventBus.ts';
import { globals } from "./main.js"
import lineMaterialResolutionService from "./lineMaterialResolutionService.js"
import materialService from './materialService.js'
import { assemblyMetadataService } from "./assemblyMetadataService.ts"
import { pclaiCoordinateService } from "./widgets/pclaiCoordinateService.js"
import { mountPcaChart } from "./widgets/mountPcaChart.js"
import { parseDataset } from './datasetParser.ts'

let xxPre: number | undefined = undefined
let yyPre: number | undefined = undefined

class App {

    container: HTMLElement
    renderer: any
    pangenomeService: any
    genomicService: any
    geometryManager: any
    widgetService: any
    genomeLibrary: any
    sceneManager: any
    cameraManager: any
    mapControl: any
    raycastService: any
    isTooltipEnabled: boolean | undefined
    tooltip!: HTMLElement
    pcaChart: ReturnType<typeof mountPcaChart>

    constructor(container: HTMLElement, frustumSize: number, pangenomeService: any, raycastService: any, genomicService: any, geometryManager: any, widgetService: any, genomeLibrary: any, sceneManager: any) {
        this.container = container

        this.renderer = RendererFactory.createRenderer(container)

        this.pangenomeService = pangenomeService
        this.genomicService = genomicService
        this.geometryManager = geometryManager
        this.widgetService = widgetService
        this.genomeLibrary = genomeLibrary
        this.sceneManager = sceneManager

        this.cameraManager = new CameraManager(frustumSize, container.clientWidth/container.clientHeight)
        this.mapControl = MapControlsFactory.create(this.cameraManager.camera, container)

        this.raycastService = raycastService

        this.isTooltipEnabled = undefined

        this.tooltip = this.createTooltip();

        this.pcaChart = mountPcaChart();

        // Register mouse over callback (stationary hover)
        this.raycastService.registerMouseOverHandler((intersection: any, event: any) => {
            if (!intersection) {
                this.clearIntersection()
                return
            }

            const { object, point } = intersection

            if ('node' === object.userData?.type) {
                const { t, nodeName } = intersection

                // Publish the vital lineIntersection event using processed intersection
                eventBus.publish('lineIntersection', { t, nodeName, nodeLine: object })
                this.showTooltip(object, point, 'node')
            } else if ('edge' === object.userData?.type) {
                this.showTooltip(object, point, 'edge')
            }
        })

        // Register continuous move tracking to publish lineIntersection while over an object
        this.raycastService.registerMouseMoveHandler((intersection: any, event: any) => {
            if (!intersection) {
                this.clearIntersection()
                return
            }
            const {object, point} = intersection
            if ('node' === object.userData?.type) {
                const {t, nodeName} = intersection

                // Check if a coordinate key is selected and if this node has it
                const selectedCoordinateKey = this.pcaChart.selectedCoordinateKey;
                if (selectedCoordinateKey) {
                    const nodeCoordinates = pclaiCoordinateService.getCoordinatesForNode(nodeName);
                    if (!nodeCoordinates || !nodeCoordinates.has(selectedCoordinateKey)) {
                        // Node doesn't have the selected coordinate key, don't trigger hover
                        this.clearIntersection();
                        return;
                    }
                }

                eventBus.publish('lineIntersection', {t, nodeName, nodeLine: object})
            }
        })

        window.addEventListener('resize', () => {
            const { clientWidth, clientHeight } = this.container
            this.cameraManager.windowResizeHelper(clientWidth/clientHeight)
            this.renderer.setSize(clientWidth, clientHeight)
        })

        // Setup drag and drop functionality
        this.setupDragAndDrop()
    }

    setActiveScene(sceneName: string, doPauseAnimation: boolean = false): void {

        if (sceneName !== this.sceneManager.getActiveSceneName()) {

            if (doPauseAnimation) {
                this.stopAnimation()
            }

            this.sceneManager.setActiveScene(sceneName, this.renderer, this.cameraManager.camera)
            const scene = this.sceneManager.getActiveScene()

            // Only add visual feedback if it's not already present
            const existingVisualFeedback = scene.getObjectByName(this.raycastService.getVisualFeedbackName())
            if (!existingVisualFeedback) {
                console.log(`Add RaycastService Visual Feedback to Scene ${this.sceneManager.getActiveSceneName()}`)
                scene.add(this.raycastService.createVisualFeedback(RayCastService.VISUAL_FEEDBACK_NAME_COLOR_THREE_JS))
            }

            if (doPauseAnimation) {
                this.startAnimation()
            }

        }
    }

    animate(): void {

        lineMaterialResolutionService.update(this.cameraManager.camera, this.container)

        this.mapControl.update()

        const scene = this.sceneManager.getActiveScene()
        this.renderer.render(scene, this.cameraManager.camera)
    }

    clearIntersection(): void {
        this.raycastService.clearIntersection()
        this.renderer.domElement.style.cursor = '';
        this.hideTooltip()
        eventBus.publish('clearIntersection', {} as Record<string, never>)
    }

    startAnimation(): void {
        this.renderer.setAnimationLoop(() => this.animate())
    }

    stopAnimation(): void {
        this.renderer.setAnimationLoop(null)
    }

    async handleSearch(url: string): Promise<void> {

        this.stopAnimation()

        this.clearCurrentData()

        let json
        try {
            json = await loadPath(url)
        } catch (error: any) {
            console.error(`Error loading ${url}:`, error)
            this.showError(`Error loading ${url}: ${error.message}`)
            this.startAnimation()
            // Re-throw the error so the caller (e.g., locusInput) can handle it
            throw error
        }

        await this.processData(json)
    }

    async processData(json: any): Promise<void> {
        const dataset = parseDataset(json)

        await this.loadDataset(dataset)

        this.geometryManager.createGeometry(dataset)

        this.setActiveScene('nodeEmphasisScene')

        this.geometryManager.createAllSceneNodeMeshes(this.sceneManager.scenes, this.sceneManager.lookManager)

        this.geometryManager.createAllSceneEdgeMeshes(this.sceneManager.scenes, this.sceneManager.lookManager)

        const scene = this.sceneManager.getActiveScene()
        this.updateViewToFitScene(scene, this.cameraManager, this.mapControl)

        this.startAnimation()

        // Publish event indicating a new dataset has been loaded
        eventBus.publish('datasetLoaded', { dataset })
    }

    /**
     * Fan out a parsed DatasetModel to every dataset-consuming service.
     *
     * Owns the ordering so callers don't have to. Covers the data side
     * of a dataset swap only — geometry creation, scene activation, and
     * camera fitting remain in processData.
     */
    async loadDataset(dataset: any): Promise<void> {
        this.pangenomeService.loadData(dataset)

        assemblyMetadataService.loadMetadata(dataset)

        pclaiCoordinateService.loadCoordinates(dataset)

        this.pcaChart.reset()
        await this.pcaChart.initializeGlobalBoundingBox()

        await this.genomicService.initialize(dataset, this.pangenomeService)

        this.widgetService.updatePopulationWidget(dataset)
        this.widgetService.reset()
    }

    updateViewToFitScene(scene: any, cameraManager: any, mapControl: any): void {

        const bbox = new THREE.Box3()

        let foundObjects = 0;
        scene.traverse((object: any) => {

            // Handle Line2 objects (both node lines and edge lines) - check constructor name since isLine2 might not be set
            if ((object.isLine2 || object.constructor.name === 'Line2') && object.name !== 'boundingSphereHelper') {
                object.geometry.computeBoundingBox()
                const objectBox = object.geometry.boundingBox.clone()
                objectBox.applyMatrix4(object.matrixWorld)
                bbox.union(objectBox)
                foundObjects++;
            }

            else if (object.isMesh && object.name !== 'boundingSphereHelper') {
                object.geometry.computeBoundingBox()
                const objectBox = object.geometry.boundingBox.clone()
                objectBox.applyMatrix4(object.matrixWorld)
                bbox.union(objectBox)
                foundObjects++;
            }
        })

        // Calculate the bounding sphere from the bounding box
        const boundingSphere = new THREE.Sphere()
        bbox.getBoundingSphere(boundingSphere)

        const found = scene.getObjectByName('boundingSphereHelper')
        if (found) {
            scene.remove(found)
        }

        // const boundingSphereHelper = this.#createBoundingSphereHelper(boundingSphere)
        // scene.add(boundingSphereHelper)

        // Multiplier used to add padding around scene bounding sphere when framing the view
        const SCENE_VIEW_PADDING = 1.5

        // Calculate required frustum size based on the bounding sphere (with padding)
        mapControl.reset()
        const { clientWidth, clientHeight } = this.container
        cameraManager.frustumHalfSize = boundingSphere.radius * SCENE_VIEW_PADDING
        cameraManager.windowResizeHelper(clientWidth/clientHeight)

        // Position camera to frame the scene
        cameraManager.camera.position.set(0, 0, 2 * boundingSphere.radius) // Position camera at 2x the radius
        cameraManager.camera.lookAt(boundingSphere.center)

        // this.raycastService.updateLine2Threshold(cameraManager.camera)
    }

    private createBoundingSphereHelper(boundingSphere: any): any {
        const materialConfig = {
            color: 0xdddddd,
            wireframe: true,
            transparent: true,
            opacity: 0.5
        }

        const boundingSphereHelper = new THREE.Mesh(
            new THREE.SphereGeometry(boundingSphere.radius, 16, 16),
            new THREE.MeshBasicMaterial(materialConfig)
        )
        boundingSphereHelper.position.copy(boundingSphere.center)
        boundingSphereHelper.name = 'boundingSphereHelper'
        return boundingSphereHelper
    }

    enableTooltip(): void {
        this.isTooltipEnabled = true
    }

    disableTooltip(): void {
        this.isTooltipEnabled = false
    }

    createTooltip(): HTMLElement {

        const tooltip = document.createElement('div')
        this.container.appendChild(tooltip)

        tooltip.className = 'graph-tooltip';
        this.enableTooltip()

        return tooltip;
    }

    showTooltip(object: any, point: any, type: string): void {

        if (true === this.isTooltipEnabled){

            // Convert 3D world coordinates to screen coordinates
            const { x:xx, y:yy } = point.clone().project(this.cameraManager.camera)

            if (xx === xxPre && yy === yyPre) {
                return
            } else {
                xxPre = xx
                yyPre = yy
            }

            const { width, height} = this.container.getBoundingClientRect();
            const x = Math.floor(( xx + 1) * width  / 2)
            const y = Math.floor((-yy + 1) * height / 2)

            // console.log(`show tooltip xy(${ x }, ${ y })`)

            // Get the current look
            const look = this.sceneManager.getActiveLook()

            this.tooltip.innerHTML = ''
            let content = '';
            if (type === 'edge') {
                // Default edge tooltip content
                const { nodeNameStart, nodeNameEnd, geometryKey } = object.userData;
                content = `
                <div class="edge-tooltip">
                    <div class="edge-section">
                        <div class="edge-title">Edge Details</div>
                        <table class="edge-details-table">
                            <tr class="edge-detail-row">
                                <td class="edge-detail-label">Key:</td>
                                <td class="edge-detail-value">${geometryKey}</td>
                            </tr>
                            <tr class="edge-detail-row">
                                <td class="edge-detail-label">Start Node:</td>
                                <td class="edge-detail-value">${nodeNameStart}</td>
                            </tr>
                            <tr class="edge-detail-row">
                                <td class="edge-detail-label">End Node:</td>
                                <td class="edge-detail-value">${nodeNameEnd}</td>
                            </tr>
                        </table>
                    </div>
                </div>`;
            } else if (type === 'node') {

                if (look && look.isActive) {
                    content = look.createNodeTooltipContent(object);
                }

                if (!content) {
                    // Fallback to default node tooltip content
                    const { nodeName, nodeLine } = object.userData;
                    content = `
                    <div><strong>Node:</strong> ${nodeName}</div>
                    <div><strong>Line:</strong> ${nodeLine}</div>`;
                }
            }

            this.tooltip.innerHTML = content;

            const deltaX = 24
            const deltaY = 24
            this.tooltip.style.left = `${x + deltaX}px`;
            this.tooltip.style.top = `${y - deltaY}px`;
            this.tooltip.style.display = 'block';

        }
    }

    hideTooltip(): void {

        if ('none' !== this.tooltip.style.display) {
            this.tooltip.style.display = 'none';
        }
    }

    clearCurrentData(): void {

        globals.annotationTrack.clear()

        this.genomicService.clear()

        this.geometryManager.clear()

        lineMaterialResolutionService.clear()

        materialService.clear()

        this.sceneManager.clearCurrentData()

    }

    setupDragAndDrop(): void {
        let dragCounter = 0

        this.container.addEventListener('dragover', (e) => {
            e.preventDefault()
            e.stopPropagation()

            // Only show visual feedback for file drops
            if (e.dataTransfer!.types.includes('Files')) {
                this.container.classList.add('drag-over')
            }
        })

        this.container.addEventListener('dragenter', (e) => {
            e.preventDefault()
            e.stopPropagation()
            dragCounter++

            if (e.dataTransfer!.types.includes('Files')) {
                this.container.classList.add('drag-over')
            }
        })

        this.container.addEventListener('dragleave', (e) => {
            e.preventDefault()
            e.stopPropagation()
            dragCounter--

            if (dragCounter === 0) {
                this.container.classList.remove('drag-over')
            }
        })

        this.container.addEventListener('drop', async (e) => {
            e.preventDefault()
            e.stopPropagation()
            dragCounter = 0
            this.container.classList.remove('drag-over')

            const files = e.dataTransfer!.files
            if (!files || files.length === 0) {
                return
            }

            // Process the first JSON file found
            let jsonFile: File | null = null
            for (let i = 0; i < files.length; i++) {
                const file = files[i]
                if (file.type === 'application/json' || file.name.toLowerCase().endsWith('.json')) {
                    jsonFile = file
                    break
                }
            }

            if (!jsonFile) {
                this.showError('Please drop a JSON file. Other file types are not supported.')
                return
            }

            // Read and parse the file
            try {
                const fileContent = await this.readFileAsText(jsonFile)
                const json = JSON.parse(fileContent)

                this.stopAnimation()
                this.clearCurrentData()
                await this.processData(json)

                // Clear the locus input widget after successful file load
                this.clearLocusInput()
            } catch (error: any) {
                console.error('Error reading or parsing dropped file:', error)
                if (error instanceof SyntaxError) {
                    this.showError(`Invalid JSON file: ${error.message}`)
                } else {
                    this.showError(`Error reading file: ${error.message}`)
                }
            }
        })
    }

    readFileAsText(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = (e) => resolve(e.target!.result as string)
            reader.onerror = (e) => reject(new Error('Failed to read file'))
            reader.readAsText(file)
        })
    }

    clearLocusInput(): void {
        const locusInput = document.getElementById('pgb-locus-input') as HTMLInputElement | null
        const locusError = document.getElementById('pgb-locus-error')

        if (locusInput) {
            locusInput.value = ''
            locusInput.classList.remove('is-invalid')
        }

        if (locusError) {
            locusError.style.display = 'none'
            locusError.textContent = ''
        }
    }

    showError(message: string): void {
        console.error(message)

        // Create or update error display
        let errorDiv = document.getElementById('pgb-drag-drop-error')
        if (!errorDiv) {
            errorDiv = document.createElement('div')
            errorDiv.id = 'pgb-drag-drop-error'
            errorDiv.className = 'pgb-drag-drop-error'
            document.body.appendChild(errorDiv)
        }

        errorDiv.textContent = message
        errorDiv.classList.add('show')

        // Auto-hide after 5 seconds
        setTimeout(() => {
            if (errorDiv) {
                errorDiv.classList.remove('show')
            }
        }, 5000)
    }

}

export default App
