import { Draggable } from '../utils/draggable.js';
import eventBus from '../utils/eventBus.ts';
import { pclaiCoordinateService, PCLACoordinateService } from "./pclaiCoordinateService.js"

/**
 * Under a selected assembly-haplotype the graph splits three ways (CONTEXT.md
 * §emphasized / de-emphasized / absent):
 *   emphasized   — in the haplotype's subgraph, with a placement: its PCLAI RGB
 *   absent       — in the subgraph, no placement in the active system: dark gray
 *   de-emphasized — every node outside the subgraph: light gray
 * With no selection the graph is drawn normally.
 */
class PCLAIWidget {

    static NODE_ABSENCE_COLOR = '#aaaaaa';
    static NODE_DEEMPHASIS_COLOR = '#E8E6DC';

    pclaiWidgetContainer: HTMLElement
    draggable: any
    genomicService: any
    geometryManager: any
    listGroup: HTMLElement
    searchInput: HTMLInputElement | null
    selectedCoordinateKey: string | null
    allListItems: Map<string, HTMLElement>

    constructor(pclaiWidgetContainer: HTMLElement, genomicService: any, geometryManager: any) {

        this.pclaiWidgetContainer = pclaiWidgetContainer;
        this.draggable = new Draggable(this.pclaiWidgetContainer);
        this.genomicService = genomicService
        this.geometryManager = geometryManager

        this.listGroup = this.pclaiWidgetContainer.querySelector('.list-group')!;

        this.searchInput = null; // Will be initialized when card is shown

        this.selectedCoordinateKey = null; // Track selected coordinate key
        this.allListItems = new Map(); // Store all items for filtering

    }

    configure(): void {
        this.populateList()
    }

    populateList(): void {

        this.selectedCoordinateKey = null;

        for (const item of this.listGroup.querySelectorAll('.list-group-item')) {
            this.cleanupListItem(item as HTMLElement);
        }

        this.listGroup.innerHTML = '';
        this.allListItems.clear();

        for (const coordinateKey of pclaiCoordinateService.getAllCoordinateKeys()){
            const item = this.createListItem(coordinateKey);
            this.listGroup.appendChild(item);
            this.allListItems.set(coordinateKey, item);
        }
    }

