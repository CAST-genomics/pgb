import { Draggable } from './utils/draggable.js';
import { colorToRGBString } from './utils/color.js';
import eventBus from './utils/eventBus.js';
import { app } from "./main.js";
import genomicService from "./genomicService.js"

class AssemblyWidget {
    constructor(gear, assemblyWidgetContainer, genomicService, geometryManager, raycastService) {
        this.gear = gear;
        this.gear.addEventListener('click', this.onGearClick.bind(this));

        this.assemblyWidgetContainer = assemblyWidgetContainer;
        this.listGroup = this.assemblyWidgetContainer.querySelector('.list-group');
        this.searchInput = null; // Will be initialized when card is shown

        this.genomicService = genomicService;
        this.geometryManager = geometryManager

        // raycastService.registerClickHandler(this.raycastClickHandler.bind(this));

        this.restoreUnsub = eventBus.subscribe('assembly:normal', data => {
            const selectors = Array.from(this.listGroup.querySelectorAll('.assembly-widget__genome-selector'))
            for (const selector of selectors) {
                selector.style.border = '2px solid transparent'
                selector.style.transform = 'scale(1)' // Reset to normal size
            }
        })

        this.draggable = new Draggable(this.assemblyWidgetContainer);
        this.selectedAssemblies = new Set()
        this.allAssemblyItems = new Map(); // Store all items for filtering

    }

    raycastClickHandler(intersection, event) {

        if (intersection) {
        } else {
            this.selectedAssemblies.clear();
            eventBus.publish('assembly:normal', { nodeNames: this.genomicService.getNodeNameSet(), assemblySet: this.genomicService.assemblySet });
        }
    }

    createListItem(assembly, color) {
        const container = document.createElement('div');
        container.className = 'list-group-item d-flex align-items-center gap-3';

        // assembly selector
        const assemblySelector = document.createElement('div');
        assemblySelector.className = 'assembly-widget__genome-selector';
        assemblySelector.style.backgroundColor = colorToRGBString(color);
        assemblySelector.dataset.assembly = assembly;  // Use data attribute instead of direct property

        const onAssemblySelectorClick = this.onAssemblySelectorClick.bind(this, assembly);
        assemblySelector.onAssemblySelectorClick = onAssemblySelectorClick;
        assemblySelector.addEventListener('click', onAssemblySelectorClick);
        container.appendChild(assemblySelector);

        // assembly name
        const label = document.createElement('span');
        label.className = 'flex-grow-1';
        label.textContent = assembly;
        container.appendChild(label);

        // assembly flow switch - for the time being, the flow switch is hidden
        const assemblyFlowSwitch = document.createElement('div');
        assemblyFlowSwitch.className = 'form-check form-switch d-none';

        const assemblyFlowSwitchInput = document.createElement('input');
        assemblyFlowSwitchInput.className = 'form-check-input';
        assemblyFlowSwitchInput.type = 'checkbox';
        assemblyFlowSwitchInput.role = 'switch';
        assemblyFlowSwitchInput.checked = true;

        const onFlowSwitch = this.onFlowSwitch.bind(this, assembly);
        assemblyFlowSwitchInput.onFlowSwitch = onFlowSwitch;
        assemblyFlowSwitchInput.addEventListener('change', onFlowSwitch);

        assemblyFlowSwitch.appendChild(assemblyFlowSwitchInput);
        container.appendChild(assemblyFlowSwitch);

        return container;
    }

