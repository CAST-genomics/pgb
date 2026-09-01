/**
 * The header lied for as long as nobody read it against the map.
 *
 * `dev/tubemap-app.html` showed `5519 · chr1:25,331,046-25,331,646` over a map of `5514+`,
 * because the dev route opened the panel with its own fixture's target regardless of which
 * `?url=` it had been given. Caught in #128's screenshots, and it is exactly the class of
 * mistake a picture hides: a header naming the wrong node is as plausible as one naming the
 * right one, and only reading the two together says which you have.
 *
 * So the mapping is pinned here rather than looked at. The filename is the *only* record of
 * which node a captured document is of — the SVGs carry no id of their own — which makes
 * these conventions load-bearing and worth a test that fails when one is renamed.
 */

import { describe, expect, it } from 'vitest'
import { FIXTURE_TARGET, FIXTURE_URL, UNKNOWN, targetForUrl } from '../devTubeMapTarget.ts'

describe('targetForUrl', () => {

    it('reads a live seqtubemap URL out of its query', () => {
        expect(targetForUrl('https://api.example.org/seqtubemap?chrom=chr8&start=10079054'
            + '&end=10080461&version=v2&minigraphnode=7231'))
            .toEqual({ chrom: 'chr8', start: 10079054, end: 10080461, minigraphnode: '7231' })
    })

    it('reads a captured document out of its filename', () => {
        expect(targetForUrl('/src/tubemap/__tests__/fixtures/stm-node-5514-chr1-25301271-25309238.svg'))
            .toEqual({ chrom: 'chr1', start: 25301271, end: 25309238, minigraphnode: '5514' })
    })

    it('names the node the map is of, not the one the page opens with', () => {
        const captured = targetForUrl('/src/tubemap/__tests__/fixtures/stm-node-5520-chr1-25331646-25335796.svg')

        expect(captured.minigraphnode).toBe('5520')
        expect(captured.minigraphnode).not.toBe(FIXTURE_TARGET.minigraphnode)
    })

    it('knows the default fixture, whose name does not carry its node', () => {
        expect(targetForUrl(FIXTURE_URL)).toEqual(FIXTURE_TARGET)
    })

    // The older capture convention: the interval is in the name and the node is not. Saying
    // the interval and admitting the node is unknown beats repeating the last node it knew.
    it('takes the interval from a name that carries no node, and admits the rest', () => {
        expect(targetForUrl('/src/tubemap/__tests__/fixtures/stm-chr8-10079054-10080461.svg'))
            .toEqual({ chrom: 'chr8', start: 10079054, end: 10080461, minigraphnode: UNKNOWN })
    })

    // The payload of a region is named the way its document is, so the header says the same
    // thing about both — the encoding is not what the caption is a claim about.
    it('reads a captured payload out of its filename too', () => {
        expect(targetForUrl('/fixtures/stm-node-5514-chr1-25301271-25309238.bands')).toEqual({
            chrom: 'chr1', start: 25301271, end: 25309238, minigraphnode: '5514',
        })
    })

    it('claims nothing about a URL it cannot read', () => {
        expect(targetForUrl('/does-not-exist.svg').minigraphnode).toBe(UNKNOWN)
        expect(targetForUrl('/does-not-exist.svg').chrom).toBe(UNKNOWN)
    })

    // A query missing any one of the four is not a live URL, and must not be read as one.
    it('does not half-read an incomplete query', () => {
        expect(targetForUrl('/seqtubemap?chrom=chr8&start=10079054&end=10080461').minigraphnode)
            .toBe(UNKNOWN)
        expect(targetForUrl('/seqtubemap?chrom=chr8&minigraphnode=7231').chrom).toBe(UNKNOWN)
    })
})
