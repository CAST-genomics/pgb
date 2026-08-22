import { Draggable } from '../utils/draggable.js';
import eventBus from '../utils/eventBus.ts';
import GenomicService from "../genomicService.js"
import { DEFAULT_DATASET_LAYOUT, type DatasetLayout, type DatasetModel } from '../datasetModel.ts';

class AssemblyWidget {
    static ASSEMBLY_SPINE_FEATURES_EMPHASIS = 'spine_features';
    static ASSEMBLY_SUBGRAPH_EMPHASIS = 'subgraph';
    static NODE_EMPHASIS_COLOR = '#c0311a';
    static NODE_DEEMPHASIS_COLOR = '#e8d0cc';
    static NODE_OFF_WALK_COLOR = '#9a9a9a';

    assemblyWidgetContainer: HTMLElement
    draggable: any
    genomicService: any
    geometryManager: any
    listGroup: HTMLElement
    searchInput: HTMLInputElement | null
    switchInput: HTMLInputElement | null
    modeLabel: HTMLElement | null
    linearSwitch: HTMLInputElement | null
    rebuildButton: HTMLButtonElement | null
    spineLabel: HTMLElement | null
    selectedAssembly: { name: string; color: string } | null
    allAssemblyItems: Map<string, HTMLElement>
    emphasisMode: string
    linearEnabled: boolean
    rebuildInFlight: boolean
    datasetLayout: DatasetLayout
    private hideTimeoutId: ReturnType<typeof setTimeout> | null
    private unsubscribers: Array<() => void>
    constructor(assemblyWidgetContainer: HTMLElement, genomicService: any, geometryManager: any) {

        this.assemblyWidgetContainer = assemblyWidgetContainer;
        this.draggable = new Draggable(this.assemblyWidgetContainer);

        this.genomicService = genomicService;
        this.geometryManager = geometryManager

        this.listGroup = this.assemblyWidgetContainer.querySelector('.list-group')!;

        this.searchInput = null; // Will be initialized when card is shown
        this.switchInput = null; // Will be initialized when card is shown
        this.modeLabel = null; // Will be initialized when card is shown
        this.linearSwitch = null; // Will be initialized when card is shown
        this.rebuildButton = null; // Will be initialized when card is shown
        this.spineLabel = null; // Will be initialized when card is shown

        this.selectedAssembly = null; // Track selected assembly as { name, color } object
        this.allAssemblyItems = new Map(); // Store all items for filtering

        this.emphasisMode = AssemblyWidget.ASSEMBLY_SUBGRAPH_EMPHASIS; // Default to subgraph emphasis

        this.linearEnabled = false;
        this.rebuildInFlight = false;
        this.datasetLayout = { ...DEFAULT_DATASET_LAYOUT };
        this.hideTimeoutId = null;

        this.unsubscribers = [
            eventBus.subscribe('datasetLoaded', ({ dataset }) => this.onDatasetLoaded(dataset)),
            eventBus.subscribe('layout:rebuildSettled', ({ ok }) => this.onRebuildSettled(ok)),
        ];

    }

