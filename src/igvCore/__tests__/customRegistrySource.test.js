import { describe, it, expect } from 'vitest'

import { initialize } from '../genome/customRegistrySource.js'

const fixtureGenomes = [
    { id: 'custom1', name: 'Custom Genome 1', fastaURL: 'https://example.com/custom1.fa' },
    { id: 'custom2', name: 'Custom Genome 2', fastaURL: 'https://example.com/custom2.fa' },
]

describe('customRegistrySource', () => {

    it('initialize(array) returns Map keyed by id', () => {
        const map = initialize(fixtureGenomes)

        expect(map).toBeInstanceOf(Map)
        expect(map.get('custom1')).toEqual(fixtureGenomes[0])
        expect(map.get('custom2')).toEqual(fixtureGenomes[1])
    })

    it('returns empty Map when input is null', () => {
        const map = initialize(null)
        expect(map.size).toBe(0)
    })

    it('returns empty Map when input is undefined', () => {
        const map = initialize(undefined)
        expect(map.size).toBe(0)
    })

    it('accepts a single genome object and returns a 1-entry Map', () => {
        const singleGenome = { id: 'solo', name: 'Solo Genome', fastaURL: 'https://example.com/solo.fa' }
        const map = initialize(singleGenome)

        expect(map).toBeInstanceOf(Map)
        expect(map.size).toBe(1)
        expect(map.get('solo')).toEqual(singleGenome)
    })

    it('returns empty Map when input is not a valid genome config or array', () => {
        const map = initialize({ not: 'a genome' })

        expect(map).toBeInstanceOf(Map)
        expect(map.size).toBe(0)
    })
})
