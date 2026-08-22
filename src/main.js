import App from './app.ts'
import RayCastService from './raycastService.js'
import LocusInput from './locusInput.js'
import GenomicService from './genomicService.js'
import GeometryManager from './geometryManager.js'
import AssemblyWidget from './widgets/assemblyWidget.ts'
import PopulationOnlyWidget from "./widgets/populationOnlyWidget.ts"
import PCLAIWidget from './widgets/pclaiWidget.ts'
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
import eventBus from "./utils/eventBus.ts"

const EXPORT_SCALE = 4
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
    const pclaiWidget = new PCLAIWidget(document.getElementById('pgb-pclai-card'), genomicService, geometryManager);
    globals.widgetService = new WidgetService(document.getElementById('pgb-widget-container'), assemblyWidget, populationOnlyWidget, pclaiWidget);

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

    let currentLocusToken = null
    let currentPclaiKey = null
    eventBus.subscribe('locus:token', (data) => {
        currentLocusToken = (data && data.token) ? data.token : null
    })
    eventBus.subscribe('pclaiWidget:emphasis', (data) => {
        const name = data && data.assembly && data.assembly.name
        currentPclaiKey = name ? name.replace(/#/g, '-') : null
    })
    eventBus.subscribe('pclaiWidget:deselect', () => {
        currentPclaiKey = null
    })

    // AssemblyWidget publishes the desired layout; the fetch happens here so
    // that no widget carries a network dependency.
    eventBus.subscribe('layout:rebuild', async (layout) => {
        try {
            await globals.locusInput.rebuildWithLayout(layout)
            // widgetService.reset() hid every card during the load; reopen the
            // one the user pressed Rebuild in.
            globals.widgetService.showAssemblyWidget()
            eventBus.publish('layout:rebuildSettled', { ok: true })
        } catch (e) {
            // app.showError has already surfaced this and left the previous
            // scene intact; just release the widget's in-flight lock.
            console.error('layout rebuild failed:', e)
            eventBus.publish('layout:rebuildSettled', { ok: false })
        }
    })

    const filenamePrefix = () => {
        if (currentLocusToken && currentPclaiKey) return `${currentLocusToken}-${currentPclaiKey}`
        return currentLocusToken
    }

    const exportPclaiChart = async () => {
        const blob = await globals.app.pclaiChart.exportToSvg()
        downloadBlob(blob, timestampedFilename('pclai-chart', 'svg', filenamePrefix()))
    }

    mountPrintPanel([
        {
            id: 'annotation-track',
            label: `Export Annotation Track (PNG, ${EXPORT_SCALE}×)`,
            run: async () => {
                const blob = await globals.annotationTrack.exportToPng(EXPORT_SCALE)
                downloadBlob(blob, timestampedFilename('annotation-track', 'png', filenamePrefix()))
            },
        },
        {
            id: 'pangenome-graph',
            label: `Export Pangenome Graph (PNG, ${EXPORT_SCALE}×)`,
            run: async () => {
                const blob = await globals.app.exportPangenomeGraphToPng(EXPORT_SCALE)
                downloadBlob(blob, timestampedFilename('pangenome-graph', 'png', filenamePrefix()))
            },
        },
        {
            id: 'pclai-chart',
            label: 'Export PCLAI Chart (SVG)  [shortcut: P]',
            run: exportPclaiChart,
        },
    ])

    // Keyboard shortcut: pressing `p` exports the PCLAI chart in its current
    // visual state. This is the only way to capture a graph-node-hover state,
    // since moving the cursor to the print button cancels the hover.
    window.addEventListener('keydown', (event) => {
        if (event.key !== 'p' && event.key !== 'P') return
        if (event.metaKey || event.ctrlKey || event.altKey) return
        const target = event.target
        if (target instanceof HTMLElement) {
            const tag = target.tagName
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return
        }
        event.preventDefault()
        exportPclaiChart().catch(err => console.error('PCLAI chart export failed:', err))
    })

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


