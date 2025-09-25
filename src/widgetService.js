import { app } from "./main.js"

class WidgetService {
    constructor(containerElement, assemblyWidget, superpopulationWidget) {

        this.containerElement = containerElement;
        this.assemblyWidget = assemblyWidget;
        this.superpopulationWidget = superpopulationWidget;

        this.assemblyButton = null;
        this.superpopulationButton = null;

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

        this.superpopulationButton = document.createElement('button');
        buttonContainer.appendChild(this.superpopulationButton);

        this.superpopulationButton.className = 'widget-service__button widget-service__button--superpopulation';
        this.superpopulationButton.innerHTML = 'Super<br>Population';
        this.superpopulationButton.addEventListener('click', this.onSuperpopulationButtonClick.bind(this));

    }

    onAssemblyButtonClick(event) {

        event.stopPropagation();

        // Hide and reset superpopulation widget when switching to assembly
        this.superpopulationWidget.hideCard();
        this.superpopulationWidget.reset();

        if (this.activeButton === this.assemblyButton) {
            console.log('hide widget - assembly')
            this.assemblyWidget.hideCard();
            this.setActiveButton(null);
        } else {
            console.log('show widget- assembly')
            app.setActiveScene('assemblyVisualizationScene', true);
            this.assemblyWidget.showCard();
            this.setActiveButton(this.assemblyButton);
        }

    }

    onSuperpopulationButtonClick(event) {

        event.stopPropagation();

        // Hide and reset assembly widget when switching to superpopulation
        this.assemblyWidget.hideCard();
        this.assemblyWidget.reset();

        if (this.activeButton === this.superpopulationButton) {
            console.log('hide widget - superpopulation')
            this.superpopulationWidget.hideCard();
            this.setActiveButton(null);
        } else {
            console.log('show widget - superpopulation')

            if (null === this.superpopulationWidget.selectedSuperpopulation){
                app.setActiveScene('assemblyVisualizationScene', true)
            } else {
                app.setActiveScene('heatmapScene', true)
            }

            this.superpopulationWidget.showCard();
            this.setActiveButton(this.superpopulationButton);
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

        this.superpopulationWidget.hideCard()
        this.superpopulationWidget.reset()
    }

    getActiveButton() {
        return this.activeButton;
    }

    getActiveButtonType() {
        if (this.activeButton === this.assemblyButton) {
            return 'assembly';
        } else if (this.activeButton === this.metadataButton) {
            return 'metadata';
        } else if (this.activeButton === this.superpopulationButton) {
            return 'superpopulation';
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
            case 'superpopulation':
                targetButton = this.superpopulationButton;
                break;
            case 'none':
            case null:
            case undefined:
                targetButton = null;
                break;
            default:
                console.warn(`Unknown button type: ${buttonType}. Valid types are 'assembly', 'metadata', 'superpopulation', or 'none'`);
                return;
        }

        this.setActiveButton(targetButton);
    }

    destroy() {
        if (this.assemblyButton) {
            this.assemblyButton.removeEventListener('click', this.onAssemblyButtonClick.bind(this));
        }
        if (this.superpopulationButton) {
            this.superpopulationButton.removeEventListener('click', this.onSuperpopulationButtonClick.bind(this));
        }
        this.activeButton = null;
    }
}

export default WidgetService;
