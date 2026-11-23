// @vitest-environment jsdom
/**
 * HeatmapLook decides what a node click means on the population page (#174): it opens
 * the population breakdown for that node, keeps one open at a time, marks the node it
 * describes, and closes it when the Look stops being the one on screen or the graph is
 * rebuilt. Hover keeps the ordinary node tooltip (Node, Length), without the State row
 * that always reads "normal" here.
 *
 * Driven the way the app drives it: clicks arrive through the RaycastService click hook
 * (left-click is a `pointerup` with button 0; right-click also arrives as a `pointerup`
 * with button 2 and as a `contextmenu`), selections and rebuilds arrive on the event bus.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as THREE from 'three'
import HeatmapLook from '../looks/heatmapLook.ts'
import { assemblyMetadataService } from '../assemblyMetadataService.ts'
import eventBus from '../utils/eventBus.ts'

type ClickHandler = (intersection: any, event: any) => void

class FakeRaycastService {
    handlers = new Set<ClickHandler>()
    registerClickHandler(handler: ClickHandler) {
        this.handlers.add(handler)
        return () => this.handlers.delete(handler)
    }
    click(intersection: any, event: any) {
        for (const handler of [...this.handlers]) handler(intersection, event)
    }
}

const NODES = ['5519+', '42-']

const leftClick = { type: 'pointerup', button: 0 }
const rightClickUp = { type: 'pointerup', button: 2 }
const contextMenu = { type: 'contextmenu', button: 2 }

let raycast: FakeRaycastService
let scene: THREE.Scene
let look: HeatmapLook
let nodeMeshes: Map<string, THREE.Mesh>

function nodeHit(nodeName: string) {
    const object = nodeMeshes.get(nodeName)!
    return { object, nodeName, t: 0.5, point: new THREE.Vector3() }
}

function edgeHit() {
    return { object: { userData: { type: 'edge' } }, point: new THREE.Vector3() }
}

const breakdown = () => document.querySelector('.population-breakdown') as HTMLElement | null
const isOpen = () => breakdown() !== null && breakdown()!.style.display !== 'none'
const headerText = () => breakdown()!.querySelector('.population-breakdown__header')!.textContent
const boldRows = () =>
    [...breakdown()!.querySelectorAll('.population-breakdown__row--selected .population-breakdown__name')]
        .map(cell => cell.textContent)
const markCount = () => scene.children.filter(child => child.name === HeatmapLook.BREAKDOWN_MARK_NAME).length

beforeEach(() => {
    assemblyMetadataService.loadMetadata({
        index: { assemblyTotals: { totalAssemblies: 10 } },
        nodes: new Map(NODES.map(name => [name, {
            assemblyMetadata: {
                count: { population: { YRI: 4, CHS: 1, 'N/A': 0 } },
                frequency: { population: { YRI: 0.4, CHS: 0.1, 'N/A': 0 } },
            },
        }])),
    })

    raycast = new FakeRaycastService()

    scene = new THREE.Scene()
    const group = new THREE.Group()
    group.name = 'NodeMeshGroup'
    nodeMeshes = new Map()
    for (const nodeName of NODES) {
        const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial())
        mesh.userData = { nodeName, type: 'node' }
        group.add(mesh)
        nodeMeshes.set(nodeName, mesh)
    }
    scene.add(group)

    const genomicService = {
        nodeMetadata: new Map(NODES.map(name => [name, {
            length: 1234,
            frequency: { population: { YRI: 0.4, CHS: 0.1 }, superpopulation: { AFR: 0.4 } },
        }])),
    }
    look = new HeatmapLook('heatmapLook', { genomicService, raycastService: raycast })
    look.activate(scene)
})

afterEach(() => {
    look.dispose()
    document.body.innerHTML = ''
})

describe('HeatmapLook — population breakdown', () => {

    it('left-click on a node opens the breakdown naming that node', () => {
        expect(isOpen()).toBe(false)

        raycast.click(nodeHit('5519+'), leftClick)

        expect(isOpen()).toBe(true)
        expect(headerText()).toContain('Node 5519+')
    })

    it('lists each population, leaving out N/A', () => {
        raycast.click(nodeHit('5519+'), leftClick)
        const names = [...breakdown()!.querySelectorAll('.population-breakdown__name')].map(cell => cell.textContent)
        expect(names).toHaveLength(2)
        expect(names.join(' ')).not.toContain('N/A')
    })

    it('clicking another node switches the breakdown to it; only one is ever open', () => {
        raycast.click(nodeHit('5519+'), leftClick)
        raycast.click(nodeHit('42-'), leftClick)

        expect(document.querySelectorAll('.population-breakdown')).toHaveLength(1)
        expect(headerText()).toContain('Node 42-')
        expect(markCount()).toBe(1)
    })

    it('clicking the node already shown changes nothing', () => {
        raycast.click(nodeHit('5519+'), leftClick)
        const before = breakdown()!.innerHTML

        raycast.click(nodeHit('5519+'), leftClick)

        expect(isOpen()).toBe(true)
        expect(breakdown()!.innerHTML).toBe(before)
    })

    it('right-click neither opens nor changes it', () => {
        raycast.click(nodeHit('5519+'), rightClickUp)
        raycast.click(nodeHit('5519+'), contextMenu)
        expect(isOpen()).toBe(false)

        raycast.click(nodeHit('5519+'), leftClick)
        raycast.click(nodeHit('42-'), rightClickUp)
        raycast.click(nodeHit('42-'), contextMenu)
        expect(headerText()).toContain('Node 5519+')
    })

    it('background and edge clicks leave it open', () => {
        raycast.click(nodeHit('5519+'), leftClick)

        raycast.click(null, leftClick)
        raycast.click(edgeHit(), leftClick)

        expect(isOpen()).toBe(true)
        expect(headerText()).toContain('Node 5519+')
    })

    it('marks the described node while open, and drops the mark on close', () => {
        expect(markCount()).toBe(0)
        raycast.click(nodeHit('5519+'), leftClick)
        expect(markCount()).toBe(1)

        ;(breakdown()!.querySelector('.population-breakdown__close') as HTMLElement).click()

        expect(isOpen()).toBe(false)
        expect(markCount()).toBe(0)
    })

    it('the selected population is bold and follows the selection live', () => {
        eventBus.publish('population:selected', { acronym: 'CHS' })
        raycast.click(nodeHit('5519+'), leftClick)
        expect(boldRows()).toHaveLength(1)
        const chs = boldRows()[0]

        eventBus.publish('population:selected', { acronym: 'YRI' })
        expect(boldRows()).toHaveLength(1)
        expect(boldRows()[0]).not.toBe(chs)

        eventBus.publish('superpopulation:selected', { acronym: 'AFR' })
        expect(boldRows()).toEqual([])
    })

    it('opens whether or not a population is selected, and deselecting clears the bold row', () => {
        raycast.click(nodeHit('5519+'), leftClick)
        expect(isOpen()).toBe(true)
        expect(boldRows()).toEqual([])

        eventBus.publish('population:selected', { acronym: 'CHS' })
        expect(boldRows()).toHaveLength(1)

        eventBus.publish('population:deselected', { population: {}, acronym: 'CHS' })
        expect(isOpen()).toBe(true)
        expect(boldRows()).toEqual([])
    })

    it('closes, mark and all, when the Look deactivates (leaving the Population widget)', () => {
        raycast.click(nodeHit('5519+'), leftClick)

        look.deactivate()

        expect(isOpen()).toBe(false)
        expect(markCount()).toBe(0)
        raycast.click(nodeHit('42-'), leftClick)
        expect(isOpen()).toBe(false)
    })

    it('closes on a graph rebuild', () => {
        raycast.click(nodeHit('5519+'), leftClick)

        eventBus.publish('graph:clearing', {} as Record<string, never>)

        expect(isOpen()).toBe(false)
        expect(markCount()).toBe(0)
    })

    it('reopens on the next click after it was closed', () => {
        raycast.click(nodeHit('5519+'), leftClick)
        eventBus.publish('graph:clearing', {} as Record<string, never>)

        raycast.click(nodeHit('5519+'), leftClick)

        expect(isOpen()).toBe(true)
    })
})

describe('HeatmapLook — hover tooltip', () => {

    it('shows Node and Length only: no State row, no population list', () => {
        const html = look.createNodeTooltipContent(nodeMeshes.get('5519+')!)
        const host = document.createElement('div')
        host.innerHTML = html
        const labels = [...host.querySelectorAll('.node-detail-label')].map(cell => cell.textContent)

        expect(labels).toEqual(['Node:', 'Length:'])
        expect(host.textContent).toContain('5519+')
        expect(host.querySelector('.population-breakdown, .population-tooltip')).toBeNull()
    })
})
