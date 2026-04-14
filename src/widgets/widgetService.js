import { globals } from "../main.js"
import { pclaiCoordinateService } from "./pclaiCoordinateService.js"

class WidgetService {
    constructor(containerElement, assemblyWidget, populationWidget, pcaWidget) {

        this.containerElement = containerElement;
        this.assemblyWidget = assemblyWidget;
        this.populationWidget = populationWidget;
        this.pcaWidget = pcaWidget;

        this.assemblyButton = null;
        this.populationButton = null;
        this.pcaButton = null;

        this.activeButton = null

        this.createButtons();
    }

    activateLook(sceneName) {
        globals.app.setActiveScene(sceneName, true);
    }

    createButtons() {

        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'widget-service__button-container';
        this.containerElement.innerHTML = '';
        this.containerElement.appendChild(buttonContainer);

        this.assemblyButton = document.createElement('button');
        buttonContainer.appendChild(this.assemblyButton);

        this.assemblyButton.className = 'widget-service__button';
        this.assemblyButton.textContent = 'Assembly';
        this.assemblyButton.addEventListener('click', this.onAssemblyButtonClick.bind(this));

        this.populationButton = document.createElement('button');
        buttonContainer.appendChild(this.populationButton);

        this.populationButton.className = 'widget-service__button';
        this.populationButton.innerHTML = 'Population';
        this.populationButton.addEventListener('click', this.onPopulationButtonClick.bind(this));

        this.pcaButton = document.createElement('button');
        buttonContainer.appendChild(this.pcaButton);

        this.pcaButton.className = 'widget-service__button';
        this.pcaButton.textContent = 'PCA';
        this.pcaButton.addEventListener('click', this.onPCAButtonClick.bind(this));

    }

    onAssemblyButtonClick(event) {

        event.stopPropagation();

        // Hide and reset other widgets when switching to assembly
        this.populationWidget.hideCard();
        this.populationWidget.reset();
        this.pcaWidget.hideCard();
        this.pcaWidget.reset();

        if (this.activeButton === this.assemblyButton) {
            console.log('hide widget - assembly')
            this.assemblyWidget.hideCard();
            this.assemblyWidget.reset();
            this.setActiveButton(null);
        } else {
            console.log('show widget- assembly')
            this.activateLook('nodeEmphasisScene');
            this.assemblyWidget.showCard();
            this.setActiveButton(this.assemblyButton);
        }

    }

    onPopulationButtonClick(event) {

        event.stopPropagation();

        // Hide and reset other widgets when switching to population
        this.assemblyWidget.hideCard();
        this.assemblyWidget.reset();
        this.pcaWidget.hideCard();
        this.pcaWidget.reset();

        if (this.activeButton === this.populationButton) {
            console.log('hide widget - population')
            this.populationWidget.hideCard();
            this.setActiveButton(null);
        } else {
            console.log('show widget - population')

            if (null === this.populationWidget.selectedSuperpopulation && null === this.populationWidget.selectedPopulation){
                this.activateLook('nodeEmphasisScene')
            } else {
                this.activateLook('heatmapScene')
            }

            this.populationWidget.showCard();
            this.setActiveButton(this.populationButton);
        }

    }

    onPCAButtonClick(event) {

        event.stopPropagation();

        // Don't proceed if button is disabled
        if (this.pcaButton.disabled) {
            return;
        }

        // Hide and reset other widgets when switching to PCA
        this.assemblyWidget.hideCard();
        this.assemblyWidget.reset();
        this.populationWidget.hideCard();
        this.populationWidget.reset();

        if (this.activeButton === this.pcaButton) {
            console.log('hide widget - PCA')
            this.pcaWidget.hideCard();
            this.pcaWidget.reset();
            this.setActiveButton(null);
        } else {
            console.log('show widget - PCA')
            this.activateLook('nodeEmphasisScene');
            // this.pcaWidget.configure();
            this.pcaWidget.showCard();
            this.setActiveButton(this.pcaButton);
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

    /**
     * Update the population widget with new data
     * @param {import('../datasetModel.ts').DatasetModel} dataset
     */
    updatePopulationWidget(dataset) {
        this.populationWidget.updateData(dataset);
    }

    /**
     * Update PCA button enabled/disabled state based on PCLAI data availability
     */
    updatePCAButtonState() {
        if (this.pcaButton) {
            const hasData = pclaiCoordinateService.hasPCLAIData();
            this.pcaButton.disabled = !hasData;
            if (!hasData) {
                // If button is disabled and PCA widget is visible, hide the widget
                if (this.activeButton === this.pcaButton) {
                    this.pcaWidget.hideCard();
                    this.setActiveButton(null);
                }
            }
        }
    }

    reset(){

        if (this.activeButton) {
            this.activeButton.classList.remove('widget-service__button--active');
            this.activeButton = null
        }

        this.assemblyWidget.hideCard()
        this.assemblyWidget.configure()

        this.populationWidget.hideCard()
        this.populationWidget.reset()

        this.pcaWidget.hideCard()
        // this.pcaWidget.reset()
        this.pcaWidget.configure()

        // Update PCA button state based on PCLAI data availability
        this.updatePCAButtonState()
    }

    destroy() {
        if (this.assemblyButton) {
            this.assemblyButton.removeEventListener('click', this.onAssemblyButtonClick.bind(this));
        }
        if (this.populationButton) {
            this.populationButton.removeEventListener('click', this.onPopulationButtonClick.bind(this));
        }
        if (this.pcaButton) {
            this.pcaButton.removeEventListener('click', this.onPCAButtonClick.bind(this));
        }
        this.activeButton = null;
    }
}

export default WidgetService;
