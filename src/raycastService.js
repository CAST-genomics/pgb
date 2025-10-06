import * as THREE from 'three';
import ParametricLine from "./parametricLine.js"
import {app} from "./main.js"
import {getWorldDistanceFromPixelDistance} from "./utils/utils.js"
import {getComplementaryThreeJSColor} from "./utils/color/color.js"

class RayCastService {

    // static VISUAL_FEEDBACK_NAME_COLOR_THREE_JS = new THREE.Color(0x00ff00)
    static VISUAL_FEEDBACK_NAME_COLOR_THREE_JS = getComplementaryThreeJSColor(new THREE.Color('#dc3545'))
    static VISUAL_FEEDBACK_NAME = 'VisualFeedback'
    static VISUAL_FEEDBACK_PIXELSIZE = 6
    static MOUSE_MOVEMENT_THRESHOLD = 5;
    static HOVER_STATIONARY_DELAY_MS = 175;

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
        this.mouseMoveCallbacks = new Set();
        this.mouseOverCallbacks = new Set();

        this.currentIntersection = undefined;

        this.mouseDownPosition = { x: 0, y: 0 };
        this.hasMouseMoved = false;
        this.isMouseDown = false;

        this.hoverTimer = null;
        this.lastPointerPosition = { x: 0, y: 0 };
        this.lastHoverTargetId = null;
    }

    configureRaycaster(raycaster, threshold) {
        raycaster.params.Line2 = {};
        raycaster.params.Line2.threshold = threshold;
    }

    setupEventListeners(container) {
        this.container = container;
        container.addEventListener('pointermove', this.onPointerMove.bind(this));
        container.addEventListener('pointerdown', this.onPointerDown.bind(this));
        container.addEventListener('pointerup', this.onPointerUp.bind(this));
        container.addEventListener('pointerover', this.onPointerOver.bind(this));
        container.addEventListener('pointerout', this.onPointerOut.bind(this));
        container.addEventListener('contextmenu', this.onContextMenu.bind(this));
    }

    onPointerDown(event) {
        this.mouseDownPosition = { x: event.clientX, y: event.clientY };
        this.hasMouseMoved = false;
        this.isMouseDown = true;
    }

    onPointerUp(event) {
        // treat as click if pointer did not move beyond threshold
        const deltaX = Math.abs(event.clientX - this.mouseDownPosition.x);
        const deltaY = Math.abs(event.clientY - this.mouseDownPosition.y);
        const isStationary = !(deltaX > RayCastService.MOUSE_MOVEMENT_THRESHOLD || deltaY > RayCastService.MOUSE_MOVEMENT_THRESHOLD);

        if (isStationary) {
            const intersection = this.#raycastClosest();
            if (intersection) {
                const processed = this.#processIntersection(intersection);
                for (const callback of this.clickCallbacks) {
                    callback(processed, event);
                }
            } else {
                for (const callback of this.clickCallbacks) {
                    callback(null, event);
                }
            }
        }

        this.isMouseDown = false;
    }

    onPointerMove({ clientX, clientY }) {
        const { left, top, width, height } = this.container.getBoundingClientRect();
        this.pointer.x = ((clientX - left) / width) * 2 - 1;
        this.pointer.y = -((clientY - top) / height) * 2 + 1;

        this.updateRaycaster(app.cameraManager.camera, this.pointer);

        this.lastPointerPosition = { x: clientX, y: clientY };

        // immediate tracking: publish processed intersection continuously while over an object
        const immediateIntersection = this.#raycastClosest();
        if (immediateIntersection) {
            const processedImmediate = this.#processIntersection(immediateIntersection);
            for (const callback of this.mouseMoveCallbacks) {
                callback(processedImmediate, { type: 'pointermove' });
            }
        } else {
            for (const callback of this.mouseMoveCallbacks) {
                callback(null, { type: 'pointermove' });
            }
        }

        // debounce stationary hover detection
        if (this.hoverTimer !== null) {
            clearTimeout(this.hoverTimer);
        }
        this.hoverTimer = setTimeout(() => {
            this.hoverTimer = null;
            const intersection = this.#raycastClosest();

            if (intersection) {
                const processed = this.#processIntersection(intersection);
                const targetId = processed.line ? processed.line.id : processed.object?.id;
                if (targetId !== this.lastHoverTargetId) {
                    this.lastHoverTargetId = targetId;
                    for (const callback of this.mouseOverCallbacks) {
                        callback(processed, { type: 'pointerover' });
                    }
                } else {
                    // still over same target, fire again for idempotent handlers
                    for (const callback of this.mouseOverCallbacks) {
                        callback(processed, { type: 'pointerover' });
                    }
                }
            } else {
                if (this.lastHoverTargetId !== null) {
                    this.lastHoverTargetId = null;
                    for (const callback of this.mouseOverCallbacks) {
                        callback(null, { type: 'pointerout' });
                    }
                }
            }
        }, RayCastService.HOVER_STATIONARY_DELAY_MS);
    }

    onPointerOver(event) {
        // no-op; hover handled by debounced pointermove
    }

    onPointerOut(event) {
        if (this.hoverTimer !== null) {
            clearTimeout(this.hoverTimer);
            this.hoverTimer = null;
        }
        if (this.lastHoverTargetId !== null) {
            this.lastHoverTargetId = null;
            for (const callback of this.mouseOverCallbacks) {
                callback(null, { type: 'pointerout' });
            }
        }
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

    registerMouseMoveHandler(callback) {
        this.mouseMoveCallbacks.add(callback);
        return () => this.mouseMoveCallbacks.delete(callback);
    }

    registerMouseOverHandler(callback) {
        this.mouseOverCallbacks.add(callback);
        return () => this.mouseOverCallbacks.delete(callback);
    }

    updateLine2Threshold(camera) {

        // Screen space
        const screenPixelThreshold = 5

        // NDC space
        const { width } = this.container.getBoundingClientRect()
        const v1 = new THREE.Vector3(0, 0, 0.5);
        const v2 = new THREE.Vector3(screenPixelThreshold / (width * 2), 0, 0.5);

        // NDC -> World space
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

    updateRaycaster(camera, pointer) {

        const scene = app.sceneManager.getActiveScene()
        if (!scene) {
            return
        }

        const raycastVisualFeedback = scene.getObjectByName(this.getVisualFeedbackName())
        if (raycastVisualFeedback) {
            // update radius of the visual feedback sphere
            const worldSize = getWorldDistanceFromPixelDistance(camera, RayCastService.VISUAL_FEEDBACK_PIXELSIZE, this.container)
            raycastVisualFeedback.scale.set(worldSize, worldSize, worldSize)
        }

        this.raycaster.setFromCamera(pointer, camera);
    }

    #getRaycastTargets(){
        const scene = app.sceneManager.getActiveScene()
        if (!scene) return [];
        const nodeMeshGroup = scene.getObjectByName('NodeMeshGroup')
        const edgeMeshGroup = scene.getObjectByName('EdgeMeshGroup')
        if (!nodeMeshGroup || !edgeMeshGroup) return [];
        return [ ...nodeMeshGroup.children, ...edgeMeshGroup.children ];
    }

    #raycastClosest(){
        // Always ensure raycaster is up-to-date before raycasting
        this.updateRaycaster(app.cameraManager.camera, this.pointer);

        const targets = this.#getRaycastTargets();
        if (0 === targets.length) {
            return null;
        }

        const intersections = this.raycaster.intersectObjects(targets);
        if (!intersections || 0 === intersections.length) {
            return null;
        }

        intersections.sort((a, b) => a.distance - b.distance);

        return intersections[0];
    }

    createVisualFeedback(color) {

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

        const scene = app.sceneManager.getActiveScene()
        if (scene){
            const raycastVisualFeedback = scene.getObjectByName(this.getVisualFeedbackName())

            if (raycastVisualFeedback){
                raycastVisualFeedback.visible = true;
                raycastVisualFeedback.position.copy(pointOnLine);
                raycastVisualFeedback.material.color.copy(visualFeedbackColor);
            }
        }
    }

    clearVisualFeedback() {

        const scene = app.sceneManager.getActiveScene()
        if (scene){
            const raycastVisualFeedback = scene.getObjectByName(this.getVisualFeedbackName())
            if (raycastVisualFeedback){
                raycastVisualFeedback.visible = false;
            }
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

        const { pointOnLine } = intersection
        this.showVisualFeedback(pointOnLine, RayCastService.VISUAL_FEEDBACK_NAME_COLOR_THREE_JS)

        return this.currentIntersection
    }

    #processIntersection(intersection){
        const hitObject = intersection.object;
        const type = hitObject?.userData?.type;

        // Only node lines support parametric mapping; edges use basic hit info
        if (type === 'node') {
            try {
                const processed = ParametricLine.getParameter(intersection);
                const line = hitObject;
                const t = processed.t;
                const pointOnLine = typeof line.getPoint === 'function' ? line.getPoint(t, 'world') : intersection.point;

                this.currentIntersection = { ...processed, line, point: intersection.point, pointOnLine };
                this.showVisualFeedback(pointOnLine, RayCastService.VISUAL_FEEDBACK_NAME_COLOR_THREE_JS);
                return this.currentIntersection;
            } catch (error) {
                console.warn('Failed to process node intersection:', error);
                return {
                    object: hitObject,
                    point: intersection.point,
                    pointOnLine: intersection.point,
                    t: 0,
                    nodeName: hitObject?.userData?.nodeName || 'unknown'
                };
            }
        }

        // Edge or unknown: do not attempt parametric processing
        const basic = {
            object: hitObject,
            point: intersection.point,
            pointOnLine: intersection.point
        };
        this.currentIntersection = basic;
        this.showVisualFeedback(basic.pointOnLine, RayCastService.VISUAL_FEEDBACK_NAME_COLOR_THREE_JS);
        return basic;
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

    cleanup() {
        if (this.container) {
            this.container.removeEventListener('pointermove', this.onPointerMove.bind(this));
            this.container.removeEventListener('pointerdown', this.onPointerDown.bind(this));
            this.container.removeEventListener('pointerup', this.onPointerUp.bind(this));
            this.container.removeEventListener('pointerover', this.onPointerOver.bind(this));
            this.container.removeEventListener('pointerout', this.onPointerOut.bind(this));
            this.container.removeEventListener('contextmenu', this.onContextMenu.bind(this));
        }
        this.clickCallbacks.clear();
        this.mouseMoveCallbacks.clear();
        this.mouseOverCallbacks.clear();
    }

}

export default RayCastService;
