import { Draggable } from './utils/draggable.js';
import { app } from "./main.js";

class MetadataWidget {
    constructor(metadataWidgetContainer, genomicService, geometryManager) {

        this.metadataWidgetContainer = metadataWidgetContainer;

        this.genomicService = genomicService;
        this.geometryManager = geometryManager;

        this.draggable = new Draggable(this.metadataWidgetContainer);

        // Track current scene state for toggle functionality
        this.isHeatmapSceneActive = false;

        this.widgetService = null

        this.superPopulationButton = null
        this.initializeSuperPopulationButton()

    }

    initializeSuperPopulationButton() {
        this.superPopulationButton = this.metadataWidgetContainer.querySelector('#super-population-btn');
        this.superPopulationButton.addEventListener('click', this.onSuperPopulationClick.bind(this));
        this.superPopulationButton.textContent = 'Super Population';
        this.updateButtonState();
    }

    onSuperPopulationClick(event) {
        event.stopPropagation();

        this.widgetService.setWidgetInactive('assembly')

        if (this.isHeatmapSceneActive) {
            app.setActiveScene('assemblyVisualizationScene');
            this.isHeatmapSceneActive = false;
        } else {
            app.setActiveScene('heatmapScene', true);
            this.isHeatmapSceneActive = true;
        }

        this.updateButtonState();
    }

    updateButtonState() {
        this.superPopulationButton.className = 'widget-service__button';
        if (this.isHeatmapSceneActive) {
            this.superPopulationButton.classList.add('widget-service__button--active');
        } else{
            this.superPopulationButton.classList.remove('widget-service__button--active');
        }
    }

    isActive(){
        return (true === this.isHeatmapSceneActive)
    }

    setInactive(doPublish = true){
        this.isHeatmapSceneActive = false;
        this.superPopulationButton.classList.remove('widget-service__button--active');
    }

    showCard() {
        this.metadataWidgetContainer.style.display = '';
        setTimeout(() => {
            this.metadataWidgetContainer.classList.add('show');
        }, 0);
    }

    hideCard() {
        this.metadataWidgetContainer.classList.remove('show');
        setTimeout(() => {
            this.metadataWidgetContainer.style.display = 'none';
        }, 200);
    }

    destroy() {
        this.draggable.destroy();
        if (this.superPopulationButton) {
            this.superPopulationButton.removeEventListener('click', this.onSuperPopulationClick.bind(this));
        }
    }
}

export default MetadataWidget;
