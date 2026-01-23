import { Draggable } from '../utils/draggable.js';
import eventBus from '../utils/eventBus.js';
import { pclaiCoordinateService, PCLACoordinateService } from "./pclaiCoordinateService.js"
import Look from "../looks/look.js"

class PCAWidget {

    constructor(pcaWidgetContainer, geometryManager) {

        this.pcaWidgetContainer = pcaWidgetContainer;
        this.draggable = new Draggable(this.pcaWidgetContainer);
        this.geometryManager = geometryManager

        this.listGroup = this.pcaWidgetContainer.querySelector('.list-group');

        this.searchInput = null; // Will be initialized when card is shown

        this.restoreUnsub = eventBus.subscribe('pcaWidget:normal', data => {
            const selectors = Array.from(this.listGroup.querySelectorAll('.assembly-widget__genome-selector'))
            for (const selector of selectors) {
                selector.style.border = '2px solid transparent'
                // selector.style.backgroundColor = Look.DEFAULT_NODE_COLOR
                // Remove inline transform to allow CSS hover effects to work
                selector.style.transform = ''
            }
        })

        this.selectedCoordinateKey = null; // Track selected coordinate key
        this.allListItems = new Map(); // Store all items for filtering

    }

    configure() {
        this.populateList()
    }

    populateList() {

        for (const item of this.listGroup.querySelectorAll('.list-group-item')) {
            this.cleanupListItem(item);
        }

        this.listGroup.innerHTML = '';
        this.allListItems.clear();

        for (const coordinateKey of pclaiCoordinateService.getAllCoordinateKeys()){
            const item = this.createListItem(coordinateKey);
            this.listGroup.appendChild(item);
            this.allListItems.set(coordinateKey, item);
        }
    }

    createListItem(coordinateKey) {
        const container = document.createElement('div');
        container.className = 'list-group-item d-flex align-items-center gap-3';

        // assembly selector
        const assemblySelector = document.createElement('div');
        container.appendChild(assemblySelector);

        assemblySelector.className = 'assembly-widget__genome-selector';
        assemblySelector.style.backgroundColor = Look.DEFAULT_NODE_COLOR
        assemblySelector.dataset.assembly = coordinateKey;  // Use data attribute instead of direct property

        const onAssemblySelectorClick = this.onAssemblySelectorClick.bind(this, coordinateKey);
        assemblySelector.onAssemblySelectorClick = onAssemblySelectorClick;
        assemblySelector.addEventListener('click', onAssemblySelectorClick);

        // assembly name and haplotype container
        const labelContainer = document.createElement('div');
        container.appendChild(labelContainer);
        labelContainer.className = 'flex-grow-1 d-flex justify-content-end align-items-center gap-2';

        const [ assemblyName, haplotype ] = PCLACoordinateService.presentationLabel(coordinateKey);

        // assembly name
        const nameLabel = document.createElement('span');
        labelContainer.appendChild(nameLabel);
        nameLabel.textContent = assemblyName;
        nameLabel.className = 'assembly-widget__assembly-name';

        // haplotype
        const haplotypeLabel = document.createElement('span');
        labelContainer.appendChild(haplotypeLabel);
        haplotypeLabel.textContent = `hap${haplotype}`;
        haplotypeLabel.className = 'assembly-widget__assembly-haplotype';

        return container;
    }

    async onAssemblySelectorClick(coordinateKey, event) {
        event.stopPropagation();

        if (this.selectedCoordinateKey && this.selectedCoordinateKey === coordinateKey) {

            // Deselect current assembly selector
            this.selectedCoordinateKey = null;

            const nodeSet = this.geometryManager.geometryFactory.getNodeNameSet()
            const edgeSet = this.geometryManager.geometryFactory.getEdgeNameSet()
            eventBus.publish('pcaWidget:normal', { nodeSet, edgeSet })
        } else {
            // Deselect previous assembly selector if one exists
            if (this.selectedCoordinateKey !== null) {
                const nodeSet = this.geometryManager.geometryFactory.getNodeNameSet()
                const edgeSet = this.geometryManager.geometryFactory.getEdgeNameSet()
                eventBus.publish('pcaWidget:normal', { nodeSet, edgeSet })
            }

            console.log(`selected coordinate key ${ coordinateKey }`)

            // Select new genome and store its name and color
            this.selectedCoordinateKey = coordinateKey

            event.target.style.border = '2px solid #000';
            // event.target.style.backgroundColor = Look.NODE_EMPHASIS_COLOR
            event.target.style.transform = 'scale(1.5)'

            this.emphasizeAssembly(this.selectedCoordinateKey);
        }
    }

    emphasizeAssembly(coordinateKey) {

        const nodeSet = new Set(pclaiCoordinateService.getNodeIdsWithCoordinateKey(coordinateKey))
        const edgeSet = new Set()

        eventBus.publish('pcaWidget:emphasis', { assembly: { name: coordinateKey }, nodeSet, edgeSet });
    }

    initializeSearchInput() {
        if (!this.searchInput) {
            this.searchInput = this.pcaWidgetContainer.querySelector('#pca-search');
            if (this.searchInput) {
                this.searchInput.addEventListener('input', this.onSearchInput.bind(this));
                console.log('Search input initialized successfully');
            } else {
                console.error('Search input element not found');
            }
        }
    }

    onSearchInput(event) {
        const searchTerm = event.target.value.toLowerCase().trim();
        console.log('Search term:', searchTerm);

        if (searchTerm === '') {
            // When search is cleared, show all items
            this.allListItems.forEach((item) => {
                item.classList.remove('d-none');
            });
            console.log('Search cleared - all assemblies restored');
        } else {
            // Filter based on search term
            this.filterAssemblies(searchTerm);
        }
    }

    filterAssemblies(searchTerm) {
        this.allListItems.forEach((item, assembly) => {
            const matches = assembly.toLowerCase().includes(searchTerm);
            if (matches) {
                item.classList.remove('d-none');
            } else {
                item.classList.add('d-none');
            }
        });
    }

    cleanupListItem(item) {

        const assemblySelector = item.querySelector('.assembly-widget__genome-selector');
        if (assemblySelector && assemblySelector.onAssemblySelectorClick) {
            assemblySelector.removeEventListener('click', assemblySelector.onAssemblySelectorClick);
            delete assemblySelector.onAssemblySelectorClick;
        }

    }

    showCard() {
        this.pcaWidgetContainer.style.display = '';
        this.pcaWidgetContainer.style.top = '0px'
        this.pcaWidgetContainer.style.left = '0px'
        setTimeout(() => {
            this.pcaWidgetContainer.classList.add('show');
            // Initialize search input when card is shown
            this.initializeSearchInput();
        }, 0);
    }

    hideCard() {
        this.pcaWidgetContainer.classList.remove('show');
        setTimeout(() => {
            this.pcaWidgetContainer.style.display = 'none';
            // Clear search input when hiding card
            if (this.searchInput) {
                this.searchInput.value = '';
                this.filterAssemblies(''); // Show all items
            }
        }, 200);
    }

    reset() {
        // Clear any selected assembly
        if (this.selectedCoordinateKey) {
            const nodeSet = this.geometryManager.geometryFactory.getNodeNameSet()
            const edgeSet = this.geometryManager.geometryFactory.getEdgeNameSet()
            eventBus.publish('assembly:normal', { nodeSet, edgeSet })
            this.selectedCoordinateKey = null;
        }
    }

    destroy() {
        this.draggable.destroy();
        if (this.searchInput) {
            this.searchInput.removeEventListener('input', this.onSearchInput.bind(this));
        }
    }
}

export default PCAWidget;
