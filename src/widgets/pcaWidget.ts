import { Draggable } from '../utils/draggable.js';
import eventBus from '../utils/eventBus.ts';
import { pclaiCoordinateService, PCLACoordinateService } from "./pclaiCoordinateService.js"
import { acquireAbsence, releaseAbsence } from './pcaAbsenceCoordinator.js'

const ABSENCE_PRESENTER_ID = 'pcaWidget'

class PCAWidget {

    static NODE_DEEMPHASIS_COLOR = '#aaaaaa';

    pcaWidgetContainer: HTMLElement
    draggable: any
    geometryManager: any
    listGroup: HTMLElement
    searchInput: HTMLInputElement | null
    selectedCoordinateKey: string | null
    allListItems: Map<string, HTMLElement>

    constructor(pcaWidgetContainer: HTMLElement, geometryManager: any) {

        this.pcaWidgetContainer = pcaWidgetContainer;
        this.draggable = new Draggable(this.pcaWidgetContainer);
        this.geometryManager = geometryManager

        this.listGroup = this.pcaWidgetContainer.querySelector('.list-group')!;

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

            // Deselect current assembly selector — return to absence-only state
            this.selectedCoordinateKey = null;
            this.clearAllSelectorStyles()

            const absentNodeSet = pclaiCoordinateService.getAbsentNodeSet()
            eventBus.publish('pcaWidget:absence', { absentNodeSet })
            eventBus.publish('pcaWidget:deselect', {})
        } else {
            // Deselect previous assembly selector if one exists
            if (this.selectedCoordinateKey !== null) {
                this.clearAllSelectorStyles()

                const absentNodeSet = pclaiCoordinateService.getAbsentNodeSet()
                eventBus.publish('pcaWidget:absence', { absentNodeSet })
            }

            console.log(`selected coordinate key ${ coordinateKey }`)

            // Select new genome and store its name and color
            this.selectedCoordinateKey = coordinateKey

            ;(event.target as HTMLElement).classList.add('pca-widget__genome-selector--selected')

            this.emphasizeAssembly(this.selectedCoordinateKey);
        }
    }

    clearAllSelectorStyles(): void {
        const selectors = Array.from(this.listGroup.querySelectorAll('.assembly-widget__genome-selector'))
        for (const selector of selectors) {
            selector.classList.remove('pca-widget__genome-selector--selected')
        }
    }

    emphasizeAssembly(coordinateKey: string): void {
        const nodeSet = new Set(pclaiCoordinateService.getNodeIdsWithCoordinateKey(coordinateKey))
        const absentNodeSet = pclaiCoordinateService.getAbsentNodeSet()
        eventBus.publish('pcaWidget:emphasis', { assembly: { name: coordinateKey }, nodeSet, absentNodeSet, deemphasisColor: PCAWidget.NODE_DEEMPHASIS_COLOR });
    }

    initializeSearchInput(): void {
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
        this.pcaWidgetContainer.style.display = '';
        this.pcaWidgetContainer.style.top = '0px'
        this.pcaWidgetContainer.style.left = '0px'

        acquireAbsence(ABSENCE_PRESENTER_ID)

        setTimeout(() => {
            this.pcaWidgetContainer.classList.add('show');
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
                selectedSelector.classList.add('pca-widget__genome-selector--selected');
            }
        }
    }

    hideCard(): void {
        this.pcaWidgetContainer.classList.remove('show');
        releaseAbsence(ABSENCE_PRESENTER_ID)
        setTimeout(() => {
            this.pcaWidgetContainer.style.display = 'none';
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

        // Mimic the deselect path so the graph leaves emphasis state cleanly:
        // (emphasized + absent + deemphasized-remainder) collapses to
        // (absent + normal-remainder). Restoring only the previously-emphasized
        // nodeSet here was insufficient — it left the deemphasized remainder
        // painted, since the remainder is implicitly recolored by the next
        // setNodeEmphasis() call, not by an enumerated node list.
        // The subsequent releaseAbsence (in hideCard) then restores absent
        // → normal if no other presenter is still holding absence.
        if (wasSelected) {
            const absentNodeSet = pclaiCoordinateService.getAbsentNodeSet()
            eventBus.publish('pcaWidget:absence', { absentNodeSet })
            eventBus.publish('pcaWidget:deselect', {})
        }
    }

    destroy(): void {
        this.draggable.destroy();
        if (this.searchInput) {
            this.searchInput.removeEventListener('input', this.onSearchInput.bind(this));
        }
    }
}

export default PCAWidget;
