import { app } from "./main.js"

class WidgetService {
    constructor(containerElement, assemblyWidget, populationWidget) {

        this.containerElement = containerElement;
        this.assemblyWidget = assemblyWidget;
        this.populationWidget = populationWidget;

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
        this.superpopulationButton.innerHTML = 'Population';
        this.superpopulationButton.addEventListener('click', this.onSuperpopulationButtonClick.bind(this));

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

    onSuperpopulationButtonClick(event) {

        event.stopPropagation();

        // Hide and reset other widgets when switching to superpopulation
        this.assemblyWidget.hideCard();
        this.assemblyWidget.reset();

        if (this.activeButton === this.superpopulationButton) {
            console.log('hide widget - superpopulation')
            this.populationWidget.hideCard();
            this.setActiveButton(null);
        } else {
            console.log('show widget - superpopulation')

            if (null === this.populationWidget.selectedSuperpopulation && null === this.populationWidget.selectedPopulation){
                app.setActiveScene('assemblyVisualizationScene', true)
            } else {
                app.setActiveScene('heatmapScene', true)
            }

            this.populationWidget.showCard();
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
        if (this.superpopulationButton) {
            this.superpopulationButton.removeEventListener('click', this.onSuperpopulationButtonClick.bind(this));
        }
        this.activeButton = null;
    }
}

export default WidgetService;
