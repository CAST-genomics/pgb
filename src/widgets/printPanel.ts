type ExporterStatus = 'idle' | 'working' | 'done' | 'error'

interface ExporterEntry {
    id: string
    label: string
    run: () => Promise<void>
}

export class PrintPanel {
    private menu: HTMLUListElement
    private statusByEntry = new Map<string, HTMLElement>()

    constructor(menu: HTMLUListElement, entries: ExporterEntry[]) {
        this.menu = menu
        this.menu.innerHTML = ''
        for (const entry of entries) {
            this.menu.appendChild(this.buildRow(entry))
        }
    }

    private buildRow(entry: ExporterEntry): HTMLLIElement {
        const li = document.createElement('li')
        li.className = 'px-3 py-2'
        li.style.minWidth = '280px'

        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'btn btn-sm btn-outline-secondary w-100 text-start'
        button.textContent = entry.label
        button.dataset.entryId = entry.id

        const status = document.createElement('div')
        status.className = 'small text-muted mt-1'
        status.style.minHeight = '1em'
        status.dataset.entryStatus = entry.id

        this.statusByEntry.set(entry.id, status)

        button.addEventListener('click', async (event) => {
            event.preventDefault()
            event.stopPropagation()
            await this.runEntry(entry, button)
        })

        li.appendChild(button)
        li.appendChild(status)
        return li
    }

    private async runEntry(entry: ExporterEntry, button: HTMLButtonElement): Promise<void> {
        const status = this.statusByEntry.get(entry.id)!
        const previouslyDisabled = button.disabled
        button.disabled = true
        this.setStatus(status, 'working', 'Exporting…')
        try {
            await entry.run()
            this.setStatus(status, 'done', 'Saved.')
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            this.setStatus(status, 'error', `Error: ${message}`)
        } finally {
            button.disabled = previouslyDisabled
        }
    }

    private setStatus(el: HTMLElement, kind: ExporterStatus, text: string): void {
        el.textContent = text
        el.classList.remove('text-muted', 'text-success', 'text-danger')
        el.classList.add(
            kind === 'error' ? 'text-danger'
            : kind === 'done' ? 'text-success'
            : 'text-muted'
        )
    }
}

export function mountPrintPanel(entries: ExporterEntry[]): PrintPanel | null {
    const menu = document.getElementById('pgb-print-menu') as HTMLUListElement | null
    if (!menu) return null
    return new PrintPanel(menu, entries)
}
