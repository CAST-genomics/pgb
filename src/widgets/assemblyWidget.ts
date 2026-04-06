import { Draggable } from '../utils/draggable.js';
import eventBus from '../utils/eventBus.ts';
import GenomicService from "../genomicService.js"
import Look from "../looks/look.ts"

class AssemblyWidget {
    static ASSEMBLY_SPINE_FEATURES_EMPHASIS = 'spine_features';
    static ASSEMBLY_SUBGRAPH_EMPHASIS = 'subgraph';
    static NODE_DEEMPHASIS_COLOR = '#a89292';

    assemblyWidgetContainer: HTMLElement
    draggable: any
    genomicService: any
    geometryManager: any
    listGroup: HTMLElement
    searchInput: HTMLInputElement | null
    switchInput: HTMLInputElement | null
    modeLabel: HTMLElement | null
    selectedAssembly: { name: string; color: string } | null
    allAssemblyItems: Map<string, HTMLElement>
    emphasisMode: string
    private restoreUnsub: () => void

    constructor(assemblyWidgetContainer: HTMLElement, genomicService: any, geometryManager: any) {

        this.assemblyWidgetContainer = assemblyWidgetContainer;
        this.draggable = new Draggable(this.assemblyWidgetContainer);

        this.genomicService = genomicService;
        this.geometryManager = geometryManager

        this.listGroup = this.assemblyWidgetContainer.querySelector('.list-group')!;

        this.searchInput = null; // Will be initialized when card is shown
        this.switchInput = null; // Will be initialized when card is shown
        this.modeLabel = null; // Will be initialized when card is shown

        this.restoreUnsub = eventBus.subscribe('assembly:normal', data => {
            const selectors = Array.from(this.listGroup.querySelectorAll('.assembly-widget__genome-selector'))
            for (const selector of selectors) {
                selector.classList.remove('assembly-widget__genome-selector--selected')
            }
        })

        this.selectedAssembly = null; // Track selected assembly as { name, color } object
        this.allAssemblyItems = new Map(); // Store all items for filtering

        this.emphasisMode = AssemblyWidget.ASSEMBLY_SUBGRAPH_EMPHASIS; // Default to subgraph emphasis

    }

    configure(): void {
        this.populateList()
    }

    populateList(): void {

        this.selectedAssembly = null;

        for (const item of this.listGroup.querySelectorAll('.list-group-item')) {
            this.cleanupListItem(item as HTMLElement);
        }

        this.listGroup.innerHTML = '';
        this.allAssemblyItems.clear();

        for (const assemblyKey of this.genomicService.assemblySet){
            const item = this.createListItem(assemblyKey);
            this.listGroup.appendChild(item);
            this.allAssemblyItems.set(assemblyKey, item);
        }
    }

    createListItem(assemblyKey: string): HTMLElement {
        const container = document.createElement('div');
        container.className = 'list-group-item d-flex align-items-center gap-3';

        // assembly selector
        const assemblySelector = document.createElement('div');
        container.appendChild(assemblySelector);

        assemblySelector.className = 'assembly-widget__genome-selector';
        // background-color set via CSS
        assemblySelector.dataset.assembly = assemblyKey;  // Use data attribute instead of direct property

        const onAssemblySelectorClick = this.onAssemblySelectorClick.bind(this, assemblyKey);
        (assemblySelector as any).onAssemblySelectorClick = onAssemblySelectorClick;
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

    async onAssemblySelectorClick(assembly: string, event: Event): Promise<void> {
        event.stopPropagation();

        if (this.selectedAssembly && this.selectedAssembly.name === assembly) {
            // Deselect current assembly selector
            this.selectedAssembly = null;

            const nodeSet = this.geometryManager.geometryFactory.getNodeNameSet()
            eventBus.publish('assembly:normal', { nodeSet })
        } else {
            // Deselect previous assembly selector if one exists
            if (this.selectedAssembly !== null) {
                const nodeSet = this.geometryManager.geometryFactory.getNodeNameSet()
                eventBus.publish('assembly:normal', { nodeSet })
            }

            console.log(`selected ${ assembly }`)

            // Select new genome and store its name and color
            this.selectedAssembly =
                {
                    name: assembly,
                    color: Look.NODE_EMPHASIS_COLOR
                };
            (event.target as HTMLElement).classList.add('assembly-widget__genome-selector--selected')

            this.emphasizeAssembly(this.selectedAssembly);
        }
    }

    emphasizeAssembly(selectedAssembly: { name: string; color: string }): void {
        let nodeSet;

        if (this.emphasisMode === AssemblyWidget.ASSEMBLY_SPINE_FEATURES_EMPHASIS) {
            // Use spine features data
            const { spine } = this.genomicService.assemblyWalkMap.get(selectedAssembly.name).spineFeatures;
            const { nodes } = spine;
            nodeSet = new Set([...(nodes.map(({ id }: { id: string }) => id))]);
        } else {
            // Use assembly subgraph data (default)
            const { nodes } = this.genomicService.assemblyWalkMap.get(selectedAssembly.name).assemblySubgraph;
            nodeSet = new Set([...nodes]);
        }

        eventBus.publish('assembly:emphasis', { assembly:selectedAssembly, nodeSet, deemphasisColor: AssemblyWidget.NODE_DEEMPHASIS_COLOR });
    }

    initializeSearchInput(): void {
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

    initializeSwitchInput(): void {
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

    initializeModeLabel(): void {
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

    onSearchInput(event: Event): void {
        const searchTerm = (event.target as HTMLInputElement).value.toLowerCase().trim();
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

    filterAssemblies(searchTerm: string): void {
        this.allAssemblyItems.forEach((item, assembly) => {
            const matches = assembly.toLowerCase().includes(searchTerm);
            if (matches) {
                item.classList.remove('d-none');
            } else {
                item.classList.add('d-none');
            }
        });
    }

    updateModeLabel(): void {
        if (this.modeLabel) {
            if (this.emphasisMode === AssemblyWidget.ASSEMBLY_SPINE_FEATURES_EMPHASIS) {
                this.modeLabel.textContent = 'Assembly Walk';
            } else {
                this.modeLabel.textContent = 'Assembly Subgraph';
            }
        }
    }

    onSwitchChange(event: Event): void {
        const isChecked = (event.target as HTMLInputElement).checked;
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

    cleanupListItem(item: HTMLElement): void {

        const assemblySelector = item.querySelector('.assembly-widget__genome-selector') as any;
        if (assemblySelector && assemblySelector.onAssemblySelectorClick) {
            assemblySelector.removeEventListener('click', assemblySelector.onAssemblySelectorClick);
            delete assemblySelector.onAssemblySelectorClick;
        }

    }

    showCard(): void {
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

    hideCard(): void {
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

    reset(): void {
        // Clear any selected assembly
        if (this.selectedAssembly) {
            const nodeSet = this.geometryManager.geometryFactory.getNodeNameSet()
            eventBus.publish('assembly:normal', { nodeSet })
            this.selectedAssembly = null;
        }
    }

    destroy(): void {
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
