import * as THREE from 'three';
import ParametricLine from "./parametricLine.js"
import {app} from "./main.js"
import Look from "./look.js"
import lineMaterialResolutionService from "./lineMaterialResolutionService.js"
import {getWorldDistanceFromPixelDistance} from "./utils/utils.js"
import {colorComplements, getAppleCrayonColorByName, getComplementaryThreeJSColor} from "./utils/color/color.js"

class RayCastService {

    // static VISUAL_FEEDBACK_NAME_COLOR_THREE_JS = new THREE.Color(0x00ff00)
    static VISUAL_FEEDBACK_NAME_COLOR_THREE_JS = getComplementaryThreeJSColor(new THREE.Color('#dc3545'))
    static VISUAL_FEEDBACK_NAME = 'VisualFeedback'
    static VISUAL_FEEDBACK_PIXELSIZE = 6
    static MOUSE_MOVEMENT_THRESHOLD = 5;

    static DIRECT_LINE_INTERSECTION_STRATEGY = 'directLineIntersectionStrategy'
    static SPLINE_INTERPOLATION_INTERSECTION_STRATEGY = 'splineInterpolationIntersectionStrategy'

    constructor(container, threshold) {

        this.container = container

        this.pointer = new THREE.Vector2();

        this.raycaster = new THREE.Raycaster();
        this.configureRaycaster(this.raycaster, threshold);

        this.isEnabled = true;

        this.setupEventListeners(container);

        this.clickCallbacks = new Set();

        this.currentIntersection = undefined;

        this.mouseDownPosition = { x: 0, y: 0 };
        this.hasMouseMoved = false;
        this.isMouseDown = false;
    }

    configureRaycaster(raycaster, threshold) {
        raycaster.params.Line2 = {};
        raycaster.params.Line2.threshold = threshold;
    }

    setupEventListeners(container) {
        this.container = container;
        container.addEventListener('pointermove', this.onPointerMove.bind(this));
        container.addEventListener('click', this.onClick.bind(this));
        container.addEventListener('mousedown', this.onMouseDown.bind(this));
        container.addEventListener('mousemove', this.onMouseMove.bind(this));
        container.addEventListener('mouseup', this.onMouseUp.bind(this));
        container.addEventListener('contextmenu', this.onContextMenu.bind(this));
    }

    cleanup() {
        if (this.container) {
            this.container.removeEventListener('pointermove', this.onPointerMove.bind(this));
            this.container.removeEventListener('click', this.onClick.bind(this));
            this.container.removeEventListener('mousedown', this.onMouseDown.bind(this));
            this.container.removeEventListener('mousemove', this.onMouseMove.bind(this));
            this.container.removeEventListener('mouseup', this.onMouseUp.bind(this));
            this.container.removeEventListener('contextmenu', this.onContextMenu.bind(this));
        }
        this.clickCallbacks.clear();
    }

    onMouseDown(event) {
        this.mouseDownPosition = { x: event.clientX, y: event.clientY };
        this.hasMouseMoved = false;
        this.isMouseDown = true;
    }

    onMouseUp(event) {
        this.isMouseDown = false;
    }

    onMouseMove(event) {

        if (!this.isMouseDown) return;

        const deltaX = Math.abs(event.clientX - this.mouseDownPosition.x);
        const deltaY = Math.abs(event.clientY - this.mouseDownPosition.y);

        if (deltaX > RayCastService.MOUSE_MOVEMENT_THRESHOLD || deltaY > RayCastService.MOUSE_MOVEMENT_THRESHOLD) {
            this.hasMouseMoved = true;
        }
    }

    onClick(event) {

        if (this.hasMouseMoved) {
            return
        }

        // Only fire events if there's an intersection with a node
        if (this.currentIntersection) {
            for (const callback of this.clickCallbacks) {
                callback(this.currentIntersection, event);
            }
        }

        this.isMouseDown = false;
        this.hasMouseMoved = false;
    }

    onContextMenu(event) {
        // Prevent default context menu
        event.preventDefault();

        // Only fire events if there's an intersection with a node
        if (this.currentIntersection) {
            for (const callback of this.clickCallbacks) {
                callback(this.currentIntersection, event);
            }
        }
    }

    registerClickHandler(callback) {
        this.clickCallbacks.add(callback);
        return () => this.clickCallbacks.delete(callback);
    }

    onPointerMove({ clientX, clientY }) {
        const { left, top, width, height } = this.container.getBoundingClientRect();
        this.pointer.x = ((clientX - left) / width) * 2 - 1;
        this.pointer.y = -((clientY - top) / height) * 2 + 1;
    }

    updateLine2Threshold(camera) {

        // pixels
        const screenPixelThreshold = 5

        // points in NDC space
        const { width } = this.container.getBoundingClientRect()
        const v1 = new THREE.Vector3(0, 0, 0.5);
        const v2 = new THREE.Vector3(screenPixelThreshold / (width * 2), 0, 0.5);

        // NDC -> World
        v1.unproject(camera);
        v2.unproject(camera);

        // Delta in world space === updated raycast threshold
        const updatedThreshold = v1.distanceTo(v2);
        const currentThreshold = this.raycaster.params.Line2.threshold

        if (updatedThreshold.toFixed(3) !== currentThreshold.toFixed(3)) {
            console.log(`raycaster threshold update from ${currentThreshold} to ${updatedThreshold}`)
        }

        this.raycaster.params.Line2.threshold = updatedThreshold;
    }

