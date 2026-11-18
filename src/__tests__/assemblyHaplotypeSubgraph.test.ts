/**
 * The PCLAI widget keys on assembly-haplotypes (`ASM#HAP`); subgraphs are keyed
 * on 3-part assembly keys (`ASM#HAP#sequence_id`). The bridge must union every
 * matching 3-part key — a haplotype can span several contigs in a region, even
 * though no shipped dataset does yet, so the rendering can't reveal a miss.
 */
import { describe, it, expect, vi } from 'vitest'
import GenomicService from '../genomicService.js'

// locusInput.js imports main.js, which touches the DOM at module load.
vi.mock('../locusInput.js', () => ({ default: {} }))

function serviceWith(subgraphs: Record<string, string[]>) {
    const service: any = new GenomicService()
    for (const [key, nodes] of Object.entries(subgraphs)) {
        service.assemblySet.add(key)
        service.assemblyWalkMap.set(key, { assemblySubgraph: { nodes, edges: [] } })
    }
    return service
}

describe('getAssemblyHaplotypeSubgraphNodes', () => {

    it('unions the subgraphs of every contig of the haplotype', () => {
        const service = serviceWith({
            'HG01167#1#contigA': ['1+', '2+'],
            'HG01167#1#contigB': ['2+', '3+'],
        })
        expect([...service.getAssemblyHaplotypeSubgraphNodes('HG01167#1')].sort()).toEqual(['1+', '2+', '3+'])
    })

    it('does not leak in the other haplotype or a longer sample id', () => {
        const service = serviceWith({
            'HG01167#1#contigA': ['1+'],
            'HG01167#2#contigA': ['8+'],
            'HG011670#1#contigA': ['9+'],
        })
        expect([...service.getAssemblyHaplotypeSubgraphNodes('HG01167#1')]).toEqual(['1+'])
    })

    it('is empty for an unknown haplotype', () => {
        expect(serviceWith({}).getAssemblyHaplotypeSubgraphNodes('NA00000#1').size).toBe(0)
    })
})
