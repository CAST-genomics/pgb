import { app } from "./main.js"

class WidgetService {
    constructor(containerElement, assemblyWidget) {
        this.containerElement = containerElement;
        this.assemblyWidget = assemblyWidget;
        this.assemblyButton = null;
        this.metadataButton = null;
        this.activeButton = null; // Track which button is currently active

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

    setActiveButton(button) {
        // Remove active class from currently active button
        if (this.activeButton) {
            this.activeButton.classList.remove('widget-service__button--active');
        }
        
        // Set new active button
        this.activeButton = button;
        if (button) {
            button.classList.add('widget-service__button--active');
        }
    }

    getActiveButton() {
        return this.activeButton;
    }

    getActiveButtonType() {
        if (this.activeButton === this.assemblyButton) {
            return 'assembly';
        } else if (this.activeButton === this.metadataButton) {
            return 'metadata';
        }
        return null;
    }

    setButtonActive(buttonType) {
        let targetButton = null;
        
        switch (buttonType.toLowerCase()) {
            case 'assembly':
                targetButton = this.assemblyButton;
                break;
            case 'metadata':
                targetButton = this.metadataButton;
                break;
            case 'none':
            case null:
            case undefined:
                targetButton = null;
                break;
            default:
                console.warn(`Unknown button type: ${buttonType}. Valid types are 'assembly', 'metadata', or 'none'`);
                return;
        }
        
        this.setActiveButton(targetButton);
    }

    onAssemblyButtonClick(event) {
        event.stopPropagation();
        this.setActiveButton(this.assemblyButton);
        this.assemblyWidget.onGearClick(event);
        app.setActiveScene('assemblyVisualizationScene', true)
    }

    onMetadataButtonClick(event) {
        event.stopPropagation();
        this.setActiveButton(this.metadataButton);
        this.assemblyWidget.hideCard();
        app.setActiveScene('heatmapScene', true)
    }

    destroy() {
        if (this.assemblyButton) {
            this.assemblyButton.removeEventListener('click', this.onAssemblyButtonClick.bind(this));
        }
        if (this.metadataButton) {
            this.metadataButton.removeEventListener('click', this.onMetadataButtonClick.bind(this));
        }
        this.activeButton = null;
    }
}

export default WidgetService;
