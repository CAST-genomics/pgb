import eventBus from "./utils/eventBus.ts"
import type { DatasetModel } from "./datasetModel.ts"

/**
 * Locus display (#175): one inert line, painted over the top of the 3D view, naming the
 * **queried locus** and the **actual locus** of the loaded dataset (vocabulary: CONTEXT.md
 * §locus). Display only — it takes no pointer events and cannot be selected; graph data may
 * cross it and the user pans the data aside.
 *
 * Set on `datasetLoaded`; cleared by the app at the start of every load, so it never names a
 * locus the graph on screen does not have.
 */

export interface LocusDisplayItem {
    label: string
    value: string
}

/** `chr8:78675042-78805463` → `chr8:78,675,042-78,805,463`. Unparseable strings pass through. */
export function formatLocusString(locus: string): string {
    const match = locus.trim().match(/^([^:]+):([\d,]+)-([\d,]+)$/)
    if (!match) return locus
    const fmt = (s: string) => Number(s.replace(/,/g, '')).toLocaleString('en-US')
    return `${match[1]}:${fmt(match[2])}-${fmt(match[3])}`
}

/**
 * Both loci when they differ; a single `Locus` when they are identical; whichever one exists,
 * under its own label, when the dataset carries only one; nothing when it carries neither.
 */
export function locusDisplayItems(locus: { queriedLocus: string | null; actualLocus: string | null }): LocusDisplayItem[] {
    const queried = locus.queriedLocus ? formatLocusString(locus.queriedLocus) : null
    const actual  = locus.actualLocus  ? formatLocusString(locus.actualLocus)  : null

    if (queried && actual) {
        return queried === actual
            ? [{ label: 'Locus', value: queried }]
            : [{ label: 'Queried Locus', value: queried }, { label: 'Actual Locus', value: actual }]
    }
    if (queried) return [{ label: 'Queried Locus', value: queried }]
    if (actual)  return [{ label: 'Actual Locus',  value: actual }]
    return []
}

export interface LocusDisplayHandle {
    clear(): void
    dispose(): void
}

export function mountLocusDisplay(container: HTMLElement): LocusDisplayHandle {

    const element = document.createElement('div')
    element.className = 'pgb-locus-display'
    container.appendChild(element)

    const render = (dataset: DatasetModel) => {
        element.replaceChildren()
        for (const { label, value } of locusDisplayItems(dataset.locus)) {
            const item = document.createElement('span')
            item.className = 'pgb-locus-display__item'

            const labelEl = document.createElement('span')
            labelEl.textContent = label

            const valueEl = document.createElement('span')
            valueEl.className = 'pgb-locus-display__value'
            valueEl.textContent = value

            item.append(labelEl, valueEl)
            element.appendChild(item)
        }
    }

    const unsubscribe = eventBus.subscribe('datasetLoaded', ({ dataset }) => render(dataset))

    return {
        clear() { element.replaceChildren() },
        dispose() {
            unsubscribe()
            element.remove()
        }
    }
}
