import * as THREE from 'three';
import RibbonLine from "./ribbonLine.js"
import {globals} from "./main.js"
import {getWorldDistanceFromPixelDistance} from "./utils/utils.js"
import {getComplementaryThreeJSColor} from "./utils/color/color.js"

class RayCastService {

    static VISUAL_FEEDBACK_NAME_COLOR_THREE_JS = getComplementaryThreeJSColor(new THREE.Color('#dc3545'))
    static VISUAL_FEEDBACK_NAME = 'VisualFeedback'
    static VISUAL_FEEDBACK_PIXELSIZE = 6
    static MOUSE_MOVEMENT_THRESHOLD = 5;
    static HOVER_STATIONARY_DELAY_MS = 175;

    constructor(container) {

        this.container = container

        this.pointer = new THREE.Vector2();

        this.raycaster = new THREE.Raycaster();

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

    setupEventListeners(container) {
        this.container = container;
        container.addEventListener('pointermove', this.onPointerMove.bind(this));
        container.addEventListener('pointerdown', this.onPointerDown.bind(this));
        container.addEventListener('pointerup', this.onPointerUp.bind(this));
        container.addEventListener('pointerover', this.onPointerOver.bind(this));
        container.addEventListener('pointerout', this.onPointerOut.bind(this));
        container.addEventListener('contextmenu', this.onContextMenu.bind(this));
    }

    onPointerDown({ clientX, clientY }) {
        this.mouseDownPosition = { x: clientX, y: clientY };
        this.hasMouseMoved = false;
        this.isMouseDown = true;
    }

    // Behaves as a click handler
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

        this.updateRaycaster(globals.app.cameraManager.camera, this.pointer);

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

    updateRaycaster(camera, pointer) {

        const scene = globals.app.sceneManager.getActiveScene()
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
        const scene = globals.app.sceneManager.getActiveScene()
        if (!scene) return [];
        const nodeMeshGroup = scene.getObjectByName('NodeMeshGroup')
        const edgeMeshGroup = scene.getObjectByName('EdgeMeshGroup')
        if (!nodeMeshGroup || !edgeMeshGroup) return [];
        return [ ...nodeMeshGroup.children, ...edgeMeshGroup.children ];
    }

    #raycastClosest(){
        // Always ensure raycaster is up-to-date before raycasting
        this.updateRaycaster(globals.app.cameraManager.camera, this.pointer);

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

        const scene = globals.app.sceneManager.getActiveScene()
        if (scene){
            const raycastVisualFeedback = scene.getObjectByName(this.getVisualFeedbackName())

            if (raycastVisualFeedback){
                raycastVisualFeedback.visible = true;
                raycastVisualFeedback.position.copy(pointOnLine);
                raycastVisualFeedback.material.color.copy(visualFeedbackColor);
            }
        }
    }

    hideVisualFeedback() {

        const scene = globals.app.sceneManager.getActiveScene()
        if (scene){
            const raycastVisualFeedback = scene.getObjectByName(this.getVisualFeedbackName())
            if (raycastVisualFeedback){
                raycastVisualFeedback.visible = false;
            }
        }

    }

    #processIntersection(intersection){
        const hitObject = intersection.object;
        const type = hitObject?.userData?.type;

        // Only node lines support parametric mapping; edges use basic hit info
        if (type === 'node') {
            try {
                const processed = RibbonLine.getParameter(intersection);
                const line = hitObject;
                const t = processed.t;
                const pointOnLine = line.getPoint(t, 'world');

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

    clearIntersection() {
        this.currentIntersection = undefined;
        this.hideVisualFeedback();
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
