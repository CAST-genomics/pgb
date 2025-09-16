import { Draggable } from './utils/draggable.js';
import eventBus from './utils/eventBus.js';
import { app } from "./main.js";

class MetadataWidget {
    constructor(metadataWidgetContainer, genomicService, geometryManager, raycastService) {
        this.metadataWidgetContainer = metadataWidgetContainer;
        this.superPopulationButton = null; // Will be initialized when card is shown

        this.genomicService = genomicService;
        this.geometryManager = geometryManager;
        this.raycastService = raycastService;

        this.draggable = new Draggable(this.metadataWidgetContainer);
    }

    initializeSuperPopulationButton() {
        if (!this.superPopulationButton) {
            this.superPopulationButton = this.metadataWidgetContainer.querySelector('#super-population-btn');
            if (this.superPopulationButton) {
                this.superPopulationButton.addEventListener('click', this.onSuperPopulationClick.bind(this));
                console.log('Super Population button initialized successfully');
            } else {
                console.error('Super Population button element not found');
            }
        }
    }

    onSuperPopulationClick(event) {
        event.stopPropagation();
        console.log('Super Population button clicked');
        // This will trigger the heatmap scene functionality
        app.setActiveScene('heatmapScene', true);
    }

    showCard() {
        this.metadataWidgetContainer.style.display = '';
        setTimeout(() => {
            this.metadataWidgetContainer.classList.add('show');
            // Initialize super population button when card is shown
            this.initializeSuperPopulationButton();
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
