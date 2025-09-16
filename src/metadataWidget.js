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

        // Track current scene state for toggle functionality
        this.isHeatmapSceneActive = false;
    }

    initializeSuperPopulationButton() {
        if (!this.superPopulationButton) {
            this.superPopulationButton = this.metadataWidgetContainer.querySelector('#super-population-btn');
            if (this.superPopulationButton) {
                this.superPopulationButton.addEventListener('click', this.onSuperPopulationClick.bind(this));
                this.superPopulationButton.textContent = 'Super Population';
                this.updateButtonState();
                console.log('Super Population button initialized successfully');
            } else {
                console.error('Super Population button element not found');
            }
        }
    }

    updateButtonState() {
        if (this.superPopulationButton) {
            // Apply the same styling as other widget buttons
            this.superPopulationButton.className = 'widget-service__button';
            
            if (this.isHeatmapSceneActive) {
                this.superPopulationButton.classList.add('widget-service__button--active');
            } else {
                this.superPopulationButton.classList.remove('widget-service__button--active');
            }
        }
    }

    onSuperPopulationClick(event) {
        event.stopPropagation();

        if (this.isHeatmapSceneActive) {
            app.setActiveScene('assemblyVisualizationScene');
            this.isHeatmapSceneActive = false;
        } else {
            app.setActiveScene('heatmapScene', true);
            this.isHeatmapSceneActive = true;
        }

        this.updateButtonState();
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