    createListItem(coordinateKey: string): HTMLElement {
        const container = document.createElement('div');
        container.className = 'list-group-item d-flex align-items-center gap-3';

        // assembly selector
        const assemblySelector = document.createElement('div');
        container.appendChild(assemblySelector);

        assemblySelector.className = 'assembly-widget__genome-selector';

        // TODO: Decide if selector dot should use color given that for a given coordinateKey there may
        //       occasionally be more then one color for a given coordinateKey and node id
        // const colorMap = pclaiCoordinateService.getNodeColorMapForCoordinateKey(coordinateKey)

        // background-color set via CSS
        assemblySelector.dataset.assembly = coordinateKey;  // Use data attribute instead of direct property

        const onAssemblySelectorClick = this.onAssemblySelectorClick.bind(this, coordinateKey);
        (assemblySelector as any).onAssemblySelectorClick = onAssemblySelectorClick;
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

    async onAssemblySelectorClick(coordinateKey: string, event: Event): Promise<void> {
        event.stopPropagation();

        if (this.selectedCoordinateKey && this.selectedCoordinateKey === coordinateKey) {

            // Deselect current assembly selector — return the graph to normal
            this.selectedCoordinateKey = null;
            this.clearAllSelectorStyles()

            this.publishNormal()
            eventBus.publish('pclaiWidget:deselect', {})
        } else {
            // Deselect previous assembly selector if one exists. No graph reset
            // is needed: the next emphasis repaints every node.
            if (this.selectedCoordinateKey !== null) {
                this.clearAllSelectorStyles()
            }

            console.log(`selected coordinate key ${ coordinateKey }`)

            // Select new genome and store its name and color
            this.selectedCoordinateKey = coordinateKey

            ;(event.target as HTMLElement).classList.add('pclai-widget__genome-selector--selected')

            this.emphasizeAssembly(this.selectedCoordinateKey);
        }
    }

    clearAllSelectorStyles(): void {
        const selectors = Array.from(this.listGroup.querySelectorAll('.assembly-widget__genome-selector'))
        for (const selector of selectors) {
            selector.classList.remove('pclai-widget__genome-selector--selected')
        }
    }

    emphasizeAssembly(coordinateKey: string): void {
        // A placement can only exist on a node the haplotype passes through, so
        // nodeSet ⊆ subgraph and the three-way split is a clean partition.
        const subgraph: Set<string> = this.genomicService.getAssemblyHaplotypeSubgraphNodes(coordinateKey)
        const nodeSet = new Set<string>(pclaiCoordinateService.getNodeIdsWithCoordinateKey(coordinateKey))
        const absentNodeSet = (subgraph as any).difference(nodeSet) as Set<string>
        const resolvedAssemblyKey = this.genomicService.resolveAssemblyKey(coordinateKey)
        const emphasisColor = pclaiCoordinateService.getNodeColorMapForCoordinateKey(coordinateKey)
        eventBus.publish('pclaiWidget:emphasis', {
            assembly: { name: coordinateKey },
            resolvedAssemblyKey,
            nodeSet,
            absentNodeSet,
            emphasisColor,
            deemphasisColor: PCLAIWidget.NODE_DEEMPHASIS_COLOR,
            absenceColor: PCLAIWidget.NODE_ABSENCE_COLOR,
        });
    }

    publishNormal(): void {
        const nodeSet = this.geometryManager.geometryFactory.getNodeNameSet()
        eventBus.publish('pclaiWidget:normal', { nodeSet })
    }

    initializeSearchInput(): void {
        if (!this.searchInput) {
            this.searchInput = this.pclaiWidgetContainer.querySelector('#pclai-search');
            if (this.searchInput) {
                this.searchInput.addEventListener('input', this.onSearchInput.bind(this));
                console.log('Search input initialized successfully');
            } else {
                console.error('Search input element not found');
            }
        }
    }

    onSearchInput(event: Event): void {
        const searchTerm = (event.target as HTMLInputElement).value.toLowerCase().trim();
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

    filterAssemblies(searchTerm: string): void {
        this.allListItems.forEach((item, assembly) => {
            const matches = assembly.toLowerCase().includes(searchTerm);
            if (matches) {
                item.classList.remove('d-none');
            } else {
                item.classList.add('d-none');
            }
        });
    }

    cleanupListItem(item: HTMLElement): void {

        const assemblySelector = item.querySelector('.assembly-widget__genome-selector') as any;
        if (assemblySelector && assemblySelector.onAssemblySelectorClick) {
            assemblySelector.removeEventListener('click', assemblySelector.onAssemblySelectorClick);
            delete assemblySelector.onAssemblySelectorClick;
        }

    }

    showCard(): void {
        this.pclaiWidgetContainer.style.display = '';
        this.pclaiWidgetContainer.style.top = '0px'
        this.pclaiWidgetContainer.style.left = '0px'

        setTimeout(() => {
            this.pclaiWidgetContainer.classList.add('show');
            // Initialize search input when card is shown
            this.initializeSearchInput();
            // Restore visual state of selected coordinate key if one exists
            this.restoreSelectedCoordinateKeyVisualState();
        }, 0);
    }

    /**
     * Restore the visual state of the selected coordinate key when card is shown
     * This ensures the selection persists when the widget is dismissed and re-opened
     */
    restoreSelectedCoordinateKeyVisualState(): void {
        if (this.selectedCoordinateKey) {
            // Find the selector for the selected coordinate key
            const selectors = Array.from(this.listGroup.querySelectorAll('.assembly-widget__genome-selector')) as HTMLElement[];
            const selectedSelector = selectors.find(selector => selector.dataset.assembly === this.selectedCoordinateKey);

            if (selectedSelector) {
                selectedSelector.classList.add('pclai-widget__genome-selector--selected');
            }
        }
    }

    hideCard(): void {
        this.pclaiWidgetContainer.classList.remove('show');
        setTimeout(() => {
            this.pclaiWidgetContainer.style.display = 'none';
            // Clear search input when hiding card
            if (this.searchInput) {
                this.searchInput.value = '';
                this.filterAssemblies(''); // Show all items
            }
        }, 200);
    }

    reset(): void {
        const wasSelected = this.selectedCoordinateKey !== null
        this.clearAllSelectorStyles()
        this.selectedCoordinateKey = null;

        // Mimic the deselect path. Restore *every* node, not just the
        // emphasized set: the de-emphasized remainder is painted implicitly by
        // setNodeEmphasis(), not from an enumerated node list.
        if (wasSelected) {
            this.publishNormal()
            eventBus.publish('pclaiWidget:deselect', {})
        }
    }

    destroy(): void {
        this.draggable.destroy();
        if (this.searchInput) {
            this.searchInput.removeEventListener('input', this.onSearchInput.bind(this));
        }
    }
}

export default PCLAIWidget;
