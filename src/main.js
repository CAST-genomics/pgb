import * as THREE from 'three'
import App from './app.js'
import RayCastService from './raycastService.js'
import LocusInput from './locusInput.js'
import GenomicService from './genomicService.js'
import SequenceService from './sequenceService.js'
import GeometryManager from './geometryManager.js'
import AssemblyWidget from './assemblyWidget.js'
import GenomeLibrary from "./igvCore/genome/genomeLibrary.js"
import materialService from './materialService.js'
import LookManager from './lookManager.js'
import AssemblyVisualizationLook from './assemblyVisualizationLook.js'
import SceneManager from './sceneManager.js'
import PangenomeService from "./pangenomeService.js"
import AnnotationRenderService from "./annotationRenderService.js"
import './styles/app.scss'

let app
let locusInput
let defaultGenome
let sequenceService
let annotationRenderService
let assemblyWidget
document.addEventListener("DOMContentLoaded", async (event) => {

    await materialService.initialize()

    const genomeLibrary = new GenomeLibrary()
    const { genome } = await genomeLibrary.getGenomePayload('hg38')
    defaultGenome = genome

    const threeJSContainer = document.getElementById('pgb-three-container')

    const threshold = 8
    const raycastService = new RayCastService(threeJSContainer, threshold)

    const genomicService = new GenomicService()

    const geometryManager = new GeometryManager(genomicService)

    sequenceService = new SequenceService(threeJSContainer, raycastService, genomicService)

    const annotationRenderServiceContainer = document.querySelector('.pgb-gene-annotation-track-container')
    annotationRenderService = new AnnotationRenderService(annotationRenderServiceContainer, genomicService, geometryManager, raycastService)

    const gear = document.getElementById('pgb-gear-btn-container')
    const assemblyWidgetContainer = document.getElementById('pgb-gear-card')
    assemblyWidget = new AssemblyWidget(gear, assemblyWidgetContainer, genomicService, geometryManager, raycastService);


    // Scene and Look managers
    const sceneManager = new SceneManager()
    sceneManager.createScene('assemblyVisualizationScene', new THREE.Color(0xffffff))
    sceneManager.createScene('genomeFrequencyScene', new THREE.Color(0xffffff))

    // Looks
    const assemblyVisualizationLook = AssemblyVisualizationLook.createAssemblyVisualizationLook('assemblyVisualizationLook', {
        genomicService,
        geometryManager
    })
    assemblyVisualizationLook.setAnimationEnabled(false)

    // Look Manager
    const lookManager = new LookManager()
    lookManager.setLook('assemblyVisualizationScene', assemblyVisualizationLook);

    sceneManager.setActiveScene('assemblyVisualizationScene')
    lookManager.activateLook('assemblyVisualizationScene')

    const pangenomeService = new PangenomeService()

    const frustumSize = 5
    app = new App(threeJSContainer, frustumSize, pangenomeService, raycastService, genomicService, geometryManager, assemblyWidget, genomeLibrary, sceneManager, lookManager)

    locusInput = new LocusInput(document.getElementById('pgb-locus-input-container'), app)

    const urlParameter = locusInput.getUrlParameter('locus');
    let locus = null;
    if (urlParameter) {
        locusInput.inputElement.value = urlParameter
        locus = locusInput.processLocusInput(locusInput.inputElement.value);
    } else {
        locusInput.inputElement.value = 'chr1:25240000-25460000';
        locus = locusInput.processLocusInput(locusInput.inputElement.value);
    }

    if (locus) {
        await locusInput.ingestLocus(locus.chr, locus.startBP, locus.endBP);
    } else {
        locusInput.showError(`Invalid locus url parameter: ${urlParameter}`);
    }

})

export { app, locusInput, annotationRenderService, defaultGenome, assemblyWidget }