    updateRaycaster(camera) {

        let worldSize
        worldSize = getWorldDistanceFromPixelDistance(camera, Look.NODE_LINE_WIDTH_PIXELS, this.container)
        lineMaterialResolutionService.updateAllLineWidths(worldSize)

        // update radius of the visual feedback sphere
        worldSize = getWorldDistanceFromPixelDistance(camera, RayCastService.VISUAL_FEEDBACK_PIXELSIZE, this.container)
        this.raycastVisualFeedback.scale.set(worldSize, worldSize, worldSize)

        this.raycaster.setFromCamera(this.pointer, camera);
    }

    intersectObject(camera, object) {
        this.updateRaycaster(camera);
        return this.raycaster.intersectObject(object)
    }

    intersectObjects(camera, objects) {
        this.updateRaycaster(camera)
        return this.raycaster.intersectObjects(objects)
    }

    setupVisualFeedback() {
        this.raycastVisualFeedback = this.createVisualFeeback(RayCastService.VISUAL_FEEDBACK_NAME_COLOR_THREE_JS)
        return this.raycastVisualFeedback
    }

    createVisualFeeback(color) {

        const material = new THREE.MeshBasicMaterial({ color, transparent: true, depthTest: false })
        const geometry = new THREE.SphereGeometry(1, 32, 16)
        const sphere = new THREE.Mesh(geometry, material)
        sphere.name = RayCastService.VISUAL_FEEDBACK_NAME
        sphere.visible = false
        sphere.renderOrder = 10
        return sphere
    }

    getVisualFeedbackName(){
        return RayCastService.VISUAL_FEEDBACK_NAME
    }

    showVisualFeedback(pointOnLine, visualFeedbackColor) {

        this.raycastVisualFeedback.visible = true;
        this.raycastVisualFeedback.position.copy(pointOnLine);

        // this.raycastVisualFeedback.material.color.copy(visualFeedbackColor).offsetHSL(0.7, 0, 0);
        this.raycastVisualFeedback.material.color.copy(visualFeedbackColor);
    }

    clearVisualFeedback() {

        if (this.raycastVisualFeedback){
            this.raycastVisualFeedback.visible = false;
        }

    }

    handleIntersection(geometryManager, intersection, intersectionStrategy) {

        if (RayCastService.SPLINE_INTERPOLATION_INTERSECTION_STRATEGY === intersectionStrategy){
            this.currentIntersection = this.#doSplineInterpolationIntersection(geometryManager, intersection)
        } else if (RayCastService.DIRECT_LINE_INTERSECTION_STRATEGY === intersectionStrategy) {

            // class ParametricLine implements methods to interpret a Line2 object
            // as a one-dimensional parametric line. This establishes a mapping: xyz <--> t
            // where t: 0-1
            this.currentIntersection = ParametricLine.getParameter(intersection)
        } else {
            throw new Error(`handleIntersection fail`);
        }

        const { pointOnLine, object:line } = intersection
        // this.showVisualFeedback(pointOnLine, line.material.color)
        this.showVisualFeedback(pointOnLine, RayCastService.VISUAL_FEEDBACK_NAME_COLOR_THREE_JS)

        return this.currentIntersection
    }

    #doSplineInterpolationIntersection(geometryManager, intersection){

        const { faceIndex, pointOnLine, object:line } = intersection

        const { userData } = line;
        const { nodeName } = userData;
        const spline = geometryManager.getSpline(nodeName);

        const segments = line.geometry.getAttribute('instanceStart');
        const t = this.findClosestT(spline, pointOnLine, faceIndex, segments.count);

        return { t, nodeName, line }

    }

    clearIntersection() {
        this.currentIntersection = undefined;
        this.clearVisualFeedback();
    }

    findClosestT(spline, targetPoint, segmentIndex, totalSegments, tolerance = 0.0001) {
        // Convert segment index to parameter range
        const segmentSize = 1 / totalSegments;
        const left = segmentIndex * segmentSize;
        const right = (segmentIndex + 1) * segmentSize;

        // Do a local search within this segment
        let iterations = 0;
        const maxIterations = 16;
        let bestT = left;
        let bestDist = spline.getPoint(left).distanceTo(targetPoint);

        // Sample points within the segment to find closest
        const samples = 10;
        for (let i = 0; i <= samples; i++) {
            const t = left + (right - left) * (i / samples);
            const dist = spline.getPoint(t).distanceTo(targetPoint);

            if (dist < bestDist) {
                bestDist = dist;
                bestT = t;
            }
        }

        return bestT;
    }

    // const { t, u, segmentIndex } = tFromHit(line, intersections[0])
    calculateTParameterFromIntersection(intersection){

        const { faceIndex, point, object:line } = intersection

        const P = point.clone();
        line.worldToLocal(P);

        const A = new THREE.Vector3().fromBufferAttribute(line.geometry.attributes.instanceStart, faceIndex);
        const B = new THREE.Vector3().fromBufferAttribute(line.geometry.attributes.instanceEnd,   faceIndex);

        const AB = B.clone().sub(A);

        const u = AB.lengthSq() > 0 ? THREE.MathUtils.clamp( AB.dot(P.clone().sub(A)) / AB.lengthSq(), 0, 1 ) : 0;

        const { cum, segLen, total } = line.userData.arcLengthTable

        const s = cum[ faceIndex ] + u * segLen[ faceIndex ];

        const t = total > 0 ? s / total : 0;

        const { userData } = line;
        const { nodeName } = userData;

        return { t, nodeName, line }
    }

    disable() {
        this.isEnabled = false;
        this.clearIntersection();
    }

    enable() {
        this.isEnabled = true;
    }
}

export default RayCastService;
