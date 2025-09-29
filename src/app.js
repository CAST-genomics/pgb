import * as THREE from 'three'
import CameraManager from './cameraManager.js'
import MapControlsFactory from './mapControlsFactory.js'
import RendererFactory from './rendererFactory.js'
import RayCastService from "./raycastService.js"
import {loadPath} from './utils/utils.js'
import eventBus from './utils/eventBus.js';
import { annotationRenderService } from "./main.js"
import lineMaterialResolutionService from "./lineMaterialResolutionService.js"
import materialService from './materialService.js'

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

        window.addEventListener('resize', () => {
            const { clientWidth, clientHeight } = this.container
            this.cameraManager.windowResizeHelper(clientWidth/clientHeight)
            this.renderer.setSize(clientWidth, clientHeight)
            // Update line material resolutions for worldUnits: false
            lineMaterialResolutionService.handleResize()
        })
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
                scene.add(this.raycastService.setupVisualFeedback())
            }

            if (doPauseAnimation) {
                this.startAnimation()
            }

        }
    }

    animate() {

        const scene = this.sceneManager.getActiveScene()

        if (true === this.raycastService.isEnabled) {

            const nodeMeshGroup = scene.getObjectByName('NodeMeshGroup')
            const edgeMeshGroup = scene.getObjectByName('EdgeMeshGroup')

            const all = [ ...nodeMeshGroup.children, ...edgeMeshGroup.children ];
            const intersections = this.raycastService.intersectObjects(this.cameraManager.camera, all)

            this.handleIntersection(intersections)
        }

        this.mapControl.update()

        const deltaTime = this.clock.getDelta()

        const look = this.sceneManager.getActiveLook()
        look.updateBehavior(deltaTime, scene)

        this.renderer.render(scene, this.cameraManager.camera)
    }

    handleIntersection(intersections) {

        if (undefined === intersections || 0 === intersections.length) {
            this.clearIntersection()
            return
        }

        // Sort by distance to get the closest intersection
        intersections.sort((a, b) => a.distance - b.distance);

        const { point, object } = intersections[0];

        // this.renderer.domElement.style.cursor = 'none';

        if (object.userData?.type === 'edge') {
            this.raycastService.showVisualFeedback(point, RayCastService.VISUAL_FEEDBACK_NAME_COLOR_THREE_JS);
            this.showTooltip(object, point, 'edge');
        } else if (object.userData?.type === 'node') {

            const { t, nodeName, line } = this.raycastService.handleIntersection(this.geometryManager, intersections[0], RayCastService.DIRECT_LINE_INTERSECTION_STRATEGY)

            eventBus.publish('lineIntersection', { t, nodeName, nodeLine:line })

            this.showTooltip(object, point, 'node')

        }
    }

    handleEdgeIntersection(edgeObject, point) {
        this.raycastService.showVisualFeedback(point, RayCastService.VISUAL_FEEDBACK_NAME_COLOR_THREE_JS);
        this.showTooltip(edgeObject, point, 'edge');
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
            this.startAnimation()
            return
        }

        this.pangenomeService.loadData(json)

        await this.genomicService.initialize(json, this.pangenomeService)

        this.widgetService.reset()

        this.geometryManager.createGeometry(json)

        this.setActiveScene('assemblyVisualizationScene')

        this.geometryManager.createAllSceneNodeMeshes(this.sceneManager.scenes, this.sceneManager.lookManager)

        this.geometryManager.createAllSceneEdgeMeshes(this.sceneManager.scenes, this.sceneManager.lookManager)

        const scene = this.sceneManager.getActiveScene()
        this.updateViewToFitScene(scene, this.cameraManager, this.mapControl)

        this.startAnimation()
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

        const tooltip = document.createElement('div');
        tooltip.className = 'graph-tooltip';

        this.container.appendChild(tooltip);

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

            console.log(`show tooltip xy(${ x }, ${ y })`)

            // Get the current look
            const look = this.sceneManager.getActiveLook()

            // Try to get custom tooltip content from the look for nodes
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
                // Only use custom tooltip content if the look is active
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

        this.tooltip.innerHTML = ''

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

        // if (true === this.sceneManager.isActive()) {
        //     const look = this.sceneManager.getActiveLook()
        //     look.materialCache.clear()
        // }

        this.sceneManager.lookManager.clearAllMaterialCaches()

        this.sceneManager.clearAllScenes()

    }

}

export default App
