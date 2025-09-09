import * as THREE from 'three'
import CameraManager from './cameraManager.js'
import MapControlsFactory from './mapControlsFactory.js'
import RendererFactory from './rendererFactory.js'
import RayCastService from "./raycastService.js"
import {loadPath, prettyPrint, getWorldDistanceFromPixelDistance} from './utils/utils.js'
import eventBus from './utils/eventBus.js';
import { annotationRenderService } from "./main.js"
import {getAppleCrayonColorByName} from "./utils/color.js"
import {calculateBasicStats, calculatePercentiles, prettyPrintPercentiles} from "./utils/stats.js"
import lineMaterialResolutionService from "./lineMaterialResolutionService.js"
import materialService from './materialService.js'
import Look from "./look.js"

class App {

    constructor(container, frustumSize, pangenomeService, raycastService, genomicService, geometryManager, assemblyWidget, genomeLibrary, sceneManager, lookManager) {
        this.container = container

        this.renderer = RendererFactory.createRenderer(container)

        lineMaterialResolutionService.initialize(this.renderer)

        this.pangenomeService = pangenomeService
        this.genomicService = genomicService
        this.geometryManager = geometryManager
        this.assemblyWidget = assemblyWidget
        this.genomeLibrary = genomeLibrary
        this.sceneManager = sceneManager
        this.lookManager = lookManager

        // Initialize time tracking
        this.clock = new THREE.Clock()

        this.cameraManager = new CameraManager(frustumSize, container.clientWidth/container.clientHeight)
        this.mapControl = MapControlsFactory.create(this.cameraManager.camera, container)

        this.raycastService = raycastService

        sceneManager.getActiveScene().add(this.raycastService.setupVisualFeedback());

        // Initialize tooltip
        this.isTooltipEnabled = undefined

        this.tooltip = this.createTooltip();

        this.feedbackColor = getAppleCrayonColorByName('maraschino')

        // Setup resize handler
        window.addEventListener('resize', () => {
            const { clientWidth, clientHeight } = this.container
            this.cameraManager.windowResizeHelper(clientWidth/clientHeight)
            this.renderer.setSize(clientWidth, clientHeight)
            // Update line material resolutions for worldUnits: false
            lineMaterialResolutionService.handleResize()
        })
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
            this.raycastService.showVisualFeedback(point, new THREE.Color(0x00ff00));
            this.showTooltip(object, point, 'edge');
        } else if (object.userData?.type === 'node') {

            const { t, nodeName, line } = this.raycastService.handleIntersection(this.geometryManager, intersections[0], RayCastService.DIRECT_LINE_INTERSECTION_STRATEGY)

            // const { x, y } = point
            // const exe = `${ prettyPrint(Math.floor(x)) }`
            // const wye = `${ prettyPrint(Math.floor(y)) }`
            // // console.log(`xyz(${ exe }, ${ wye }) t ${ t.toFixed(4) }`)
            //
            // const { x:_x, y:_y } = line.getPoint(t, 'world')
            // const _exe = `${ prettyPrint(Math.floor(_x)) }`
            // const _wye = `${ prettyPrint(Math.floor(_y)) }`
            // console.log(`intersectionXY (${ exe }, ${ wye }) xyDerivedFromT (${ _exe }, ${ _wye })`)

            eventBus.publish('lineIntersection', { t, nodeName, nodeLine:line })

            this.showTooltip(object, point, 'node')

        }
    }

    handleEdgeIntersection(edgeObject, point) {
        this.raycastService.showVisualFeedback(point, new THREE.Color(0x00ff00));
        this.showTooltip(edgeObject, point, 'edge');
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
            const screenPoint = point.clone().project(this.cameraManager.camera);

            // Convert to CSS coordinates
            const rect = this.container.getBoundingClientRect();
            const x = (screenPoint.x + 1) * rect.width / 2;
            const y = (-screenPoint.y + 1) * rect.height / 2;

            // Get the current look
            const look = this.lookManager.getLook(this.sceneManager.getActiveSceneName());

            // Try to get custom tooltip content from the look for nodes
            let content = '';
            if (type === 'edge') {
                // Default edge tooltip content
                const { nodeNameStart, nodeNameEnd, geometryKey } = object.userData;
                content = `
                <div><strong>Key:</strong> ${geometryKey}</div>
                <div><strong>Start Node:</strong> ${nodeNameStart}</div>
                <div><strong>End Node:</strong> ${nodeNameEnd}</div>`;
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

            // Position tooltip
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

    clearIntersection() {
        this.raycastService.clearIntersection()
        this.renderer.domElement.style.cursor = '';
        this.hideTooltip()
        eventBus.publish('clearIntersection', {})
    }

    animate() {

        const worldSize = getWorldDistanceFromPixelDistance(this.cameraManager.camera, Look.NODE_LINE_WIDTH_PIXELS, this.container)
        lineMaterialResolutionService.updateAllLineWidths(worldSize)

        if (true === this.raycastService.isEnabled) {

            // this.raycastService.updateLine2Threshold(this.cameraManager.camera)

            const all = [ ...this.geometryManager.linesGroup.children, ...this.geometryManager.edgesGroup.children ];
            const intersections = this.raycastService.intersectObjects(this.cameraManager.camera, all)

            this.handleIntersection(intersections)
        }

        this.mapControl.update()

        const deltaTime = this.clock.getDelta()

        const look = this.lookManager.getLook(this.sceneManager.getActiveSceneName())
        look.updateBehavior(deltaTime, this.geometryManager)

        this.renderer.render(this.sceneManager.getActiveScene(), this.cameraManager.camera)
    }

    startAnimation() {
        this.renderer.setAnimationLoop(() => this.animate())
    }

    stopAnimation() {
        this.renderer.setAnimationLoop(null)
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

            // Handle Mesh objects (if any remain)
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

    async handleSearch(url) {
        this.stopAnimation()

        // Clear existing data and geometry
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

        annotationRenderService.clear()

        this.genomicService.clear()

        await this.genomicService.createMetadata(json, this.pangenomeService, this.genomeLibrary, this.geometryManager, this.raycastService)

        this.assemblyWidget.configure()

        const look = this.lookManager.getLook(this.sceneManager.getActiveSceneName())
        const scene = this.sceneManager.getActiveScene()

        const isMinigraphCactus = url.includes('graphtype=mc')

        this.geometryManager.createGeometry(json, look, isMinigraphCactus)

        /*
        const nodeLengths = Object.values(json.node).map(({ length }) => length)
        // const stats = calculateBasicStats(nodeLengths)
        const nodeLengthPercentiles = calculatePercentiles(nodeLengths)
        const report = prettyPrintPercentiles(nodeLengthPercentiles, nodeLengths, "Node Lengths");
        console.log(report);

        if (isMinigraphCactus) {
            console.log('graph is Minigraph Cactus')

            // const assemblyKey = 'GRCh38#0#chr8'
            //
            // const features = this.pangenomeService.getSpineFeatures(
            //     assemblyKey,
            //     {
            //         includeOffSpineComponents: "none",
            //         maxPathsPerEvent: 1,
            //         maxRegionHops: 64,
            //         maxRegionNodes: 4000,
            //         maxRegionEdges: 4000,
            //         operationBudget: 500000,
            //         locusStartBp: 0
            //     },
            //     {
            //         startPolicy: "preferArrowEndpoint",
            //         directionPolicy: "edgeFlow"
            //     }
            // );

            // const walk = this.pangenomeService.getAssemblyWalk(assemblyKey, { startPolicy: "preferArrowEndpoint", directionPolicy: "edgeFlow" });

            return;

        }
         */

        this.geometryManager.addToScene(scene)

        // console.log(`BEFORE camera zoom ${ this.cameraManager.camera.zoom }`)
        this.updateViewToFitScene(scene, this.cameraManager, this.mapControl)
        // console.log(` AFTER camera zoom ${ this.cameraManager.camera.zoom }`)

        this.startAnimation()
    }

    /**
     * Clear current data and geometry from the active scene
     */
    clearCurrentData() {

        this.genomicService.clear()

        this.geometryManager.clear()

        lineMaterialResolutionService.materials.clear()

        materialService.lineMaterialCache.clear()

        const look = this.lookManager.getLook(this.sceneManager.getActiveSceneName())
        look.materialCache.clear()

        // Clear the current scene (but keep the scene itself)
        this.sceneManager.clearScene(this.sceneManager.getActiveScene())

        // Re-add visual feedback to the cleared scene
        const scene = this.sceneManager.getActiveScene()
        scene.add(this.raycastService.setupVisualFeedback())
    }

    /**
     * Switch to a different scene
     * @param {string} sceneName - Name of the scene to switch to
     */
    switchScene(sceneName) {
        if (!this.sceneManager.hasScene(sceneName)) {
            console.error(`Scene '${sceneName}' not found`)
            return false
        }

        this.sceneManager.setActiveScene(sceneName)
        return true
    }

    /**
     * Create a new scene with the given name and look
     * @param {string} sceneName - Name for the new scene
     * @param {Object} look - The look to apply to the scene
     * @param {THREE.Color} backgroundColor - Background color for the scene
     */
    createScene(sceneName, look, backgroundColor = new THREE.Color(0xffffff)) {
        // Create the scene
        const scene = this.sceneManager.createScene(sceneName, backgroundColor)

        // Set the look for this scene
        this.lookManager.setLook(sceneName, look)

        // Add visual feedback to the new scene
        scene.add(this.raycastService.setupVisualFeedback())

        return scene
    }
}

export default App
