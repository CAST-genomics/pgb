import App from './app.js'
import RayCastService from './raycastService.js'
import LocusInput from './locusInput.js'
import GenomicService from './genomicService.js'
import SequenceService from './sequenceService.js'
import GeometryManager from './geometryManager.js'
import AssemblyWidget from './assemblyWidget.js'
import WidgetService from './widgetService.js'
import GenomeLibrary from "./igvCore/genome/genomeLibrary.js"
import materialService from './materialService.js'
import LookManager from './lookManager.js'
import AssemblyVisualizationLook from './assemblyVisualizationLook.js'
import HeatmapLook from "./heatmapLook.js"
import SceneManager from './sceneManager.js'
import PangenomeService from "./pangenomeService.js"
import AnnotationRenderService from "./annotationRenderService.js"
import pangenomeResource from "./pangenomeResource.js"
import {rubinColors} from "./utils/color.js"
import './styles/app.scss'

let app
let locusInput
let defaultGenome
let sequenceService
let annotationRenderService
let assemblyWidget
let widgetService
document.addEventListener("DOMContentLoaded", async (event) => {

    await pangenomeResource.initialize()

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

    // Scene Manager and Look Manager
    const sceneManager = new SceneManager(new LookManager())



    // AssemblyVisualizationLook
    const assemblyVisualizationLook = AssemblyVisualizationLook.createAssemblyVisualizationLook('assemblyVisualizationLook', { genomicService, geometryManager, sceneManager })
    sceneManager.createScene('assemblyVisualizationScene', rubinColors.rubinIvory)
    sceneManager.lookManager.setLook('assemblyVisualizationScene', assemblyVisualizationLook);

    // Heatmap Look
    const heatmapLook = HeatmapLook.createHeatmapLook('heatmapLook', {genomicService, geometryManager})
    sceneManager.createScene('heatmapScene', rubinColors.rubinIvory)
    sceneManager.lookManager.setLook('heatmapScene', heatmapLook);

    const pangenomeService = new PangenomeService()

    const gear = document.getElementById('pgb-widget-container')
    const assemblyWidgetContainer = document.getElementById('pgb-gear-card')
    assemblyWidget = new AssemblyWidget(gear, assemblyWidgetContainer, genomicService, geometryManager, raycastService);

    // Initialize WidgetService to replace the gear with buttons
    widgetService = new WidgetService(gear, assemblyWidget);

    const annotationRenderServiceContainer = document.querySelector('.pgb-gene-annotation-track-container')
    annotationRenderService = new AnnotationRenderService(annotationRenderServiceContainer, genomicService, sceneManager, raycastService)

    const frustumSize = 5
    app = new App(threeJSContainer, frustumSize, pangenomeService, raycastService, genomicService, geometryManager, assemblyWidget, genomeLibrary, sceneManager)

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

export { app, locusInput, annotationRenderService, defaultGenome, assemblyWidget, widgetService }

