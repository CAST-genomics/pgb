import { Draggable } from './utils/draggable.js';
import eventBus from './utils/eventBus.js';
import { getAllSuperpopulationNames } from './utils/pangenomeUtils.js';
import {app} from "./main.js"

class SuperpopulationWidget {
    constructor(superpopulationWidgetContainer) {
        this.superpopulationWidgetContainer = superpopulationWidgetContainer;
        this.draggable = new Draggable(this.superpopulationWidgetContainer);

        this.listGroup = this.superpopulationWidgetContainer.querySelector('.list-group');

        this.selectedSuperpopulation = null;
        this.allSuperpopulationItems = new Map();

        // Get superpopulation data from pangenomeUtils
        this.superpopulations = this.initializeSuperpopulations();

        this.configure();
    }

    initializeSuperpopulations() {
        const superpopulationData = getAllSuperpopulationNames();

        // Color mapping for each superpopulation
        const colorMap = {
            'AMR': '#96CEB4', // Ad Mixed American - light green
            'AFR': '#FF6B6B', // African - red
            'EAS': '#45B7D1', // East Asian - blue
            'SAS': '#4ECDC4', // South Asian - teal
            'N/A': '#D3D3D3'  // Not Available - light gray
        };

        return superpopulationData.map(item => ({
            acronym: item.acronym,
            name: item.name,
            color: colorMap[item.acronym] || '#D3D3D3'
        }));
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

        for (const superpopulation of this.superpopulations) {
            const item = this.createListItem(superpopulation);
            this.listGroup.appendChild(item);
            this.allSuperpopulationItems.set(superpopulation.name, item);
        }
    }

    createListItem(superpopulation) {
        const container = document.createElement('div');
        container.className = 'list-group-item d-flex align-items-center gap-3';

        // Superpopulation selector (colored circle)
        const superpopulationSelector = document.createElement('div');
        container.appendChild(superpopulationSelector);

        superpopulationSelector.className = 'superpopulation-widget__superpopulation-selector';
        superpopulationSelector.style.backgroundColor = superpopulation.color;
        superpopulationSelector.dataset.superpopulation = superpopulation.name;
        superpopulationSelector.dataset.acronym = superpopulation.acronym;

        const onSuperpopulationSelectorClick = this.onSuperpopulationSelectorClick.bind(this, superpopulation);
        superpopulationSelector.onSuperpopulationSelectorClick = onSuperpopulationSelectorClick;
        superpopulationSelector.addEventListener('click', onSuperpopulationSelectorClick);

        // Superpopulation name
        const nameLabel = document.createElement('span');
        container.appendChild(nameLabel);
        nameLabel.textContent = superpopulation.name;
        nameLabel.className = 'superpopulation-widget__superpopulation-name flex-grow-1';

        return container;
    }

    onSuperpopulationSelectorClick(superpopulation, event) {
        event.stopPropagation();

        if (this.selectedSuperpopulation && this.selectedSuperpopulation.name === superpopulation.name) {

            const deselectedSuperpopulation = this.selectedSuperpopulation;
            this.selectedSuperpopulation = null;

            event.target.style.border = '2px solid transparent';
            event.target.style.transform = 'scale(1)';

            // app.setActiveScene('assemblyVisualizationScene', true);
            eventBus.publish('superpopulation:deselected', { superpopulation: deselectedSuperpopulation, acronym: deselectedSuperpopulation.acronym });
        } else {

            if (this.selectedSuperpopulation !== null) {
                const previousSelector = this.listGroup.querySelector(`[data-superpopulation="${this.selectedSuperpopulation.name}"]`);
                if (previousSelector) {
                    previousSelector.style.border = '2px solid transparent';
                    previousSelector.style.transform = 'scale(1)';
                }
            }

            this.selectedSuperpopulation = superpopulation;

            event.target.style.border = '2px solid #000';
            event.target.style.transform = 'scale(1.5)';

            console.log(`Selected superpopulation: ${superpopulation.name}`);

            // app.setActiveScene('heatmapScene', true);
            eventBus.publish('superpopulation:selected', { superpopulation, acronym: superpopulation.acronym });
        }
    }

    cleanupListItem(item) {
        const superpopulationSelector = item.querySelector('.superpopulation-widget__superpopulation-selector');
        if (superpopulationSelector && superpopulationSelector.onSuperpopulationSelectorClick) {
            superpopulationSelector.removeEventListener('click', superpopulationSelector.onSuperpopulationSelectorClick);
            delete superpopulationSelector.onSuperpopulationSelectorClick;
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

    getSelectedSuperpopulation() {
        return this.selectedSuperpopulation;
    }

    reset() {
        if (this.selectedSuperpopulation) {
            const selector = this.listGroup.querySelector(`[data-superpopulation="${this.selectedSuperpopulation.name}"]`);
            if (selector) {
                selector.style.border = '2px solid transparent';
                selector.style.transform = 'scale(1)';
            }
            this.selectedSuperpopulation = null;
        }
    }

    destroy() {
        this.draggable.destroy();
    }
}

export default SuperpopulationWidget;
