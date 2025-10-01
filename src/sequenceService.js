import { app } from "./main.js"

class SequenceService {
    constructor(container, raycastService, genomicService) {

        this.container = container;
        this.raycastService = raycastService;
        this.genomicService = genomicService;

        this.createContextMenu(container);
        this.raycastService.registerClickHandler(this.raycastClickHandler.bind(this));

    }

    createContextMenu(container) {
        this.contextMenu = document.createElement('div');
        this.contextMenu.id = 'pgb-context-menu';
        this.contextMenu.style.display = 'none';
        this.contextMenu.style.position = 'absolute';
        this.contextMenu.style.zIndex = '9999';
        this.contextMenu.style.backgroundColor = 'white';
        this.contextMenu.style.border = '1px solid #ccc';
        this.contextMenu.style.borderRadius = '4px';
        this.contextMenu.style.padding = '4px 0';
        this.contextMenu.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
        this.contextMenu.style.pointerEvents = 'auto';
        this.contextMenu.innerHTML = `
            <ul style="list-style: none; padding: 0; margin: 0;">
                <li data-action="copy-info" style="padding: 8px 16px; cursor: pointer; pointer-events: auto;">Copy Assembly & Sequence</li>
                <li data-action="assemblies" style="padding: 8px 16px; cursor: pointer; pointer-events: auto;">Assemblies</li>
            </ul>
        `;
                container.appendChild(this.contextMenu);

        const listItems = this.contextMenu.querySelectorAll('li');
        for (const listItem of listItems) {

            listItem.addEventListener('mouseover', () => {
                app.disableTooltip()
                listItem.style.backgroundColor = '#f0f0f0'
            });
            listItem.addEventListener('mouseout', () => {
                app.enableTooltip()
                listItem.style.backgroundColor = 'white'
            });

            const action = listItem.getAttribute('data-action');
            listItem.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                e.preventDefault();
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

        const payload = this.genomicService.nodeMetadata.get(this.currentNodeName);
        if (!payload) {
            console.error(`No metadata found for ${this.currentNodeName}`);
            return;
        }

        const { sequence } = payload
        let textToCopy;

        if (action === 'copy-info') {
            textToCopy = `Sequence:\n${sequence}`;
        } else if (action === 'assemblies') {
            // Stub callback for assemblies action
            console.log('Assemblies action clicked for node:', this.currentNodeName);
            // TODO: Implement assemblies functionality
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
        app.enableTooltip();
    }

    raycastClickHandler(intersection, event) {

        if (event && event.type === 'contextmenu') {

            app.hideTooltip()
            app.disableTooltip()

            const { nodeName } = intersection
            this.currentNodeName = nodeName
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

export default SequenceService;
