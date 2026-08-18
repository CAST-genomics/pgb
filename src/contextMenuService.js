import { globals } from "./main.js"
import { applyTubeMapMenuItem, isMenuItemDisabled, showTubeMapPanel, tubeMapMenuState } from "./tubeMapMenuCommand.ts"

class ContextMenuService {
    constructor(container, raycastService, genomicService) {

        this.container = container;
        this.raycastService = raycastService;
        this.genomicService = genomicService;

        this.createContextMenu(container);
        this.raycastService.registerClickHandler(this.raycastClickHandler.bind(this));

    }

    createContextMenu(container) {
        this.contextMenu = document.createElement('div');
        container.appendChild(this.contextMenu);

        this.contextMenu.id = 'pgb-context-menu';

        this.contextMenu.style.display = 'none';

        this.contextMenu.style.position = 'absolute';

        this.contextMenu.style.zIndex = '9999';

        this.contextMenu.style.backgroundColor = 'white';

        this.contextMenu.style.borderWidth = 'thin';
        this.contextMenu.style.borderStyle = 'solid';
        this.contextMenu.style.borderColor = '#ccc';
        this.contextMenu.style.borderRadius = '4px';

        this.contextMenu.style.paddingTop = '4px';
        this.contextMenu.style.paddingBottom = '4px';
        this.contextMenu.style.paddingLeft = '0';
        this.contextMenu.style.paddingRight = '0';

        this.contextMenu.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';

        this.contextMenu.style.pointerEvents = 'auto';

        this.contextMenu.innerHTML = `
            <ul style="list-style: none; padding: 0; margin: 0; font-size: 12px;">
                <li data-action="copy-info" style="padding: 6px 12px; cursor: pointer; pointer-events: auto;">Copy Sequence</li>
                <li data-action="assemblies" style="padding: 6px 12px; cursor: pointer; pointer-events: auto;">Copy Assemblies, Haplotypes, Sequence IDs, and BP Ranges</li>
                <li data-action="sequence-tube-map" style="padding: 6px 12px; cursor: pointer; pointer-events: auto;">Sequence Tube Map</li>
            </ul>
        `;


        // Rewritten on every right-click by `applyTubeMapMenuItem`: whether the clicked
        // node has a tube map is a property of the node, not of the menu.
        this.tubeMapItem = this.contextMenu.querySelector('li[data-action="sequence-tube-map"]');

        const listItems = this.contextMenu.querySelectorAll('li');
        for (const listItem of listItems) {

            listItem.addEventListener('mouseover', () => {
                globals.app.disableTooltip()
                if (!isMenuItemDisabled(listItem)) {
                    listItem.style.backgroundColor = '#f0f0f0'
                }
            });
            listItem.addEventListener('mouseout', () => {
                globals.app.enableTooltip()
                listItem.style.backgroundColor = 'white'
            });

            const action = listItem.getAttribute('data-action');
            listItem.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                e.preventDefault();
                // A disabled item swallows the click rather than dismissing the menu: the
                // reason it carries is the answer to "why did nothing happen?", and
                // dismissing would take it away before it was read.
                if (isMenuItemDisabled(listItem)) {
                    return;
                }
                this.handleContextMenuAction(action);
            });
        }

        this.boundHideContextMenu = (event) => {
            // Don't dismiss if click is inside the context menu
            if (this.contextMenu && this.contextMenu.contains(event.target)) {
                return;
            }
            this.dismissContextMenu();
        };
        window.addEventListener('click', this.boundHideContextMenu);
    }

    handleContextMenuAction(action) {
        if (!this.currentNodeName) {
            console.warn(`No current Node Name. Bailing.`)
            return;
        }

        if (action === 'sequence-tube-map') {
            // The state written onto the item when the menu was presented, so that what
            // opens can never disagree with what the item said it would open.
            if (this.tubeMapState && this.tubeMapState.enabled) {
                showTubeMapPanel(this.tubeMapState.target);
            }
            this.dismissContextMenu();
            return;
        }

        const payload = this.genomicService.nodeMetadata.get(this.currentNodeName);
        if (!payload) {
            console.error(`No metadata found for ${this.currentNodeName}`);
            return;
        }

        
        let textToCopy;

        if (action === 'copy-info') {
            const { sequence } = payload
            textToCopy = `Sequence:\n${sequence}`;
        } else if (action === 'assemblies') {
            const assemblyHaplotypeSequenceIds = this.genomicService.getAssemblyListForNodeName(this.currentNodeName).join('\n');
            textToCopy = `${assemblyHaplotypeSequenceIds}`;
        }

        if (textToCopy) {
            navigator.clipboard.writeText(textToCopy).then(() => {
                console.log(`'${action}' copied to clipboard`);
            }).catch(err => {
                console.error('Failed to copy text: ', err);
            });
        }
        this.dismissContextMenu();
    }

    dismissContextMenu() {
        if (this.contextMenu) {
            this.contextMenu.style.display = 'none';
        }
        // Re-enable tooltip when context menu is dismissed
        globals.app.enableTooltip();
    }

    raycastClickHandler(intersection, event) {

        if (event && event.type === 'contextmenu') {

            globals.app.hideTooltip()
            globals.app.disableTooltip()

            const { nodeName } = intersection
            this.currentNodeName = nodeName
            this.tubeMapState = tubeMapMenuState(this.genomicService.getNode(nodeName));
            applyTubeMapMenuItem(this.tubeMapItem, this.tubeMapState);
            this.presentContextMenu(event);
        }
    }

    presentContextMenu(event) {

        event.preventDefault();

        const { clientX, clientY } = event;
        const { top, left } = this.container.getBoundingClientRect();

        this.contextMenu.style.top = `${clientY - top}px`;
        this.contextMenu.style.left = `${clientX - left}px`;
        this.contextMenu.style.display = 'block';

        return false;
    }

    dispose() {
        // Remove event listeners
        window.removeEventListener('click', this.boundHideContextMenu);

        // Remove context menu
        if (this.contextMenu) {
            this.contextMenu.remove();
        }

    }
}

export default ContextMenuService;
