import App from './app.ts'
import RayCastService from './raycastService.js'
import LocusInput from './locusInput.js'
import GenomicService from './genomicService.js'
import GeometryManager from './geometryManager.js'
import AssemblyWidget from './widgets/assemblyWidget.ts'
import PopulationOnlyWidget from "./widgets/populationOnlyWidget.ts"
import PCAWidget from './widgets/pcaWidget.ts'
import WidgetService from './widgets/widgetService.js'
import GenomeLibrary from "./igvCore/genome/genomeLibrary.js"
import { initializeGenomeRegistry, setCustomGenomes } from './igvCore/genome/genomeRegistry.js'
import materialService from './materialService.js'
import LookManager from './looks/lookManager.js'
import NodeEmphasisLook from './looks/nodeEmphasisLook.ts'
import HeatmapLook from "./looks/heatmapLook.ts"
import SceneManager from './sceneManager.js'
import PangenomeService from "./pangenomeService.js"
import mountAnnotationTrack from "./mountAnnotationTrack.ts"
import { mountPrintPanel } from "./widgets/printPanel.ts"
import { downloadBlob, timestampedFilename } from "./utils/downloadBlob.ts"

const EXPORT_SCALE = 8
import ContextMenuService from "./contextMenuService.js"
import {rubinColors} from "./utils/color/color.js"
import {showRelease} from "./utils/utils.js"
import appConfig from './appConfig.js'
import './styles/app.scss'

let contextMenuService

/** @type {{ app: any, locusInput: any, defaultGenome: any, annotationTrack: any, widgetService: any }} */
export const globals = {
    app: null,
    locusInput: null,
    defaultGenome: null,
    annotationTrack: null,
    widgetService: null,
}

document.addEventListener("DOMContentLoaded", async (event) => {

    const release = await showRelease()
    if (release){
        console.log(`Release: ${release}`)
    }

    // Initialize info button popover
    initializeInfoButton(release)

    await materialService.initialize()

    const customAssemblies = await fetch(appConfig.customAssemblyRegistryURL).then(r => r.json()).catch(() => [])
    setCustomGenomes(customAssemblies)
    await initializeGenomeRegistry()
    const genomeLibrary = new GenomeLibrary()
    const { genome } = await genomeLibrary.getGenomePayload('hg38')
    globals.defaultGenome = genome

    const threeJSContainer = document.getElementById('pgb-three-container')

    const raycastService = new RayCastService(threeJSContainer)

    const genomicService = new GenomicService()

    const geometryManager = new GeometryManager(genomicService)

    const sceneManager = new SceneManager(new LookManager())

    contextMenuService = new ContextMenuService(threeJSContainer, raycastService, genomicService)

    const assemblyWidget = new AssemblyWidget(document.getElementById('pgb-gear-card'), genomicService, geometryManager);
    const populationOnlyWidget = new PopulationOnlyWidget(document.getElementById('pgb-superpopulation-card'));
    const pcaWidget = new PCAWidget(document.getElementById('pgb-pca-card'), geometryManager);
    globals.widgetService = new WidgetService(document.getElementById('pgb-widget-container'), assemblyWidget, populationOnlyWidget, pcaWidget);

    // Node Emphasis Look & Scene
    const nodeEmphasisLook = NodeEmphasisLook.createNodeEmphasisLook('nodeEmphasisLook', { genomicService, geometryManager, assemblyWidget })
    sceneManager.createScene('nodeEmphasisScene', rubinColors.rubinIvory)
    sceneManager.lookManager.setLook('nodeEmphasisScene', nodeEmphasisLook);

    // Heatmap Look & Scene
    const heatmapLook = HeatmapLook.createHeatmapLook('heatmapLook', { genomicService, geometryManager, assemblyWidget })
    sceneManager.createScene('heatmapScene', rubinColors.rubinIvory)
    sceneManager.lookManager.setLook('heatmapScene', heatmapLook);

    globals.annotationTrack = mountAnnotationTrack({
        container: document.querySelector('.pgb-gene-annotation-track-container'),
        genomicService, sceneManager, raycastService
    })

    const pangenomeService = new PangenomeService()

    const frustumSize = 5
    globals.app = new App(threeJSContainer, frustumSize, pangenomeService, raycastService, genomicService, geometryManager, globals.widgetService, genomeLibrary, sceneManager)

    globals.locusInput = new LocusInput(document.getElementById('pgb-locus-input-container'), globals.app)

    // Initialize locus input from URL parameters and/or configuration
    await globals.locusInput.initializeFromConfig(appConfig)

    mountPrintPanel([
        {
            id: 'annotation-track',
            label: `Export Annotation Track (PNG, ${EXPORT_SCALE}×)`,
            run: async () => {
                const blob = await globals.annotationTrack.exportToPng(EXPORT_SCALE)
                downloadBlob(blob, timestampedFilename('annotation-track', 'png'))
            },
        },
        {
            id: 'pangenome-graph',
            label: `Export Pangenome Graph (PNG, ${EXPORT_SCALE}×)`,
            run: async () => { throw new Error('Not implemented yet') },
        },
        {
            id: 'pca-chart',
            label: 'Export PCA Chart (SVG)',
            run: async () => { throw new Error('Not implemented yet') },
        },
    ])

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


