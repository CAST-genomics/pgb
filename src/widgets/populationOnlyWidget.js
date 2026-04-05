import { Draggable } from '../utils/draggable.js';
import eventBus from '../utils/eventBus.ts';
import { getHierarchicalPopulationStructureFromData } from '../utils/populationUtils.js';
import {app} from "../main.js"

class PopulationOnlyWidget {
    constructor(populationWidgetContainer, jsonData = null) {
        this.populationWidgetContainer = populationWidgetContainer;
        this.draggable = new Draggable(this.populationWidgetContainer);

        this.listGroup = this.populationWidgetContainer.querySelector('.list-group');

        this.selectedSuperpopulation = null;
        this.selectedPopulation = null;
        this.allSuperpopulationItems = new Map();
        this.allPopulationItems = new Map();

        this.jsonData = jsonData;
        this.hierarchicalData = jsonData ? getHierarchicalPopulationStructureFromData(jsonData) : [];

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
            // Skip creating superpopulation items - only show populations
            // But keep the superpopulation reference for the dividing lines

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
            // Deselect current superpopulation
            event.target.classList.remove('widget-service__button--active');
            const deselectedSuperpopulation = this.selectedSuperpopulation;
            this.selectedSuperpopulation = null;

            app.setActiveScene('nodeEmphasisScene', true);
            eventBus.publish('superpopulation:deselected', { superpopulation: deselectedSuperpopulation, acronym: deselectedSuperpopulation.acronym });
        } else {
            // Clear all previous selections
            this.clearAllSelections();

            // Select new superpopulation
            event.target.classList.add('widget-service__button--active');
            this.selectedSuperpopulation = superpopulation;

            console.log(`Selected superpopulation: ${superpopulation.name}`);

            app.setActiveScene('heatmapScene', true);
            eventBus.publish('superpopulation:selected', { acronym: superpopulation.acronym });
        }
    }

    onPopulationButtonClick(population, event) {
        event.stopPropagation();

        if (this.selectedPopulation && this.selectedPopulation.name === population.name) {
            // Deselect current population
            event.target.classList.remove('widget-service__button--active');
            const deselectedPopulation = this.selectedPopulation;
            this.selectedPopulation = null;

            app.setActiveScene('nodeEmphasisScene', true);
            eventBus.publish('population:deselected', { population: deselectedPopulation, acronym: deselectedPopulation.acronym });
        } else {
            // Clear all previous selections
            this.clearAllSelections();

            // Select new population
            event.target.classList.add('widget-service__button--active');
            this.selectedPopulation = population;

            console.log(`Selected population: ${population.name}`);

            app.setActiveScene('heatmapScene', true);
            eventBus.publish('population:selected', { acronym: population.acronym });
        }
    }

    cleanupListItem(item) {
        // Clean up superpopulation buttons
        const superpopulationButton = item.querySelector('.superpopulation-widget__superpopulation-button');
        if (superpopulationButton && superpopulationButton.onPopulationButtonClick) {
            superpopulationButton.removeEventListener('click', superpopulationButton.onPopulationButtonClick);
            delete superpopulationButton.onPopulationButtonClick;
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

    clearAllSelections() {
        // Clear all button active states
        const allButtons = this.listGroup.querySelectorAll('.superpopulation-widget__superpopulation-button, .superpopulation-widget__population-button');
        allButtons.forEach(button => {
            button.classList.remove('widget-service__button--active');
        });

        // Clear internal state
        this.selectedSuperpopulation = null;
        this.selectedPopulation = null;
    }

    /**
     * Update the widget with new data
     * @param {import('../datasetModel.ts').DatasetModel} dataset
     */
    updateData(dataset) {
        this.hierarchicalData = dataset ? getHierarchicalPopulationStructureFromData(dataset) : [];
        this.clearAllSelections();
        this.populateList();
    }

    reset() {
        this.clearAllSelections();
    }

    destroy() {
        this.draggable.destroy();
    }
}

export default PopulationOnlyWidget;

