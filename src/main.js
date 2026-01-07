import App from './app.js'
import RayCastService from './raycastService.js'
import LocusInput from './locusInput.js'
import GenomicService from './genomicService.js'
import GeometryManager from './geometryManager.js'
import AssemblyWidget from './assemblyWidget.js'
import PopulationOnlyWidget from "./populationOnlyWidget.js"
import WidgetService from './widgetService.js'
import GenomeLibrary from "./igvCore/genome/genomeLibrary.js"
import materialService from './materialService.js'
import LookManager from './looks/lookManager.js'
import AssemblyVisualizationLook from './looks/assemblyVisualizationLook.js'
import HeatmapLook from "./looks/heatmapLook.js"
import SceneManager from './sceneManager.js'
import PangenomeService from "./pangenomeService.js"
import AnnotationRenderService from "./annotationRenderService.js"
import ContextMenuService from "./contextMenuService.js"
import { pcaChartService } from "./pcaChartService.js"
import {rubinColors} from "./utils/color/color.js"
import {showRelease} from "./utils/utils.js"
import {loadConfig} from "./utils/configService.js"
import './styles/app.scss'

let contextMenuService

let app
let locusInput
let defaultGenome
let annotationRenderService
let widgetService

document.addEventListener("DOMContentLoaded", async (event) => {

    const release = await showRelease()
    if (release){
        console.log(`Release: ${release}`)
    }

    // Initialize info button popover
    initializeInfoButton(release)

    await materialService.initialize()

    const genomeLibrary = new GenomeLibrary()
    const { genome } = await genomeLibrary.getGenomePayload('hg38')
    defaultGenome = genome

    const threeJSContainer = document.getElementById('pgb-three-container')

    const threshold = 8
    const raycastService = new RayCastService(threeJSContainer, threshold)

    const genomicService = new GenomicService()

    const geometryManager = new GeometryManager(genomicService)

    const sceneManager = new SceneManager(new LookManager())

    contextMenuService = new ContextMenuService(threeJSContainer, raycastService, genomicService)

    const assemblyWidget = new AssemblyWidget(document.getElementById('pgb-gear-card'), genomicService, geometryManager);

    // AssemblyVisualizationLook
    const assemblyVisualizationLook = AssemblyVisualizationLook.createAssemblyVisualizationLook('assemblyVisualizationLook', { genomicService, geometryManager, sceneManager, assemblyWidget })
    assemblyVisualizationLook.setAnimationEnabled(false)
    sceneManager.createScene('assemblyVisualizationScene', rubinColors.rubinIvory)
    sceneManager.lookManager.setLook('assemblyVisualizationScene', assemblyVisualizationLook);

    // Heatmap Look
    const heatmapLook = HeatmapLook.createHeatmapLook('heatmapLook', {genomicService, geometryManager, assemblyWidget})
    sceneManager.createScene('heatmapScene', rubinColors.rubinIvory)
    sceneManager.lookManager.setLook('heatmapScene', heatmapLook);

    const populationOnlyWidget = new PopulationOnlyWidget(document.getElementById('pgb-superpopulation-card'));
    widgetService = new WidgetService(document.getElementById('pgb-widget-container'), assemblyWidget, populationOnlyWidget);

    annotationRenderService = new AnnotationRenderService(document.querySelector('.pgb-gene-annotation-track-container'), genomicService, sceneManager, raycastService)

    const pangenomeService = new PangenomeService()

    const frustumSize = 5
    app = new App(threeJSContainer, frustumSize, pangenomeService, raycastService, genomicService, geometryManager, widgetService, genomeLibrary, sceneManager)

    locusInput = new LocusInput(document.getElementById('pgb-locus-input-container'), app)

    // Wire up PCA Chart button
    const pcaChartButton = document.getElementById('pca-chart-button');
    if (pcaChartButton) {
        pcaChartButton.addEventListener('click', () => {
            pcaChartService.toggleChart();
        });
    }

    // Load application configuration
    const config = await loadConfig()

    // Check for URL parameter first (highest priority)
    const urlParameter = locusInput.getUrlParameter('locus');
    let locus = null;

    if (urlParameter) {
        // URL parameter takes precedence over config
        locusInput.inputElement.value = urlParameter
        locus = locusInput.processLocusInput(locusInput.inputElement.value);
        if (locus) {
            await locusInput.ingestLocus(locus.chr, locus.startBP, locus.endBP);
        } else {
            locusInput.showError(`Invalid locus url parameter: ${urlParameter}`);
        }
    } else if (config.preload.enabled) {
        // Use config preload if enabled and no URL parameter
        locusInput.inputElement.value = config.preload.locus;
        locus = locusInput.processLocusInput(locusInput.inputElement.value);
        if (locus) {
            await locusInput.ingestLocus(locus.chr, locus.startBP, locus.endBP);
        } else {
            // If config locus is invalid, try treating it as a URL or local file
            if (locusInput.isUrl(config.preload.locus)) {
                await locusInput.ingestUrl(config.preload.locus);
            } else if (locusInput.isLocalFile(config.preload.locus)) {
                const normalizedPath = locusInput.normalizeLocalFilePath(config.preload.locus);
                await locusInput.ingestUrl(normalizedPath);
            } else {
                locusInput.showError(`Invalid preload locus in configuration: ${config.preload.locus}`);
            }
        }
    }
    // If config.preload.enabled is false and no URL parameter, skip preloading (blank screen)

})

function initializeInfoButton(release) {
    const infoButton = document.getElementById('info-button');
    if (!infoButton) return;

    const config = {
        container: 'body',
        placement: 'bottom',
        trigger: 'click',
        title: 'Release Information',
        content: release ? `Current Release: ${release}` : 'Unable to fetch release information'
    };

    new bootstrap.Popover(infoButton, config);
}

export { app, locusInput, annotationRenderService, defaultGenome, widgetService }

