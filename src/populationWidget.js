import { Draggable } from './utils/draggable.js';
import eventBus from './utils/eventBus.js';
import { getAllPopulationNames } from './utils/pangenomeUtils.js';
import {app} from "./main.js"

class PopulationWidget {
    constructor(populationWidgetContainer) {
        this.populationWidgetContainer = populationWidgetContainer;
        this.draggable = new Draggable(this.populationWidgetContainer);

        this.listGroup = this.populationWidgetContainer.querySelector('.list-group');

        this.selectedPopulation = null;
        this.allPopulationItems = new Map();

        this.populations = getAllPopulationNames()

        this.configure();
    }

    configure() {
        this.populateList();
    }

    populateList() {
        // Clean up existing items
        for (const item of this.listGroup.querySelectorAll('.list-group-item')) {
            this.cleanupListItem(item);
        }

        this.listGroup.innerHTML = '';
        this.allPopulationItems.clear();

        for (const population of this.populations) {
            const item = this.createListItem(population);
            this.listGroup.appendChild(item);
            this.allPopulationItems.set(population.name, item);
        }
    }

    createListItem(population) {
        const container = document.createElement('div');
        container.className = 'population-widget__button-container';

        // Population button
        const populationButton = document.createElement('button');
        container.appendChild(populationButton);

        populationButton.className = 'population-widget__button';
        populationButton.textContent = population.name;
        populationButton.dataset.population = population.name;
        populationButton.dataset.acronym = population.acronym;

        const onPopulationButtonClick = this.onPopulationButtonClick.bind(this, population);
        populationButton.onPopulationButtonClick = onPopulationButtonClick;
        populationButton.addEventListener('click', onPopulationButtonClick);

        return container;
    }

    onPopulationButtonClick(population, event) {
        event.stopPropagation();

        if (this.selectedPopulation && this.selectedPopulation.name === population.name) {

            event.target.style.border = '1px solid #dee2e6';
            event.target.style.backgroundColor = '#ffffff';
            event.target.style.transform = 'scale(1)';

            const deselectedPopulation = this.selectedPopulation;
            this.selectedPopulation = null;

            app.setActiveScene('assemblyVisualizationScene', true);
            eventBus.publish('population:deselected', { population: deselectedPopulation, acronym: deselectedPopulation.acronym });
        } else {

            if (this.selectedPopulation !== null) {
                const previousButton = this.listGroup.querySelector(`[data-population="${this.selectedPopulation.name}"]`);
                if (previousButton) {
                    previousButton.style.border = '1px solid #dee2e6';
                    previousButton.style.backgroundColor = '#ffffff';
                    previousButton.style.transform = 'scale(1)';
                }
            }

            event.target.style.border = '2px solid #0d6efd';
            event.target.style.backgroundColor = '#e7f1ff';
            event.target.style.transform = 'scale(1.02)';

            this.selectedPopulation = population;

            console.log(`Selected population: ${population.name}`);

            app.setActiveScene('heatmapScene', true);
            eventBus.publish('population:selected', { acronym: population.acronym });
        }
    }

    cleanupListItem(item) {
        const populationButton = item.querySelector('.population-widget__button');
        if (populationButton && populationButton.onPopulationButtonClick) {
            populationButton.removeEventListener('click', populationButton.onPopulationButtonClick);
            delete populationButton.onPopulationButtonClick;
        }
    }

    showCard() {
        this.populationWidgetContainer.style.display = '';
        this.populationWidgetContainer.style.top = '0px';
        this.populationWidgetContainer.style.left = '0px';
        setTimeout(() => {
            this.populationWidgetContainer.classList.add('show');
        }, 0);
    }

    hideCard() {
        this.populationWidgetContainer.classList.remove('show');
        setTimeout(() => {
            this.populationWidgetContainer.style.display = 'none';
        }, 200);
    }

    getSelectedPopulation() {
        return this.selectedPopulation;
    }

    reset() {
        if (this.selectedPopulation) {
            const button = this.listGroup.querySelector(`[data-population="${this.selectedPopulation.name}"]`);
            if (button) {
                button.style.border = '1px solid #dee2e6';
                button.style.backgroundColor = '#ffffff';
                button.style.transform = 'scale(1)';
            }
            this.selectedPopulation = null;
        }
    }

    destroy() {
        this.draggable.destroy();
    }
}

export default PopulationWidget;
