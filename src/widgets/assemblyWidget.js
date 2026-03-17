import { Draggable } from '../utils/draggable.js';
import eventBus from '../utils/eventBus.js';
import GenomicService from "../genomicService.js"
import Look from "../looks/look.js"

class AssemblyWidget {
    static ASSEMBLY_SPINE_FEATURES_EMPHASIS = 'spine_features';
    static ASSEMBLY_SUBGRAPH_EMPHASIS = 'subgraph';

    constructor(assemblyWidgetContainer, genomicService, geometryManager) {

        this.assemblyWidgetContainer = assemblyWidgetContainer;
        this.draggable = new Draggable(this.assemblyWidgetContainer);

        this.genomicService = genomicService;
        this.geometryManager = geometryManager

        this.listGroup = this.assemblyWidgetContainer.querySelector('.list-group');

        this.searchInput = null; // Will be initialized when card is shown
        this.switchInput = null; // Will be initialized when card is shown
        this.modeLabel = null; // Will be initialized when card is shown

        this.restoreUnsub = eventBus.subscribe('assembly:normal', data => {
            const selectors = Array.from(this.listGroup.querySelectorAll('.assembly-widget__genome-selector'))
            for (const selector of selectors) {
                selector.style.border = '2px solid transparent'
                selector.style.backgroundColor = Look.DEFAULT_NODE_COLOR
                // Remove inline transform to allow CSS hover effects to work
                selector.style.transform = ''
            }
        })

        this.selectedAssembly = null; // Track selected assembly as { name, color } object
        this.allAssemblyItems = new Map(); // Store all items for filtering

        this.emphasisMode = AssemblyWidget.ASSEMBLY_SUBGRAPH_EMPHASIS; // Default to subgraph emphasis

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

        for (const assemblyKey of this.genomicService.assemblySet){
            const item = this.createListItem(assemblyKey);
            this.listGroup.appendChild(item);
            this.allAssemblyItems.set(assemblyKey, item);
        }
    }

    createListItem(assemblyKey) {
        const container = document.createElement('div');
        container.className = 'list-group-item d-flex align-items-center gap-3';

        // assembly selector
        const assemblySelector = document.createElement('div');
        container.appendChild(assemblySelector);

        assemblySelector.className = 'assembly-widget__genome-selector';
        assemblySelector.style.backgroundColor = Look.DEFAULT_NODE_COLOR
        assemblySelector.dataset.assembly = assemblyKey;  // Use data attribute instead of direct property

        const onAssemblySelectorClick = this.onAssemblySelectorClick.bind(this, assemblyKey);
        assemblySelector.onAssemblySelectorClick = onAssemblySelectorClick;
        assemblySelector.addEventListener('click', onAssemblySelectorClick);

        // assembly name and haplotype container
        const labelContainer = document.createElement('div');
        container.appendChild(labelContainer);
        labelContainer.className = 'flex-grow-1 d-flex justify-content-end align-items-center gap-2';

        const [ assemblyName, haplotype ] = GenomicService.presentationAssemblyLabel(assemblyKey);

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

    async onAssemblySelectorClick(assembly, event) {
        event.stopPropagation();

        if (this.selectedAssembly && this.selectedAssembly.name === assembly) {
            // Deselect current assembly selector
            this.selectedAssembly = null;

            const nodeSet = this.geometryManager.geometryFactory.getNodeNameSet()
            const edgeSet = this.geometryManager.geometryFactory.getEdgeNameSet()
            eventBus.publish('assembly:normal', { nodeSet, edgeSet })
        } else {
            // Deselect previous assembly selector if one exists
            if (this.selectedAssembly !== null) {
                const nodeSet = this.geometryManager.geometryFactory.getNodeNameSet()
                const edgeSet = this.geometryManager.geometryFactory.getEdgeNameSet()
                eventBus.publish('assembly:normal', { nodeSet, edgeSet })
            }

            console.log(`selected ${ assembly }`)

            // Select new genome and store its name and color
            this.selectedAssembly =
                {
                    name: assembly,
                    color: Look.NODE_EMPHASIS_COLOR
                };
            event.target.style.border = '2px solid #000';
            event.target.style.backgroundColor = Look.NODE_EMPHASIS_COLOR
            event.target.style.transform = 'scale(1.5)'

            this.emphasizeAssembly(this.selectedAssembly);
        }
    }

    emphasizeAssembly(selectedAssembly) {
        let nodeSet, edgeSet;

        if (this.emphasisMode === AssemblyWidget.ASSEMBLY_SPINE_FEATURES_EMPHASIS) {
            // Use spine features data
            const { spine } = this.genomicService.assemblyWalkMap.get(selectedAssembly.name).spineFeatures;
            const { nodes, edges } = spine;
            nodeSet = new Set([...(nodes.map(({ id }) => id))]);
            edgeSet = new Set([...edges]);
        } else {
            // Use assembly subgraph data (default)
            const { nodes, edges } = this.genomicService.assemblyWalkMap.get(selectedAssembly.name).assemblySubgraph;
            nodeSet = new Set([...nodes]);
            edgeSet = new Set([...edges]);
        }

        eventBus.publish('assembly:emphasis', { assembly:selectedAssembly, nodeSet, edgeSet });
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
        if (this.selectedAssembly !== null) {
            this.emphasizeAssembly(this.selectedAssembly);
        }
    }

    cleanupListItem(item) {

        const assemblySelector = item.querySelector('.assembly-widget__genome-selector');
        if (assemblySelector && assemblySelector.onAssemblySelectorClick) {
            assemblySelector.removeEventListener('click', assemblySelector.onAssemblySelectorClick);
            delete assemblySelector.onAssemblySelectorClick;
        }

    }

    showCard() {
        this.assemblyWidgetContainer.style.display = '';
        this.assemblyWidgetContainer.style.top = '0px'
        this.assemblyWidgetContainer.style.left = '0px'
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

    reset() {
        // Clear any selected assembly
        if (this.selectedAssembly) {
            const nodeSet = this.geometryManager.geometryFactory.getNodeNameSet()
            const edgeSet = this.geometryManager.geometryFactory.getEdgeNameSet()
            eventBus.publish('assembly:normal', { nodeSet, edgeSet })
            this.selectedAssembly = null;
        }
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
