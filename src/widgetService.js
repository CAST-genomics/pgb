import { app } from "./main.js"

class WidgetService {
    constructor(containerElement, assemblyWidget) {

        this.containerElement = containerElement;
        this.assemblyWidget = assemblyWidget;

        this.assemblyButton = null;
        this.metadataButton = null;

        this.activeButton = null

        this.createButtons();
    }

    createButtons() {

        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'widget-service__button-container';
        this.containerElement.innerHTML = '';
        this.containerElement.appendChild(buttonContainer);

        this.assemblyButton = document.createElement('button');
        buttonContainer.appendChild(this.assemblyButton);

        this.assemblyButton.className = 'widget-service__button widget-service__button--assembly';
        this.assemblyButton.textContent = 'Assembly';
        this.assemblyButton.addEventListener('click', this.onAssemblyButtonClick.bind(this));

        this.metadataButton = document.createElement('button');
        buttonContainer.appendChild(this.metadataButton);

        this.metadataButton.className = 'widget-service__button widget-service__button--metadata';
        this.metadataButton.innerHTML = 'Super<br>Population';
        this.metadataButton.addEventListener('click', this.onMetadataButtonClick.bind(this));

    }

    onAssemblyButtonClick(event) {

        event.stopPropagation();

        // Toggle behavior: if assembly button is already active, deactivate it
        if (this.activeButton === this.assemblyButton) {
            // Inactive state: deactivate button and hide card
            this.assemblyWidget.hideCard();
            this.setActiveButton(null);
        } else {
            // Active state: switch to assembly visualization scene and show gear
            app.setActiveScene('assemblyVisualizationScene', true);
            this.assemblyWidget.onGearClick(event);
            this.setActiveButton(this.assemblyButton);
        }

    }

    onMetadataButtonClick(event) {

        event.stopPropagation();

        // Toggle behavior: if metadata button is already active, deactivate it
        if (this.activeButton === this.metadataButton) {
            // Inactive state: switch to assembly visualization scene
            app.setActiveScene('assemblyVisualizationScene', true);
            this.assemblyWidget.hideCard();
            this.setActiveButton(null);
        } else {
            // Active state: switch to heatmap scene
            app.setActiveScene('heatmapScene', true);
            this.assemblyWidget.hideCard();
            this.setActiveButton(this.metadataButton);
        }

    }

    setActiveButton(button) {

        if (this.activeButton) {
            this.activeButton.classList.remove('widget-service__button--active');
        }

        this.activeButton = button;
        if (button) {
            button.classList.add('widget-service__button--active');
        }
    }

    reset(){

        if (this.activeButton) {
            this.activeButton.classList.remove('widget-service__button--active');
            this.activeButton = null
        }

        this.assemblyWidget.hideCard()
        this.assemblyWidget.configure()
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
