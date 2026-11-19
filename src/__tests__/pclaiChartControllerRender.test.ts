import { describe, it, expect, vi, beforeEach } from 'vitest'

// Node → coordinate key → placement. HG01167#1 is placed on n1 only;
// n2 carries a different haplotype, n3 carries nothing.
const placements = new Map<string, Map<string, { coordinates: number[] }>>([
    ['n1', new Map([['HG01167#1', { coordinates: [1, 1] }], ['HG00408#1', { coordinates: [2, 2] }]])],
    ['n2', new Map([['HG00408#1', { coordinates: [3, 3] }]])],
])

vi.mock('../widgets/pclaiCoordinateService.js', () => ({
    pclaiCoordinateService: {
        getCoordinatesForNode: (id: string) => (placements.has(id) ? new Map(placements.get(id)) : null),
        getCoordinatesForCoordinateKey: (key: string) => {
            const out = new Map()
            for (const [node, keys] of placements) if (keys.has(key)) out.set(node, keys.get(key))
            return out
        },
    },
}))

const { PclaiChartController } = await import('../widgets/pclaiChartController.js')

function setup() {
    const delegate = {
        isVisible: () => true,
        isInitialized: () => true,
        clearChart: vi.fn(),
        renderCoordinateMap: vi.fn(),
        restoreReferenceDots: vi.fn(),
    }
    const controller = new PclaiChartController(delegate)
    controller.selectedCoordinateKey = 'HG01167#1'
    return { controller, delegate }
}

describe('PclaiChartController.render with a coordinate key selected', () => {
    let ctx: ReturnType<typeof setup>
    beforeEach(() => { ctx = setup() })

    it('narrows to the single (node, key) dot when the haplotype is placed on the hovered node', () => {
        ctx.controller.hoveredNodeId = 'n1'
        ctx.controller.render()
        const map = ctx.delegate.renderCoordinateMap.mock.calls[0][0] as Map<string, unknown>
        expect([...map.keys()]).toEqual(['HG01167#1'])
        expect(ctx.delegate.clearChart).not.toHaveBeenCalled()
    })

    // Issue #183: hovering an absent or de-emphasized node changes nothing.
    it.each([
        ['a node the haplotype is not placed on', 'n2'],
        ['a node with no placements at all', 'n3'],
    ])('keeps the selection view when hovering %s', (_label, node) => {
        ctx.controller.hoveredNodeId = null
        ctx.controller.render()
        const selectionView = ctx.delegate.renderCoordinateMap.mock.calls[0][0]

        ctx.controller.hoveredNodeId = node
        ctx.controller.render()
        expect(ctx.delegate.clearChart).not.toHaveBeenCalled()
        expect(ctx.delegate.renderCoordinateMap.mock.calls[1][0]).toEqual(selectionView)
    })
})
