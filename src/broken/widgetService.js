import { app } from "../main.js"

class WidgetService {

    constructor(containerElement, assemblyWidget) {

        this.containerElement = containerElement;

        this.assemblyWidget = assemblyWidget;
        this.assemblyWidget.widgetService = this

        this.assemblyButton = null;
        this.metadataButton = null;
        this.activeButton = null;

        this.createButtons();
    }

    createButtons() {
        // Create the round-rect container
        const buttonContainer = document.createElement('div');
        this.containerElement.innerHTML = '';
        this.containerElement.appendChild(buttonContainer);
        buttonContainer.className = 'widget-service__button-container';

        this.assemblyButton = document.createElement('button');
        buttonContainer.appendChild(this.assemblyButton);

        this.assemblyButton.className = 'widget-service__button widget-service__button--assembly';
        this.assemblyButton.textContent = 'Assembly';
        this.assemblyButton.addEventListener('click', this.onAssemblyButtonClick.bind(this));

        this.metadataButton = document.createElement('button');
        buttonContainer.appendChild(this.metadataButton);

        this.metadataButton.className = 'widget-service__button widget-service__button--metadata';
        this.metadataButton.textContent = 'Metadata';
        this.metadataButton.addEventListener('click', this.onMetadataButtonClick.bind(this));

    }

    reset(){

        if (this.activeButton) {
            this.activeButton.classList.remove('widget-service__button--active');
            this.activeButton = null
        }

        this.assemblyWidget.hideCard()
        this.assemblyWidget.configure()
    }

    onAssemblyButtonClick(event) {

        event.stopPropagation();

        this.setActiveButton(this.assemblyButton);

        if (this.assemblyWidget.assemblyWidgetContainer.classList.contains('show')) {

            this.assemblyWidget.hideCard();

            this.activeButton.classList.remove('widget-service__button--active');
            this.activeButton = null
        } else {
            this.assemblyWidget.showCard();
        }

    }

    onMetadataButtonClick(event) {

        event.stopPropagation()

        this.assemblyWidget.hideCard()
        app.setActiveScene('heatmapScene', true)

        this.setActiveButton(this.metadataButton);

    }

    setActiveButton(button) {

        if (this.activeButton) {
            this.activeButton.classList.remove('widget-service__button--active');
        }

        this.activeButton = button;
        button.classList.add('widget-service__button--active')

    }

    setWidgetInactive(buttonType, doPublish = true) {

        switch (buttonType.toLowerCase()) {
            case 'assembly':
                this.assemblyWidget.setInactive(doPublish)
                break;
            case 'metadata':
                this.metadataWidget.setInactive(doPublish)
                break;
            case 'none':
                this.assemblyWidget.setInactive(doPublish)
                this.metadataWidget.setInactive(doPublish)
                break;
            default:
                console.warn(`Unknown button type: ${buttonType}. Valid types are 'assembly', 'metadata', or 'none'`);
                return;
        }

    }

    destroy() {
        if (this.assemblyButton) {
            this.assemblyButton.removeEventListener('click', this.onAssemblyButtonClick.bind(this));
        }
        if (this.metadataButton) {
            this.metadataButton.removeEventListener('click', this.onMetadataButtonClick.bind(this));
        }
        this.activeButton = null;
    }
}

export default WidgetService;
