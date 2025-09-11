import { app } from "./main.js"

class WidgetService {
    constructor(containerElement, assemblyWidget) {
        this.containerElement = containerElement;
        this.assemblyWidget = assemblyWidget;
        this.assemblyButton = null;
        this.metadataButton = null;

        this.initializeButtons();
    }

    initializeButtons() {
        // Create the round-rect container
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'widget-service__button-container';

        // Create Assembly button
        this.assemblyButton = document.createElement('button');
        this.assemblyButton.className = 'widget-service__button widget-service__button--assembly';
        this.assemblyButton.textContent = 'Assembly';
        this.assemblyButton.addEventListener('click', this.onAssemblyButtonClick.bind(this));

        // Create Metadata button
        this.metadataButton = document.createElement('button');
        this.metadataButton.className = 'widget-service__button widget-service__button--metadata';
        this.metadataButton.textContent = 'Metadata';
        this.metadataButton.addEventListener('click', this.onMetadataButtonClick.bind(this));

        // Append buttons to container
        buttonContainer.appendChild(this.assemblyButton);
        buttonContainer.appendChild(this.metadataButton);

        // Replace the existing gear button container
        this.containerElement.innerHTML = '';
        this.containerElement.appendChild(buttonContainer);
    }

    onAssemblyButtonClick(event) {
        event.stopPropagation();
        // Toggle the assembly widget visibility
        if (this.assemblyWidget) {
            // Call the existing gear click handler logic
            this.assemblyWidget.onGearClick(event);
        }
    }

    onMetadataButtonClick(event) {
        event.stopPropagation();
        console.log('Metadata button clicked - functionality not yet implemented');
        if ('heatmapScene' === app.sceneManager.getActiveSceneName()) {
            app.setActiveScene('assemblyVisualizationScene')
        } else {
            app.setActiveScene('heatmapScene')
        }

    }

    destroy() {
        if (this.assemblyButton) {
            this.assemblyButton.removeEventListener('click', this.onAssemblyButtonClick.bind(this));
        }
        if (this.metadataButton) {
            this.metadataButton.removeEventListener('click', this.onMetadataButtonClick.bind(this));
        }
    }
}

export default WidgetService;
