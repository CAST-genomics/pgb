import { Draggable } from './utils/draggable.js';
import eventBus from './utils/eventBus.js';

class SuperpopulationWidget {
    constructor(superpopulationWidgetContainer) {
        this.superpopulationWidgetContainer = superpopulationWidgetContainer;
        this.draggable = new Draggable(this.superpopulationWidgetContainer);

        this.listGroup = this.superpopulationWidgetContainer.querySelector('.list-group');
        
        this.selectedPopulation = null;
        this.allPopulationItems = new Map();

        // Population data based on the mockup
        this.populations = [
            { name: 'African', color: '#FF6B6B' },
            { name: 'South Asian', color: '#4ECDC4' },
            { name: 'East Asian', color: '#45B7D1' },
            { name: 'Ad Mixed American', color: '#96CEB4' }
        ];

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
        container.className = 'list-group-item d-flex align-items-center gap-3';

        // Population selector (colored circle)
        const populationSelector = document.createElement('div');
        container.appendChild(populationSelector);

        populationSelector.className = 'superpopulation-widget__population-selector';
        populationSelector.style.backgroundColor = population.color;
        populationSelector.dataset.population = population.name;

        const onPopulationSelectorClick = this.onPopulationSelectorClick.bind(this, population);
        populationSelector.onPopulationSelectorClick = onPopulationSelectorClick;
        populationSelector.addEventListener('click', onPopulationSelectorClick);

        // Population name
        const nameLabel = document.createElement('span');
        container.appendChild(nameLabel);
        nameLabel.textContent = population.name;
        nameLabel.className = 'superpopulation-widget__population-name flex-grow-1';

        return container;
    }

    onPopulationSelectorClick(population, event) {
        event.stopPropagation();

        if (this.selectedPopulation && this.selectedPopulation.name === population.name) {
            // Deselect current population
            this.selectedPopulation = null;
            event.target.style.border = '2px solid transparent';
            event.target.style.transform = 'scale(1)';
            
            // Publish deselection event
            eventBus.publish('superpopulation:deselected', { population });
        } else {
            // Deselect previous population if one exists
            if (this.selectedPopulation !== null) {
                const previousSelector = this.listGroup.querySelector(`[data-population="${this.selectedPopulation.name}"]`);
                if (previousSelector) {
                    previousSelector.style.border = '2px solid transparent';
                    previousSelector.style.transform = 'scale(1)';
                }
            }

            console.log(`Selected population: ${population.name}`);

            // Select new population
            this.selectedPopulation = population;
            event.target.style.border = '2px solid #000';
            event.target.style.transform = 'scale(1.5)';

            // Publish selection event
            eventBus.publish('superpopulation:selected', { population });
        }
    }

    cleanupListItem(item) {
        const populationSelector = item.querySelector('.superpopulation-widget__population-selector');
        if (populationSelector && populationSelector.onPopulationSelectorClick) {
            populationSelector.removeEventListener('click', populationSelector.onPopulationSelectorClick);
            delete populationSelector.onPopulationSelectorClick;
        }
    }

    toggleCard() {
        if (this.superpopulationWidgetContainer.classList.contains('show')) {
            this.hideCard();
        } else {
            this.showCard();
        }
    }

    showCard() {
        this.superpopulationWidgetContainer.style.display = '';
        this.superpopulationWidgetContainer.style.top = '0px';
        this.superpopulationWidgetContainer.style.left = '0px';
        setTimeout(() => {
            this.superpopulationWidgetContainer.classList.add('show');
        }, 0);
    }

    hideCard() {
        this.superpopulationWidgetContainer.classList.remove('show');
        setTimeout(() => {
            this.superpopulationWidgetContainer.style.display = 'none';
        }, 200);
    }

    getSelectedPopulation() {
        return this.selectedPopulation;
    }

    reset() {
        if (this.selectedPopulation) {
            const selector = this.listGroup.querySelector(`[data-population="${this.selectedPopulation.name}"]`);
            if (selector) {
                selector.style.border = '2px solid transparent';
                selector.style.transform = 'scale(1)';
            }
            this.selectedPopulation = null;
        }
    }

    destroy() {
        this.draggable.destroy();
    }
}

export default SuperpopulationWidget;
