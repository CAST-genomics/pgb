import { Draggable } from './utils/draggable.js';
import eventBus from './utils/eventBus.js';
import { getHierarchicalPopulationStructure } from './utils/populationUtils.js';
import {app} from "./main.js"

class PopulationWidget {
    constructor(populationWidgetContainer) {
        this.populationWidgetContainer = populationWidgetContainer;
        this.draggable = new Draggable(this.populationWidgetContainer);

        this.listGroup = this.populationWidgetContainer.querySelector('.list-group');

        this.selectedSuperpopulation = null;
        this.selectedPopulation = null;
        this.allSuperpopulationItems = new Map();
        this.allPopulationItems = new Map();

        this.hierarchicalData = getHierarchicalPopulationStructure();

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
        this.allSuperpopulationItems.clear();
        this.allPopulationItems.clear();

        for (const superpopulation of this.hierarchicalData) {
            const superpopulationItem = this.createSuperpopulationItem(superpopulation);
            this.listGroup.appendChild(superpopulationItem);
            this.allSuperpopulationItems.set(superpopulation.name, superpopulationItem);

            // Always add populations for each superpopulation
            for (const population of superpopulation.populations) {
                const populationItem = this.createPopulationItem(population, superpopulation);
                this.listGroup.appendChild(populationItem);
                this.allPopulationItems.set(population.name, populationItem);
            }
        }
    }

    createSuperpopulationItem(superpopulation) {
        const container = document.createElement('div');
        container.className = 'superpopulation-widget__superpopulation-container';

        // Superpopulation button with expand/collapse functionality
        const superpopulationButton = document.createElement('button');
        container.appendChild(superpopulationButton);

        superpopulationButton.className = 'superpopulation-widget__superpopulation-button';
        superpopulationButton.textContent = superpopulation.name;
        superpopulationButton.dataset.superpopulation = superpopulation.name;
        superpopulationButton.dataset.acronym = superpopulation.acronym;

        const onSuperpopulationButtonClick = this.onSuperpopulationButtonClick.bind(this, superpopulation);
        superpopulationButton.onSuperpopulationButtonClick = onSuperpopulationButtonClick;
        superpopulationButton.addEventListener('click', onSuperpopulationButtonClick);

        return container;
    }

    createPopulationItem(population, superpopulation) {
        const container = document.createElement('div');
        container.className = 'superpopulation-widget__population-container';

        // Population button
        const populationButton = document.createElement('button');
        container.appendChild(populationButton);

        populationButton.className = 'superpopulation-widget__population-button';
        populationButton.textContent = population.name;
        populationButton.dataset.population = population.name;
        populationButton.dataset.acronym = population.acronym;
        populationButton.dataset.superpopulation = superpopulation.acronym;

        const onPopulationButtonClick = this.onPopulationButtonClick.bind(this, population);
        populationButton.onPopulationButtonClick = onPopulationButtonClick;
        populationButton.addEventListener('click', onPopulationButtonClick);

        return container;
    }

