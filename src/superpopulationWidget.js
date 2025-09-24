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
        container.className = 'superpopulation-widget__button-container';

        // Superpopulation button
        const superpopulationButton = document.createElement('button');
        container.appendChild(superpopulationButton);

        superpopulationButton.className = 'superpopulation-widget__button';
        superpopulationButton.textContent = superpopulation.name;
        superpopulationButton.dataset.superpopulation = superpopulation.name;
        superpopulationButton.dataset.acronym = superpopulation.acronym;

        const onSuperpopulationButtonClick = this.onSuperpopulationButtonClick.bind(this, superpopulation);
        superpopulationButton.onSuperpopulationButtonClick = onSuperpopulationButtonClick;
        superpopulationButton.addEventListener('click', onSuperpopulationButtonClick);

        return container;
    }

    onSuperpopulationButtonClick(superpopulation, event) {
        event.stopPropagation();

        if (this.selectedSuperpopulation && this.selectedSuperpopulation.name === superpopulation.name) {

            event.target.style.border = '1px solid #dee2e6';
            event.target.style.backgroundColor = '#ffffff';
            event.target.style.transform = 'scale(1)';

            const deselectedSuperpopulation = this.selectedSuperpopulation;
            this.selectedSuperpopulation = null;

            app.setActiveScene('assemblyVisualizationScene', true);
            eventBus.publish('superpopulation:deselected', { superpopulation: deselectedSuperpopulation, acronym: deselectedSuperpopulation.acronym });
        } else {

            if (this.selectedSuperpopulation !== null) {
                const previousButton = this.listGroup.querySelector(`[data-superpopulation="${this.selectedSuperpopulation.name}"]`);
                if (previousButton) {
                    previousButton.style.border = '1px solid #dee2e6';
                    previousButton.style.backgroundColor = '#ffffff';
                    previousButton.style.transform = 'scale(1)';
                }
            }

            event.target.style.border = '2px solid #0d6efd';
            event.target.style.backgroundColor = '#e7f1ff';
            event.target.style.transform = 'scale(1.02)';

            this.selectedSuperpopulation = superpopulation;

            console.log(`Selected superpopulation: ${superpopulation.name}`);

            app.setActiveScene('heatmapScene', true);
            eventBus.publish('superpopulation:selected', { superpopulation, acronym: superpopulation.acronym });
        }
    }

    cleanupListItem(item) {
        const superpopulationButton = item.querySelector('.superpopulation-widget__button');
        if (superpopulationButton && superpopulationButton.onSuperpopulationButtonClick) {
            superpopulationButton.removeEventListener('click', superpopulationButton.onSuperpopulationButtonClick);
            delete superpopulationButton.onSuperpopulationButtonClick;
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
            const button = this.listGroup.querySelector(`[data-superpopulation="${this.selectedSuperpopulation.name}"]`);
            if (button) {
                button.style.border = '1px solid #dee2e6';
                button.style.backgroundColor = '#ffffff';
                button.style.transform = 'scale(1)';
            }
            this.selectedSuperpopulation = null;
        }
    }

    destroy() {
        this.draggable.destroy();
    }
}

export default SuperpopulationWidget;
