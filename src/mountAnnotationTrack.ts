import AnnotationCoordinateIndex from "./annotationCoordinateIndex.ts"
import AnnotationCanvas from "./annotationCanvas.ts"
import AnnotationTrackController from "./annotationTrackController.ts"

interface AnnotationTrackHandle {
    readonly coordinateIndex: AnnotationCoordinateIndex
    clear(): void
    dispose(): void
}

function mountAnnotationTrack(deps: {
    container: HTMLElement
    genomicService: any
    sceneManager: any
    raycastService: any
}): AnnotationTrackHandle {

    const { container, genomicService, sceneManager, raycastService } = deps

    const coordinateIndex = new AnnotationCoordinateIndex()
    const canvas = new AnnotationCanvas(container)
    const controller = new AnnotationTrackController({
        container, coordinateIndex, canvas, genomicService, sceneManager, raycastService
    })

    controller.start()

    return {
        get coordinateIndex() { return coordinateIndex },

        clear() {
            coordinateIndex.clear()
            canvas.clear()
        },

        dispose() {
            controller.destroy()
            canvas.dispose()
            coordinateIndex.clear()
        }
    }
}

export default mountAnnotationTrack
