import { describe, it, expect } from 'vitest'
import { buildPangenomeURL } from '../pangenomeURL.js'

// The URL the app has always requested. Force layout must reproduce this
// byte for byte — that is the whole regression guard for linear mode.
const FORCE_URL =
    'https://pangenome-api.ucsd.edu:8000/json' +
    '?chrom=chr6&start=160531482&end=160664275' +
    '&graphtype=minigraph&version=v2&debug_small_graphs=false' +
    '&minnodelen=5&nodeseglen=20&edgelen=5&nodelenpermb=1000'

// What the module actually produces for the same locus in force mode. The two
// agree only when the template's host matches FORCE_URL — which the byte-exact
// tests above assert on their own. Deriving the linear-mode expectations from
// this instead keeps them meaningful while someone is pointed at a local API.
const forceUrlForFixtureLocus = () =>
    buildPangenomeURL('chr6', 160531482, 160664275, 'v2')

describe('buildPangenomeURL', () => {

    it('reproduces the legacy URL when no layout is supplied', () => {
        expect(buildPangenomeURL('chr6', 160531482, 160664275, 'v2')).toBe(FORCE_URL)
    })

    it('reproduces the legacy URL for an explicit force layout', () => {
        const url = buildPangenomeURL('chr6', 160531482, 160664275, 'v2', {
            mode: 'force',
            spineAssembly: null,
        })
        expect(url).toBe(FORCE_URL)
    })

    it('never emits linear or assembly params in force mode', () => {
        const url = buildPangenomeURL('chr6', 1, 2, 'v2', { mode: 'force', spineAssembly: null })
        expect(url).not.toContain('linear')
        expect(url).not.toContain('assembly')
    })

    it('appends linear and url-encoded assembly in linear mode', () => {
        const url = buildPangenomeURL('chr6', 160531482, 160664275, 'v2', {
            mode: 'linear',
            spineAssembly: 'HG00097#1',
        })
        expect(url).toBe(
            `${forceUrlForFixtureLocus()}&linear=true&assembly=HG00097%231&bp_scaled_spine=true`)
    })

    it('requests a bp-scaled spine, so the annotation track can register 1:1', () => {
        // The server defaults this to true. Sending it explicitly is what keeps
        // the track's requirement from resting on a remote default.
        const url = buildPangenomeURL('chr6', 1, 2, 'v2', {
            mode: 'linear',
            spineAssembly: 'HG00097#1',
        })
        expect(new URL(url).searchParams.get('bp_scaled_spine')).toBe('true')
    })

    it('does not request a bp-scaled spine in force mode', () => {
        const url = buildPangenomeURL('chr6', 1, 2, 'v2', { mode: 'force', spineAssembly: null })
        expect(url).not.toContain('bp_scaled_spine')
    })

    it('encodes the haplotype separator so # is not read as a fragment', () => {
        const url = buildPangenomeURL('chr6', 1, 2, 'v2', {
            mode: 'linear',
            spineAssembly: 'HG00099#2',
        })
        expect(new URL(url).searchParams.get('assembly')).toBe('HG00099#2')
        expect(url).not.toContain('#')
    })

    it('falls back to force when linear is requested without a spine', () => {
        const url = buildPangenomeURL('chr6', 160531482, 160664275, 'v2', {
            mode: 'linear',
            spineAssembly: null,
        })
        expect(url).toBe(forceUrlForFixtureLocus())
        expect(url).not.toContain('linear')
    })

    it('substitutes the locus into the template', () => {
        const url = buildPangenomeURL('chrX', 100, 200, 'v2')
        const params = new URL(url).searchParams
        expect(params.get('chrom')).toBe('chrX')
        expect(params.get('start')).toBe('100')
        expect(params.get('end')).toBe('200')
    })
})
