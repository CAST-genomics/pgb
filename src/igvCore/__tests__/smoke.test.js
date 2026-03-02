import { describe, it, expect } from 'vitest'
import { complementSequence, reverseComplementSequence } from '../util/sequenceUtils.js'

describe('Smoke test — vitest is working', () => {

    it('complementSequence returns Watson-Crick complement', () => {
        expect(complementSequence('ATGC')).toBe('TACG')
    })

    it('reverseComplementSequence returns reverse complement', () => {
        expect(reverseComplementSequence('ATGC')).toBe('GCAT')
    })

})
