// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from 'vitest'
import AssemblyWidget from '../widgets/assemblyWidget.ts'
import { parseDataset } from '../datasetParser.ts'

/**
 * Recognition of a linearized dataset has to survive all the way to the UI:
 * parser reads the `spine` block, the widget turns that into a checked switch,
 * a labelled spine, and a re-selected assembly row.
 *
 * This is the drop-a-file / paste-a-link path — parseDataset is called with no
 * request snapshot, exactly as `app.processData(json)` does at app.ts:538.
 *
 * The payload is built here rather than loaded from disk: there is no captured
 * linearized response in the repo, and a hand-written file on disk would be no
 * more real than a hand-written object. It only needs a `spine` block and one
 * assembly the widget can resolve.
 */

const SPINE_SEQUENCE_ID = 'CM089203.1'
const SPINE_KEY = `HG00097#1#${ SPINE_SEQUENCE_ID }`

function makeV3(spine?: object) {
    const json: Record<string, any> = {
        queried_locus: 'GRCh38#0#chr1:100-200',
        actual_locus: 'GRCh38#0#chr1:90-210',
        assembly: {
            'GRCh38:0': { sequence_id: 'chr1', region: 'chr1:90-210' },
        },
        node: {
            '10+': {
                name: '10+',
                length: 120,
                assembly: [
                    {
                        assembly_name: 'HG00097',
                        haplotype: '1',
                        metadata: [
                            {
                                sequence_id: SPINE_SEQUENCE_ID,
                                path_strand: '+',
                                node_strand: '>',
                                start: 25000872,
                                end: 25036770,
                                take: 'yes',
                                pclai_hg38: {
                                    pclai_coord_system: 'assembly',
                                    coordinates: [ -1.7, 0.2 ],
                                    RGB: [ 0, 232, 179 ],
                                    confidence_score: '998',
                                },
                                pclai_asm: {
                                    pclai_coord_system: 'GRCh38',
                                    coordinates: [ -2.1, 0.5 ],
                                    RGB: [ 10, 20, 30 ],
                                    confidence_score: '998',
                                },
                            },
                        ],
                    },
                ],
                duplicated_assembly: [],
                ogdf_coordinates: [ { x: 0, y: 0 } ],
                assembly_metadata: { count: { total: 1 }, frequency: { total: 1 } },
                default_range: 'GRCh38#0#chr1:90-210',
            },
        },
        edge: [ { starting_node: '10+', ending_node: '10+' } ],
        sequence: { '10+': 'ATCG' },
    }

    if (spine) {
        json.spine = spine
    }

    return json
}

/**
 * Only the surface the widget touches on this path: the assembly list it
 * populates from, and the loose-key resolution `onDatasetLoaded` needs to turn
 * 'HG00097#1' back into a full triple key.
 */
function makeGenomicServiceStub() {
    const assemblySet = new Set([ SPINE_KEY, 'HG00099#2#CM089999.1' ])
    return {
        assemblySet,
        resolveAssemblyKey(loose: string) {
            if (assemblySet.has(loose)) return loose
            const prefix = `${ loose }#`
            for (const key of assemblySet) {
                if (key.startsWith(prefix)) return key
            }
            return undefined
        },
        assemblyWalkMap: new Map([
            [ SPINE_KEY, { assemblySubgraph: { nodes: [ '10+' ] } } ],
        ]),
    }
}

const geometryManagerStub = {
    geometryFactory: { getNodeNameSet: () => new Set([ '10+' ]) },
}

function mountWidget() {
    document.body.innerHTML = `
        <div id="assembly-widget">
            <div class="list-group"></div>
            <input type="checkbox" id="linear-mode-switch">
            <button type="button" id="linear-rebuild-button" disabled>Rebuild</button>
            <div id="linear-spine-label">Spine: —</div>
        </div>`

    const container = document.getElementById('assembly-widget')!
    const widget = new AssemblyWidget(container, makeGenomicServiceStub(), geometryManagerStub)

    // What showCard() does, minus the timers: populate, then bind the footer.
    widget.populateList()
    widget.initializeLinearSwitch()
    widget.initializeRebuildButton()
    widget.initializeSpineLabel()

    return {
        widget,
        linearSwitch: document.getElementById('linear-mode-switch') as HTMLInputElement,
        spineLabel: document.getElementById('linear-spine-label')!,
    }
}

describe('linearized dataset recognition reaches the widget', () => {

    let mounted: ReturnType<typeof mountWidget>

    beforeEach(() => {
        mounted = mountWidget()
    })

    it('turns the linear switch on and labels the spine', () => {
        const dataset = parseDataset(makeV3({ assembly: 'HG00097', haplotype: '1' }))

        mounted.widget.onDatasetLoaded(dataset)

        expect(mounted.linearSwitch.checked).toBe(true)
        expect(mounted.spineLabel.textContent).toBe('Spine: HG00097 hap1')
    })

    it('re-selects the spine assembly after populateList cleared the selection', () => {
        const dataset = parseDataset(makeV3({ assembly: 'HG00097', haplotype: '1' }))

        mounted.widget.onDatasetLoaded(dataset)

        expect(mounted.widget.selectedAssembly?.name).toBe(SPINE_KEY)
        const selected = document.querySelectorAll('.assembly-widget__genome-selector--selected')
        expect(selected.length).toBe(1)
        expect((selected[0] as HTMLElement).dataset.assembly).toBe(SPINE_KEY)
    })

    it('disables the switch, because a dropped file has no request to reissue', () => {
        // Pinned deliberately: the switch reads as live but cannot act. If that
        // UX is changed, this assertion should be changed with it, not silently.
        const dataset = parseDataset(makeV3({ assembly: 'HG00097', haplotype: '1' }))

        mounted.widget.onDatasetLoaded(dataset)

        expect(dataset.layout.refetchable).toBe(false)
        expect(mounted.linearSwitch.disabled).toBe(true)
    })

    it('leaves a force dataset unlinearized and unlabelled', () => {
        const dataset = parseDataset(makeV3())

        mounted.widget.onDatasetLoaded(dataset)

        expect(mounted.linearSwitch.checked).toBe(false)
        expect(mounted.spineLabel.textContent).toBe('Spine: —')
        expect(mounted.widget.selectedAssembly).toBeNull()
    })
})
