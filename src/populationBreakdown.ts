import { Draggable } from './utils/draggable.js'

/**
 * One row of a population breakdown: a population, how many of the node's
 * assemblies come from it, and that as a display-ready frequency.
 */
export interface PopulationBreakdownRow {
    acronym: string
    name: string
    count: number
    frequency: string
}

export interface PopulationBreakdownOptions {
    /** Where the panel opens until the user drags it somewhere else, in viewport px.
     *  Called with the panel already displayed, so it can measure the panel. */
    defaultPosition: (panel: HTMLElement) => { left: number; top: number }
    /** Called when the user closes the panel with its close button. */
    onClose?: () => void
    /** Element the panel is appended to. Default `document.body`: outside the 3D
     *  container, so pointer events on the panel never reach the raycaster. */
    parent?: HTMLElement
}

/**
 * The population breakdown (CONTEXT.md; #174): a self-standing, draggable table of
 * one node's count and frequency in every population.
 *
 * This is HeatmapLook's panel and holds no opinions of its own about *which* node it
 * describes or when it opens — HeatmapLook decides that. The panel only draws what it
 * is given and keeps its place on screen: it opens at `defaultPosition` until the user
 * drags it, then reopens where they left it for the life of the page.
 */
export class PopulationBreakdown {

    static VIEWPORT_MARGIN_PX = 16
    static MIN_HEIGHT_PX = 120

    readonly element: HTMLElement
    private readonly header: HTMLElement
    private readonly title: HTMLElement
    private readonly body: HTMLElement
    private readonly draggable: Draggable
    private readonly options: PopulationBreakdownOptions

    private shownNodeName: string | null = null
    private rows: PopulationBreakdownRow[] = []
    private selectedAcronym: string | null = null
    private hasBeenDragged = false

    constructor(options: PopulationBreakdownOptions) {
        this.options = options

        this.element = document.createElement('div')
        this.element.className = 'population-breakdown'
        this.element.style.display = 'none'

        this.header = document.createElement('div')
        this.header.className = 'population-breakdown__header'

        this.title = document.createElement('span')
        this.title.className = 'population-breakdown__title'

        const close = document.createElement('button')
        close.type = 'button'
        close.className = 'population-breakdown__close btn-close'
        close.setAttribute('aria-label', 'Close population breakdown')
        // Keep a press on the button from reaching Draggable, which listens on the
        // panel and would otherwise treat it as a grab of the header.
        close.addEventListener('mousedown', event => event.stopPropagation())
        close.addEventListener('click', () => {
            this.close()
            this.options.onClose?.()
        })

        this.header.append(this.title, close)

        this.body = document.createElement('div')
        this.body.className = 'population-breakdown__body'

        this.element.append(this.header, this.body)
        ;(options.parent ?? document.body).appendChild(this.element)

        this.header.addEventListener('mousedown', () => { this.hasBeenDragged = true })
        this.draggable = new Draggable(this.element, { handle: this.header })

        this.onWindowChange = this.onWindowChange.bind(this)
        document.addEventListener('mouseup', this.onWindowChange)
        window.addEventListener('resize', this.onWindowChange)
    }

    /** After a drag or a window resize, re-fit the height to where the panel now sits. */
    private onWindowChange(): void {
        this.fitToViewport()
    }

    get isOpen(): boolean {
        return this.shownNodeName !== null
    }

    /** The node the panel describes, or null when closed. */
    get nodeName(): string | null {
        return this.shownNodeName
    }

    /** Describe `nodeName`, replacing whatever the panel showed before. */
    show(nodeName: string, rows: PopulationBreakdownRow[], selectedAcronym: string | null): void {
        const wasOpen = this.isOpen

        this.shownNodeName = nodeName
        this.rows = rows
        this.selectedAcronym = selectedAcronym

        this.title.textContent = `Node ${nodeName}`
        this.renderRows()

        if (!wasOpen) {
            this.element.style.display = ''
            if (!this.hasBeenDragged) {
                const { left, top } = this.options.defaultPosition(this.element)
                this.element.style.left = `${left}px`
                this.element.style.top = `${top}px`
            }
        }
        this.fitToViewport()
    }

    /**
     * Cap the panel's height to the space left below its top edge, so on a short
     * viewport the rows scroll (the header is outside the scroller and stays put).
     */
    fitToViewport(): void {
        if (!this.isOpen) return
        const top = parseFloat(this.element.style.top) || 0
        const room = window.innerHeight - top - PopulationBreakdown.VIEWPORT_MARGIN_PX
        this.element.style.maxHeight = `${Math.max(room, PopulationBreakdown.MIN_HEIGHT_PX)}px`
    }

    /** Move the bold row to `acronym`; null bolds none (e.g. a superpopulation is selected). */
    setSelectedPopulation(acronym: string | null): void {
        this.selectedAcronym = acronym
        if (this.isOpen) this.renderRows()
    }

    close(): void {
        this.shownNodeName = null
        this.rows = []
        this.body.replaceChildren()
        this.element.style.display = 'none'
    }

    destroy(): void {
        document.removeEventListener('mouseup', this.onWindowChange)
        window.removeEventListener('resize', this.onWindowChange)
        this.draggable.destroy()
        this.element.remove()
    }

    private renderRows(): void {
        const rowElements = this.rows.map(({ acronym, name, count, frequency }) => {
            const row = document.createElement('div')
            row.className = 'population-breakdown__row'
            if (acronym === this.selectedAcronym) {
                row.classList.add('population-breakdown__row--selected')
            }

            const cells: Array<[string, string]> = [
                ['population-breakdown__name', name],
                ['population-breakdown__count', String(count)],
                ['population-breakdown__frequency', frequency],
            ]
            for (const [className, text] of cells) {
                const cell = document.createElement('span')
                cell.className = className
                cell.textContent = text
                row.appendChild(cell)
            }
            return row
        })
        this.body.replaceChildren(...rowElements)
    }
}
