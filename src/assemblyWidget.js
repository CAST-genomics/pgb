import { Draggable } from './utils/draggable.js';
import { colorToRGBString } from './utils/color.js';
import eventBus from './utils/eventBus.js';
import { app } from "./main.js";
import genomicService from "./genomicService.js"

class AssemblyWidget {
    static ASSEMBLY_SPINE_FEATURES_EMPHASIS = 'spine_features';
    static ASSEMBLY_SUBGRAPH_EMPHASIS = 'subgraph';

    constructor(gear, assemblyWidgetContainer, genomicService, geometryManager, raycastService) {
        this.gear = gear;
        this.gear.addEventListener('click', this.onGearClick.bind(this));

        this.assemblyWidgetContainer = assemblyWidgetContainer;
        this.listGroup = this.assemblyWidgetContainer.querySelector('.list-group');
        this.searchInput = null; // Will be initialized when card is shown
        this.switchInput = null; // Will be initialized when card is shown
        this.modeLabel = null; // Will be initialized when card is shown

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
        this.emphasisMode = AssemblyWidget.ASSEMBLY_SUBGRAPH_EMPHASIS; // Default to subgraph emphasis

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

            this.emphasizeAssembly(assembly);
        }
    }

    emphasizeAssembly(assembly) {
        let nodeSet, edgeSet;
        
        if (this.emphasisMode === AssemblyWidget.ASSEMBLY_SPINE_FEATURES_EMPHASIS) {
            // Use spine features data
            const { spine } = this.genomicService.assemblyWalkMap.get(assembly).spineFeatures;
            const { nodes, edges } = spine;
            nodeSet = new Set([...(nodes.map(({ id }) => id))]);
            edgeSet = new Set([...edges]);
        } else {
            // Use assembly subgraph data (default)
            const { nodes, edges } = this.genomicService.assemblyWalkMap.get(assembly).assemblySubgraph;
            nodeSet = new Set([...nodes]);
            edgeSet = new Set([...edges]);
        }
        
        eventBus.publish('assembly:emphasis', { assembly, nodeSet, edgeSet });
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

    initializeSwitchInput() {
        if (!this.switchInput) {
            this.switchInput = this.assemblyWidgetContainer.querySelector('.form-check-input[type="checkbox"]');
            if (this.switchInput) {
                this.switchInput.addEventListener('change', this.onSwitchChange.bind(this));
                console.log('Switch input initialized successfully');
            } else {
                console.error('Switch input element not found');
            }
        }
    }

    initializeModeLabel() {
        if (!this.modeLabel) {
            this.modeLabel = this.assemblyWidgetContainer.querySelector('#emphasis-mode-label');
            if (this.modeLabel) {
                // Set initial label text based on current emphasis mode
                this.updateModeLabel();
                console.log('Mode label initialized successfully');
            } else {
                console.error('Mode label element not found');
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

    updateModeLabel() {
        if (this.modeLabel) {
            if (this.emphasisMode === AssemblyWidget.ASSEMBLY_SPINE_FEATURES_EMPHASIS) {
                this.modeLabel.textContent = 'Assembly Walk';
            } else {
                this.modeLabel.textContent = 'Assembly Subgraph';
            }
        }
    }

    onSwitchChange(event) {
        const isChecked = event.target.checked;
        console.log('Switch toggled:', isChecked);
        
        // Toggle between the two emphasis modes
        if (isChecked) {
            this.emphasisMode = AssemblyWidget.ASSEMBLY_SPINE_FEATURES_EMPHASIS;
        } else {
            this.emphasisMode = AssemblyWidget.ASSEMBLY_SUBGRAPH_EMPHASIS;
        }
        
        console.log('Emphasis mode changed to:', this.emphasisMode);
        
        // Update the label text
        this.updateModeLabel();
        
        // If there's a currently selected assembly, re-emphasize it with the new mode
        if (this.selectedAssemblies.size > 0) {
            const selectedAssembly = [...this.selectedAssemblies][0];
            this.emphasizeAssembly(selectedAssembly);
        }
    }

    cleanupListItem(item) {

        const assemblySelector = item.querySelector('.assembly-widget__genome-selector');
        if (assemblySelector && assemblySelector.onAssemblySelectorClick) {
            assemblySelector.removeEventListener('click', assemblySelector.onAssemblySelectorClick);
            delete assemblySelector.onAssemblySelectorClick;
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
            // Initialize switch input when card is shown
            this.initializeSwitchInput();
            // Initialize mode label when card is shown
            this.initializeModeLabel();
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
        if (this.switchInput) {
            this.switchInput.removeEventListener('change', this.onSwitchChange.bind(this));
        }
    }
}

export default AssemblyWidget;
