
class WidgetService {

    constructor(containerElement, assemblyWidget, metadataWidget) {

        this.containerElement = containerElement;

        this.assemblyWidget = assemblyWidget;
        this.assemblyWidget.widgetService = this

        this.metadataWidget = metadataWidget;
        this.metadataWidget.widgetService = this

        this.assemblyButton = null;
        this.metadataButton = null;
        this.activeButton = null;

        this.createButtons();
    }

    createButtons() {
        // Create the round-rect container
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'widget-service__button-container';

        // Create Assembly button
        this.assemblyButton = document.createElement('button');
        this.assemblyButton.className = 'widget-service__button widget-service__button--assembly';
        this.assemblyButton.textContent = 'Assembly';
        this.assemblyButton.addEventListener('click', this.onAssemblyButtonClick.bind(this));

        // Create Metadata button
        this.metadataButton = document.createElement('button');
        this.metadataButton.className = 'widget-service__button widget-service__button--metadata';
        this.metadataButton.textContent = 'Metadata';
        this.metadataButton.addEventListener('click', this.onMetadataButtonClick.bind(this));

        // Append buttons to container
        buttonContainer.appendChild(this.assemblyButton);
        buttonContainer.appendChild(this.metadataButton);

        // Replace the existing gear button container
        this.containerElement.innerHTML = '';
        this.containerElement.appendChild(buttonContainer);
    }

    reset(){

        if (this.activeButton) {
            this.activeButton.classList.remove('widget-service__button--active');
            this.activeButton = null
        }

        this.metadataWidget.setInactive(false)
        this.metadataWidget.hideCard()

        this.assemblyWidget.hideCard()
        this.assemblyWidget.setInactive(false)
        this.assemblyWidget.configure()
    }

    onAssemblyButtonClick(event) {

        event.stopPropagation();

        this.setActiveButton(this.assemblyButton);

        this.metadataWidget.hideCard()

        if (this.assemblyWidget.assemblyWidgetContainer.classList.contains('show')) {
            this.assemblyWidget.hideCard();

            if (false === this.assemblyWidget.isActive()) {
                this.activeButton.classList.remove('widget-service__button--active');
                this.activeButton = null
            }
        } else {
            this.assemblyWidget.showCard();
        }

    }

    onMetadataButtonClick(event) {

        event.stopPropagation()

        this.setActiveButton(this.metadataButton);

        this.assemblyWidget.hideCard()

        if (this.metadataWidget.metadataWidgetContainer.classList.contains('show')) {
            this.metadataWidget.hideCard();

            if (false === this.metadataWidget.isActive()) {
                this.activeButton.classList.remove('widget-service__button--active');
                this.activeButton = null
            }

        } else {
            this.metadataWidget.showCard();
        }

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
