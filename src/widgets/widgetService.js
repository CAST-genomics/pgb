import { globals } from "../main.js"
import { pclaiCoordinateService } from "./pclaiCoordinateService.js"

class WidgetService {
    constructor(containerElement, assemblyWidget, populationWidget, pclaiWidget) {

        this.containerElement = containerElement;
        this.assemblyWidget = assemblyWidget;
        this.populationWidget = populationWidget;
        this.pclaiWidget = pclaiWidget;

        this.assemblyButton = null;
        this.populationButton = null;
        this.pclaiButton = null;

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

        this.pclaiButton = document.createElement('button');
        buttonContainer.appendChild(this.pclaiButton);

        this.pclaiButton.className = 'widget-service__button';
        this.pclaiButton.textContent = 'PCLAI';
        this.pclaiButton.addEventListener('click', this.onPCLAIButtonClick.bind(this));

    }

    onAssemblyButtonClick(event) {

        event.stopPropagation();

        // Hide and reset other widgets when switching to assembly.
        // pclaiWidget.reset() must run before hideCard() so the graph leaves
        // emphasis state before absence is released — otherwise the
        // deemphasized-remainder painted during emphasis is never restored.
        this.populationWidget.hideCard();
        this.populationWidget.reset();
        this.pclaiWidget.reset();
        this.pclaiWidget.hideCard();

        if (this.activeButton === this.assemblyButton) {
            console.log('hide widget - assembly')
            this.assemblyWidget.hideCard();
            this.assemblyWidget.reset();
            this.setActiveButton(null);
        } else {
            console.log('show widget- assembly')
            this.showAssemblyWidget();
        }

    }

    /**
     * Open the assembly card. Also used after a layout rebuild: reset() hides
     * every card on dataset load, which would otherwise close the panel the
     * Rebuild button lives in.
     */
    showAssemblyWidget() {
        this.activateLook('nodeEmphasisScene');
        this.assemblyWidget.showCard();
        this.setActiveButton(this.assemblyButton);
    }

    onPopulationButtonClick(event) {

        event.stopPropagation();

        // Hide and reset other widgets when switching to population.
        // pclaiWidget.reset() must run before hideCard() (see onAssemblyButtonClick).
        this.assemblyWidget.hideCard();
        this.assemblyWidget.reset();
        this.pclaiWidget.reset();
        this.pclaiWidget.hideCard();

        if (this.activeButton === this.populationButton) {
            console.log('hide widget - population')
            this.populationWidget.reset();
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

    onPCLAIButtonClick(event) {

        event.stopPropagation();

        // Don't proceed if button is disabled
        if (this.pclaiButton.disabled) {
            return;
        }

        // Hide and reset other widgets when switching to PCLAI
        this.assemblyWidget.hideCard();
        this.assemblyWidget.reset();
        this.populationWidget.hideCard();
        this.populationWidget.reset();

        if (this.activeButton === this.pclaiButton) {
            console.log('hide widget - PCLAI')
            // reset() before hideCard(): see onAssemblyButtonClick for rationale.
            this.pclaiWidget.reset();
            this.pclaiWidget.hideCard();
            this.setActiveButton(null);
        } else {
            console.log('show widget - PCLAI')
            this.activateLook('nodeEmphasisScene');
            // this.pclaiWidget.configure();
            this.pclaiWidget.showCard();
            this.setActiveButton(this.pclaiButton);
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
     * Update PCLAI button enabled/disabled state based on PCLAI data availability
     */
    updatePCLAIButtonState() {
        if (this.pclaiButton) {
            const hasData = pclaiCoordinateService.hasPCLAIData();
            this.pclaiButton.disabled = !hasData;
            if (!hasData) {
                // If button is disabled and PCLAI widget is visible, hide the widget
                if (this.activeButton === this.pclaiButton) {
                    this.pclaiWidget.hideCard();
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

        this.pclaiWidget.hideCard()
        // this.pclaiWidget.reset()
        this.pclaiWidget.configure()

        // Update PCLAI button state based on PCLAI data availability
        this.updatePCLAIButtonState()
    }

    destroy() {
        if (this.assemblyButton) {
            this.assemblyButton.removeEventListener('click', this.onAssemblyButtonClick.bind(this));
        }
        if (this.populationButton) {
            this.populationButton.removeEventListener('click', this.onPopulationButtonClick.bind(this));
        }
        if (this.pclaiButton) {
            this.pclaiButton.removeEventListener('click', this.onPCLAIButtonClick.bind(this));
        }
        this.activeButton = null;
    }
}

export default WidgetService;
