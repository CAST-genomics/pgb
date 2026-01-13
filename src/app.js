import * as THREE from 'three'
import CameraManager from './cameraManager.js'
import MapControlsFactory from './mapControlsFactory.js'
import RendererFactory from './rendererFactory.js'
import RayCastService from "./raycastService.js"
import {getWorldDistanceFromPixelDistance, loadPath} from './utils/utils.js'
import eventBus from './utils/eventBus.js';
import { annotationRenderService } from "./main.js"
import lineMaterialResolutionService from "./lineMaterialResolutionService.js"
import materialService from './materialService.js'
import Look from "./looks/look.js"
import { assemblyMetadataService } from "./assemblyMetadataService.js"
import { pclaiCoordinateService } from "./widgets/pclaiCoordinateService.js"
import { pcaChartService } from "./widgets/pcaChartService.js"

let xxPre = undefined
let yyPre = undefined

class App {

    constructor(container, frustumSize, pangenomeService, raycastService, genomicService, geometryManager, widgetService, genomeLibrary, sceneManager) {
        this.container = container

        this.renderer = RendererFactory.createRenderer(container)

        lineMaterialResolutionService.initialize(this.renderer)

        this.pangenomeService = pangenomeService
        this.genomicService = genomicService
        this.geometryManager = geometryManager
        this.widgetService = widgetService
        this.genomeLibrary = genomeLibrary
        this.sceneManager = sceneManager

        this.clock = new THREE.Clock()

        this.cameraManager = new CameraManager(frustumSize, container.clientWidth/container.clientHeight)
        this.mapControl = MapControlsFactory.create(this.cameraManager.camera, container)

        this.raycastService = raycastService

        this.isTooltipEnabled = undefined

        this.tooltip = this.createTooltip();

        // Register mouse over callback (stationary hover)
        this.raycastService.registerMouseOverHandler((intersection, event) => {
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
        this.raycastService.registerMouseMoveHandler((intersection, event) => {
            if (!intersection) {
                this.clearIntersection()
                return
            }
            const {object, point} = intersection
            if ('node' === object.userData?.type) {
                const {t, nodeName} = intersection
                eventBus.publish('lineIntersection', {t, nodeName, nodeLine: object})
            }
        })

        window.addEventListener('resize', () => {
            const { clientWidth, clientHeight } = this.container
            this.cameraManager.windowResizeHelper(clientWidth/clientHeight)
            this.renderer.setSize(clientWidth, clientHeight)
            // Update line material resolutions for worldUnits: false
            lineMaterialResolutionService.handleResize()
        })

        // Setup drag and drop functionality
        this.setupDragAndDrop()
    }

    setActiveScene(sceneName, doPauseAnimation = false){

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

    animate() {

        lineMaterialResolutionService.update(this.cameraManager.camera, this.container)

        this.mapControl.update()

        const look = this.sceneManager.getActiveLook()
        const scene = this.sceneManager.getActiveScene()
        look.updateBehavior(this.clock.getDelta(), scene)

        this.renderer.render(scene, this.cameraManager.camera)
    }

    clearIntersection() {
        this.raycastService.clearIntersection()
        this.renderer.domElement.style.cursor = '';
        this.hideTooltip()
        eventBus.publish('clearIntersection', {})
    }

    startAnimation() {
        this.renderer.setAnimationLoop(() => this.animate())
    }

    stopAnimation() {
        this.renderer.setAnimationLoop(null)
    }

    async handleSearch(url) {

        this.stopAnimation()

        this.clearCurrentData()

        let json
        try {
            json = await loadPath(url)
        } catch (error) {
            console.error(`Error loading ${url}:`, error)
            this.showError(`Error loading ${url}: ${error.message}`)
            this.startAnimation()
            // Re-throw the error so the caller (e.g., locusInput) can handle it
            throw error
        }

        await this.processData(json)
    }

    async processData(json) {
        this.pangenomeService.loadData(json)

        assemblyMetadataService.loadMetadata(json)

        pclaiCoordinateService.loadCoordinates(json)

        // Initialize PCA Chart with global bounding box
        pcaChartService.reset()
        await pcaChartService.initializeGlobalBoundingBox()

        await this.genomicService.initialize(json, this.pangenomeService)

        this.widgetService.updatePopulationWidget(json)

        this.widgetService.reset()

        this.geometryManager.createGeometry(json)

        this.setActiveScene('nodeEmphasisScene')

        this.geometryManager.createAllSceneNodeMeshes(this.sceneManager.scenes, this.sceneManager.lookManager)

        this.geometryManager.createAllSceneEdgeMeshes(this.sceneManager.scenes, this.sceneManager.lookManager)

        const scene = this.sceneManager.getActiveScene()
        this.updateViewToFitScene(scene, this.cameraManager, this.mapControl)

        this.startAnimation()

        // Publish event indicating a new dataset has been loaded
        eventBus.publish('datasetLoaded', { json })
    }

    updateViewToFitScene(scene, cameraManager, mapControl) {

        const bbox = new THREE.Box3()

        let foundObjects = 0;
        scene.traverse((object) => {

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

    #createBoundingSphereHelper(boundingSphere) {
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

    enableTooltip(){
        this.isTooltipEnabled = true
    }

    disableTooltip(){
        this.isTooltipEnabled = false
    }

    createTooltip() {

        const tooltip = document.createElement('div')
        this.container.appendChild(tooltip)

        tooltip.className = 'graph-tooltip';
        this.enableTooltip()

        return tooltip;
    }

    showTooltip(object, point, type) {

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

    hideTooltip() {

        if ('none' !== this.tooltip.style.display) {
            this.tooltip.style.display = 'none';
        }
    }

    clearCurrentData() {

        annotationRenderService.clear()

        this.genomicService.clear()

        this.geometryManager.clear()

        lineMaterialResolutionService.clear()

        materialService.clear()

        this.sceneManager.clearCurrentData()

    }

    setupDragAndDrop() {
        let dragCounter = 0

        this.container.addEventListener('dragover', (e) => {
            e.preventDefault()
            e.stopPropagation()

            // Only show visual feedback for file drops
            if (e.dataTransfer.types.includes('Files')) {
                this.container.classList.add('drag-over')
            }
        })

        this.container.addEventListener('dragenter', (e) => {
            e.preventDefault()
            e.stopPropagation()
            dragCounter++

            if (e.dataTransfer.types.includes('Files')) {
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

            const files = e.dataTransfer.files
            if (!files || files.length === 0) {
                return
            }

            // Process the first JSON file found
            let jsonFile = null
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
            } catch (error) {
                console.error('Error reading or parsing dropped file:', error)
                if (error instanceof SyntaxError) {
                    this.showError(`Invalid JSON file: ${error.message}`)
                } else {
                    this.showError(`Error reading file: ${error.message}`)
                }
            }
        })
    }

    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = (e) => resolve(e.target.result)
            reader.onerror = (e) => reject(new Error('Failed to read file'))
            reader.readAsText(file)
        })
    }

    clearLocusInput() {
        const locusInput = document.getElementById('pgb-locus-input')
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

    showError(message) {
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