    onSuperpopulationButtonClick(superpopulation, event) {
        event.stopPropagation();

        if (this.selectedSuperpopulation && this.selectedSuperpopulation.name === superpopulation.name) {

            event.target.style.border = '1px solid #dee2e6';
            event.target.style.backgroundColor = '#f8f9fa';
            event.target.style.transform = 'scale(1)';

            const deselectedSuperpopulation = this.selectedSuperpopulation;
            this.selectedSuperpopulation = null;

            app.setActiveScene('assemblyVisualizationScene', true);
            eventBus.publish('superpopulation:deselected', { superpopulation: deselectedSuperpopulation, acronym: deselectedSuperpopulation.acronym });
        } else {

            // Clear previous superpopulation selection
            if (this.selectedSuperpopulation !== null) {
                const previousSuperpopulationButton = this.listGroup.querySelector(`[data-superpopulation="${this.selectedSuperpopulation.name}"]`);
                if (previousSuperpopulationButton) {
                    previousSuperpopulationButton.style.border = '1px solid #dee2e6';
                    previousSuperpopulationButton.style.backgroundColor = '#f8f9fa';
                    previousSuperpopulationButton.style.transform = 'scale(1)';
                }
            }

            // Clear any selected population
            if (this.selectedPopulation !== null) {
                const previousPopulationButton = this.listGroup.querySelector(`[data-population="${this.selectedPopulation.name}"]`);
                if (previousPopulationButton) {
                    previousPopulationButton.style.border = '1px solid #dee2e6';
                    previousPopulationButton.style.backgroundColor = '#ffffff';
                    previousPopulationButton.style.transform = 'scale(1)';
                }
                this.selectedPopulation = null;
            }

            event.target.style.border = '2px solid #0d6efd';
            event.target.style.backgroundColor = '#e7f1ff';
            event.target.style.transform = 'scale(1.02)';

            this.selectedSuperpopulation = superpopulation;

            console.log(`Selected superpopulation: ${superpopulation.name}`);

            app.setActiveScene('heatmapScene', true);
            eventBus.publish('superpopulation:selected', { acronym: superpopulation.acronym });
        }
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

            // Clear previous population selection
            if (this.selectedPopulation !== null) {
                const previousPopulationButton = this.listGroup.querySelector(`[data-population="${this.selectedPopulation.name}"]`);
                if (previousPopulationButton) {
                    previousPopulationButton.style.border = '1px solid #dee2e6';
                    previousPopulationButton.style.backgroundColor = '#ffffff';
                    previousPopulationButton.style.transform = 'scale(1)';
                }
            }

            // Clear any selected superpopulation
            if (this.selectedSuperpopulation !== null) {
                const previousSuperpopulationButton = this.listGroup.querySelector(`[data-superpopulation="${this.selectedSuperpopulation.name}"]`);
                if (previousSuperpopulationButton) {
                    previousSuperpopulationButton.style.border = '1px solid #dee2e6';
                    previousSuperpopulationButton.style.backgroundColor = '#f8f9fa';
                    previousSuperpopulationButton.style.transform = 'scale(1)';
                }
                this.selectedSuperpopulation = null;
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
        // Clean up superpopulation buttons
        const superpopulationButton = item.querySelector('.superpopulation-widget__superpopulation-button');
        if (superpopulationButton && superpopulationButton.onSuperpopulationButtonClick) {
            superpopulationButton.removeEventListener('click', superpopulationButton.onSuperpopulationButtonClick);
            delete superpopulationButton.onSuperpopulationButtonClick;
        }

        // Clean up population buttons
        const populationButton = item.querySelector('.superpopulation-widget__population-button');
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

    reset() {
        // Reset superpopulation selection
        if (this.selectedSuperpopulation) {
            const button = this.listGroup.querySelector(`[data-superpopulation="${this.selectedSuperpopulation.name}"]`);
            if (button) {
                button.style.border = '1px solid #dee2e6';
                button.style.backgroundColor = '#f8f9fa';
                button.style.transform = 'scale(1)';
            }
            this.selectedSuperpopulation = null;
        }

        // Reset population selection
        if (this.selectedPopulation) {
            const button = this.listGroup.querySelector(`[data-population="${this.selectedPopulation.name}"]`);
            if (button) {
                button.style.border = '1px solid #dee2e6';
                button.style.backgroundColor = '#ffffff';
                button.style.transform = 'scale(1)';
            }
            this.selectedPopulation = null;
        }

        // Also reset any other buttons that might have been styled
        const allSuperpopulationButtons = this.listGroup.querySelectorAll('.superpopulation-widget__superpopulation-button');
        allSuperpopulationButtons.forEach(button => {
            button.style.border = '1px solid #dee2e6';
            button.style.backgroundColor = '#f8f9fa';
            button.style.transform = 'scale(1)';
        });

        const allPopulationButtons = this.listGroup.querySelectorAll('.superpopulation-widget__population-button');
        allPopulationButtons.forEach(button => {
            button.style.border = '1px solid #dee2e6';
            button.style.backgroundColor = '#ffffff';
            button.style.transform = 'scale(1)';
        });
    }

    destroy() {
        this.draggable.destroy();
    }
}

export default PopulationWidget;
