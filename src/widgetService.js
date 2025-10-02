import { app } from "./main.js"

class WidgetService {
    constructor(containerElement, assemblyWidget, populationWidget) {

        this.containerElement = containerElement;
        this.assemblyWidget = assemblyWidget;
        this.populationWidget = populationWidget;

        this.assemblyButton = null;
        this.populationButton = null;

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

        this.assemblyButton.className = 'widget-service__button';
        this.assemblyButton.textContent = 'Assembly';
        this.assemblyButton.addEventListener('click', this.onAssemblyButtonClick.bind(this));

        this.populationButton = document.createElement('button');
        buttonContainer.appendChild(this.populationButton);

        this.populationButton.className = 'widget-service__button';
        this.populationButton.innerHTML = 'Population';
        this.populationButton.addEventListener('click', this.onPopulationButtonClick.bind(this));

    }

    onAssemblyButtonClick(event) {

        event.stopPropagation();

        // Hide and reset other widgets when switching to assembly
        this.populationWidget.hideCard();
        this.populationWidget.reset();

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

    onPopulationButtonClick(event) {

        event.stopPropagation();

        // Hide and reset other widgets when switching to population
        this.assemblyWidget.hideCard();
        this.assemblyWidget.reset();

        if (this.activeButton === this.populationButton) {
            console.log('hide widget - population')
            this.populationWidget.hideCard();
            this.setActiveButton(null);
        } else {
            console.log('show widget - population')

            if (null === this.populationWidget.selectedSuperpopulation && null === this.populationWidget.selectedPopulation){
                app.setActiveScene('assemblyVisualizationScene', true)
            } else {
                app.setActiveScene('heatmapScene', true)
            }

            this.populationWidget.showCard();
            this.setActiveButton(this.populationButton);
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
     * @param {Object} jsonData - The JSON data containing assembly metadata
     */
    updatePopulationWidget(jsonData) {
        this.populationWidget.updateData(jsonData);
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
    }

    destroy() {
        if (this.assemblyButton) {
            this.assemblyButton.removeEventListener('click', this.onAssemblyButtonClick.bind(this));
        }
        if (this.populationButton) {
            this.populationButton.removeEventListener('click', this.onPopulationButtonClick.bind(this));
        }
        this.activeButton = null;
    }
}

export default WidgetService;