    private clearSelection(): void {
        const selectors = this.listGroup.querySelectorAll('.assembly-widget__genome-selector--selected');
        for (const selector of selectors) {
            selector.classList.remove('assembly-widget__genome-selector--selected');
        }
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
            this.deselectAssembly();
        } else {
            this.selectAssembly(assembly);
        }
    }

    /**
     * Select an assembly and emphasize it. Selection never changes the layout —
     * only the Rebuild button fetches. Also used to restore the spine selection
     * after a reload, which is why it takes a key rather than a click event.
     */
    selectAssembly(assembly: string): void {

        const item = this.allAssemblyItems.get(assembly);
        if (!item) {
            console.warn(`selectAssembly: no list item for ${ assembly }`);
            return;
        }

        // Deselect previous assembly selector if one exists
        if (this.selectedAssembly !== null) {
            this.clearSelection();
            const nodeSet = this.geometryManager.geometryFactory.getNodeNameSet()
            eventBus.publish('assembly:normal', { nodeSet })
        }

        console.log(`selected ${ assembly }`)

        // Select new genome and store its name and color
        this.selectedAssembly =
            {
                name: assembly,
                color: AssemblyWidget.NODE_EMPHASIS_COLOR
            };

        item.querySelector('.assembly-widget__genome-selector')
            ?.classList.add('assembly-widget__genome-selector--selected')

        this.emphasizeAssembly(this.selectedAssembly);

        this.updateRebuildState();
    }

    /**
     * Drop emphasis. The layout is untouched — dataset.layout.spineAssembly,
     * not the selection, is the record of what the geometry is laid out against.
     */
    deselectAssembly(): void {
        this.clearSelection();
        this.selectedAssembly = null;

        const nodeSet = this.geometryManager.geometryFactory.getNodeNameSet()
        eventBus.publish('assembly:normal', { nodeSet })

        this.updateRebuildState();
    }

    emphasizeAssembly(selectedAssembly: { name: string; color: string }): void {
        const walkInfo = this.genomicService.assemblyWalkMap.get(selectedAssembly.name)
        let nodeSet: Set<string>
        let offWalkNodeSet: Set<string> | undefined

        if (this.emphasisMode === AssemblyWidget.ASSEMBLY_SPINE_FEATURES_EMPHASIS) {
            // Walk mode: emphasized = walk nodes; off-walk anchored = subgraph \ walk.
            const { nodes: walkNodes } = walkInfo.spineFeatures.spine
            nodeSet = new Set<string>(walkNodes.map(({ id }: { id: string }) => id))
            const subgraphNodes = new Set(walkInfo.assemblySubgraph.nodes as Iterable<string>)
            offWalkNodeSet = (subgraphNodes as any).difference(nodeSet)
        } else {
            // Subgraph mode: emphasized = subgraph nodes; no off-walk distinction.
            nodeSet = new Set<string>(walkInfo.assemblySubgraph.nodes)
        }

        const mode = this.emphasisMode === AssemblyWidget.ASSEMBLY_SPINE_FEATURES_EMPHASIS ? 'walk' : 'subgraph'
        eventBus.publish('assembly:emphasis', {
            assembly: selectedAssembly,
            nodeSet,
            offWalkNodeSet,
            mode,
            emphasisColor: AssemblyWidget.NODE_EMPHASIS_COLOR,
            deemphasisColor: AssemblyWidget.NODE_DEEMPHASIS_COLOR,
            offWalkColor: AssemblyWidget.NODE_OFF_WALK_COLOR,
        });
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
            this.switchInput = this.assemblyWidgetContainer.querySelector('#emphasis-mode-switch');
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

    initializeLinearSwitch(): void {
        if (!this.linearSwitch) {
            this.linearSwitch = this.assemblyWidgetContainer.querySelector('#linear-mode-switch');
            if (this.linearSwitch) {
                this.linearSwitch.addEventListener('change', this.onLinearSwitchChange.bind(this));
                this.linearSwitch.checked = this.linearEnabled;
                console.log('Linear switch initialized successfully');
            } else {
                console.error('Linear switch element not found');
            }
        }
    }

    initializeRebuildButton(): void {
        if (!this.rebuildButton) {
            this.rebuildButton = this.assemblyWidgetContainer.querySelector('#linear-rebuild-button');
            if (this.rebuildButton) {
                this.rebuildButton.addEventListener('click', this.onRebuildClick.bind(this));
                console.log('Rebuild button initialized successfully');
            } else {
                console.error('Rebuild button element not found');
            }
        }
    }

    initializeSpineLabel(): void {
        if (!this.spineLabel) {
            this.spineLabel = this.assemblyWidgetContainer.querySelector('#linear-spine-label');
            if (!this.spineLabel) {
                console.error('Spine label element not found');
            }
        }
    }

    /**
     * The layout the current switch + selection state is asking for, or null
     * when there is nothing coherent to ask for.
     *
     * Deselecting while linear returns null rather than force: dropping
     * emphasis must not offer to throw the linearization away.
     */
    private desiredLayout(): { mode: 'linear' | 'force'; spineAssembly: string | null } | null {
        if (!this.linearEnabled) {
            return { mode: 'force', spineAssembly: null };
        }
        if (!this.selectedAssembly) {
            return null;
        }
        return { mode: 'linear', spineAssembly: GenomicService.looseKey(this.selectedAssembly.name) };
    }

    /**
     * Rebuild is available exactly when the layout on screen differs from the
     * one the controls describe. That comparison is the staleness indicator —
     * there is no separate invalidation state to keep in sync.
     */
    private canRebuild(): boolean {
        if (!this.datasetLayout.refetchable || this.rebuildInFlight) {
            return false;
        }
        const desired = this.desiredLayout();
        if (!desired) {
            return false;
        }
        return desired.mode !== this.datasetLayout.mode
            || desired.spineAssembly !== this.datasetLayout.spineAssembly;
    }

    updateRebuildState(): void {
        if (this.rebuildButton) {
            this.rebuildButton.disabled = !this.canRebuild();
        }
        if (this.linearSwitch) {
            // Dropped files and arbitrary URLs carry no request to reissue.
            this.linearSwitch.disabled = !this.datasetLayout.refetchable || this.rebuildInFlight;
        }
    }

    updateSpineLabel(): void {
        if (!this.spineLabel) {
            return;
        }

        const { spineAssembly } = this.datasetLayout;
        if (!spineAssembly) {
            this.spineLabel.textContent = 'Spine: —';
            return;
        }

        const resolved = this.genomicService.resolveAssemblyKey(spineAssembly) || spineAssembly;
        const [ assemblyName, haplotype ] = GenomicService.presentationAssemblyLabel(resolved);
        this.spineLabel.textContent = `Spine: ${ assemblyName } hap${ haplotype }`;
    }

    /**
     * Publish, do not fetch. main.js owns the network call, which keeps the
     * whole effect of this control visible in the composition root.
     */
    private requestRebuild(): void {
        const desired = this.desiredLayout();
        if (!desired) {
            return;
        }

        // The button is the only trigger and is disabled while pending, so at
        // most one rebuild is ever in flight — no sequence token needed.
        this.rebuildInFlight = true;
        this.updateRebuildState();

        eventBus.publish('layout:rebuild', desired);
    }

    onRebuildClick(): void {
        if (this.canRebuild()) {
            this.requestRebuild();
        }
    }

    onLinearSwitchChange(event: Event): void {
        this.linearEnabled = (event.target as HTMLInputElement).checked;
        console.log('Linear mode toggled:', this.linearEnabled);

        // Fire immediately when the toggle alone determines a new layout —
        // turning it on with an assembly selected, or turning it off while
        // linearized. Otherwise the switch looks inert and the user has to
        // discover the Rebuild button.
        if (this.canRebuild()) {
            this.requestRebuild();
        } else {
            this.updateRebuildState();
        }
    }

    onRebuildSettled(ok: boolean): void {
        this.rebuildInFlight = false;

        if (!ok) {
            // The fetch failed and the previous scene is still up. Put the
            // switch back in sync with the layout actually on screen.
            this.linearEnabled = this.datasetLayout.mode === 'linear';
            if (this.linearSwitch) {
                this.linearSwitch.checked = this.linearEnabled;
            }
        }

        this.updateRebuildState();
    }

    /**
     * Runs after populateList() has already cleared the selection, so the
     * spine assembly is re-selected here — otherwise a rebuild would erase the
     * selection that triggered it and the toggle would appear to reset itself.
     */
    onDatasetLoaded(dataset: DatasetModel): void {
        this.datasetLayout = dataset.layout;
        this.rebuildInFlight = false;

        this.linearEnabled = dataset.layout.mode === 'linear';
        if (this.linearSwitch) {
            this.linearSwitch.checked = this.linearEnabled;
        }

        if (dataset.layout.spineAssembly) {
            const fullKey = this.genomicService.resolveAssemblyKey(dataset.layout.spineAssembly);
            if (fullKey) {
                this.selectAssembly(fullKey);
            } else {
                console.warn(`spine assembly ${ dataset.layout.spineAssembly } is not present in this dataset`);
            }
        }

        this.updateSpineLabel();
        this.updateRebuildState();
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
        // A hide from this same load may still be pending; without this the
        // deferred display:none lands after the card has been reopened.
        if (this.hideTimeoutId !== null) {
            clearTimeout(this.hideTimeoutId);
            this.hideTimeoutId = null;
        }
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
            // Initialize linear-mode controls when card is shown
            this.initializeLinearSwitch();
            this.initializeRebuildButton();
            this.initializeSpineLabel();
            // Footer elements only exist now, so sync them to the loaded dataset
            this.updateSpineLabel();
            this.updateRebuildState();
        }, 0);
    }

    hideCard(): void {
        this.assemblyWidgetContainer.classList.remove('show');
        this.hideTimeoutId = setTimeout(() => {
            this.hideTimeoutId = null;
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
            this.clearSelection();
            const nodeSet = this.geometryManager.geometryFactory.getNodeNameSet()
            eventBus.publish('assembly:normal', { nodeSet })
            this.selectedAssembly = null;
        }
    }

    destroy(): void {
        this.draggable.destroy();
        for (const unsubscribe of this.unsubscribers) {
            unsubscribe();
        }
        this.unsubscribers = [];
        if (this.searchInput) {
            this.searchInput.removeEventListener('input', this.onSearchInput.bind(this));
        }
        if (this.switchInput) {
            this.switchInput.removeEventListener('change', this.onSwitchChange.bind(this));
        }
    }
}

export default AssemblyWidget;