    async onAssemblySelectorClick(assembly, event) {
        event.stopPropagation();

        if (this.selectedAssemblies.has(assembly)) {

            // Deselect current assembly selector
            this.selectedAssemblies.delete(assembly);

            const nodeSet = this.geometryManager.geometryFactory.getNodeNameSet()
            const edgeSet = this.geometryManager.geometryFactory.getEdgeNameSet()
            eventBus.publish('assembly:normal', { nodeSet, edgeSet })
        } else {

            // Deselect previous assembly selector. Select new assembly selector
            if (this.selectedAssemblies.size > 0) {
                const previousAssembly = [...this.selectedAssemblies][0];
                this.selectedAssemblies.delete(previousAssembly);

                const nodeSet = this.geometryManager.geometryFactory.getNodeNameSet()
                const edgeSet = this.geometryManager.geometryFactory.getEdgeNameSet()
                eventBus.publish('assembly:normal', { nodeSet, edgeSet })
            }

            console.log(`selected ${ assembly }`)

            // Select new genome
            this.selectedAssemblies.add(assembly);
            event.target.style.border = '2px solid #000';
            event.target.style.transform = 'scale(1.5)'

            // const { spine } = this.genomicService.assemblyWalkMap.get(assembly).spineFeatures
            // const { nodes, edges } = spine
            // const nodeSet = new Set([ ...(nodes.map(({ id }) => id)) ])
            // const edgeSet = new Set([ ...edges ])

            const { nodes, edges } = this.genomicService.assemblyWalkMap.get(assembly).assemblySubgraph
            const nodeSet = new Set([ ...nodes ])
            const edgeSet = new Set([ ...edges ])

            eventBus.publish('assembly:emphasis', { assembly, nodeSet, edgeSet });
        }
    }

    onFlowSwitch(assembly, event) {
        event.stopPropagation();
        // TODO: Handle flow switch toggle
        console.log('Flow switch toggled for:', assembly, event.target.checked);
    }

    initializeSearchInput() {
        if (!this.searchInput) {
            this.searchInput = this.assemblyWidgetContainer.querySelector('#assembly-search');
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
            this.allAssemblyItems.forEach((item) => {
                item.classList.remove('d-none');
            });
            console.log('Search cleared - all assemblies restored');
        } else {
            // Filter based on search term
            this.filterAssemblies(searchTerm);
        }
    }

    filterAssemblies(searchTerm) {
        this.allAssemblyItems.forEach((item, assembly) => {
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

        const genomeFlowSwitchInput = item.querySelector('.form-check-input');
        if (genomeFlowSwitchInput && genomeFlowSwitchInput.onFlowSwitch) {
            genomeFlowSwitchInput.removeEventListener('change', genomeFlowSwitchInput.onFlowSwitch);
            delete genomeFlowSwitchInput.onFlowSwitch;
        }

    }

    configure() {
        this.populateList()
    }

    populateList() {

        for (const item of this.listGroup.querySelectorAll('.list-group-item')) {
            this.cleanupListItem(item);
        }

        this.listGroup.innerHTML = '';
        this.allAssemblyItems.clear();

        for (const [assembly, {color}] of this.genomicService.assemblyPayload.entries()) {
            const item = this.createListItem(assembly, color);
            this.listGroup.appendChild(item);
            this.allAssemblyItems.set(assembly, item);
        }
    }

    onGearClick(event) {
        event.stopPropagation();
        if (this.assemblyWidgetContainer.classList.contains('show')) {
            this.hideCard();
        } else {
            this.showCard();
        }
    }

    showCard() {
        this.assemblyWidgetContainer.style.display = '';
        setTimeout(() => {
            this.assemblyWidgetContainer.classList.add('show');
            // Initialize search input when card is shown
            this.initializeSearchInput();
        }, 0);
    }

    hideCard() {
        this.assemblyWidgetContainer.classList.remove('show');
        setTimeout(() => {
            this.assemblyWidgetContainer.style.display = 'none';
            // Clear search input when hiding card
            if (this.searchInput) {
                this.searchInput.value = '';
                this.filterAssemblies(''); // Show all items
            }
        }, 200);
    }

    destroy() {
        this.draggable.destroy();
        if (this.searchInput) {
            this.searchInput.removeEventListener('input', this.onSearchInput.bind(this));
        }
    }
}

export default AssemblyWidget;
