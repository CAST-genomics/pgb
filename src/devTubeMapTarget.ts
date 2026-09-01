/**
 * Which node a URL is of — the dev pages' half of the panel header's promise.
 *
 * `mountTubeMapPanel` writes the header from the target and the map from the url, and says so:
 * *"the header is written from `target` either way, so the two can never disagree about which
 * node is on screen"*. That holds only if whoever calls `open` hands over a matching pair. The
 * app has one from `tubeMapTargetForNode`; the dev pages open whatever is typed into the picker
 * or passed as `?url=`, so working the pair out is their job, and this is where they do it.
 *
 * They did not, until #128's screenshots caught the header reading `5519 · chr1:25,331,046-…`
 * over a map of `5514+`: the route opened the panel with its own fixture's target no matter
 * what URL it had been given. A wrong header is as plausible as a right one, which is why the
 * conventions below are pinned by `__tests__/devTubeMapTarget.test.ts` rather than looked at.
 *
 * Three shapes, tried in order:
 *
 * - A live `/seqtubemap?…` URL says everything, in the parameters `buildSeqTubeMapURL` wrote.
 * - A captured document says it in its **filename**, which is the only record there is: the
 *   SVGs carry no node id. `stm-node-5514-chr1-25301271-25309238.svg` is the full convention;
 *   `stm-chr1-25331046-25331646.svg` is the older one, naming the interval but not the node.
 * - Anything else is unknown, and is said to be. `UNKNOWN` in the header beats a confident
 *   wrong number, which is the bug this module exists because of.
 */

import type { SeqTubeMapTarget } from './pangenomeURL.ts'

/** Node 5519 captured to disk — the file the parser tests read, and what its header says. */
export const FIXTURE_URL = '/src/tubemap/__tests__/fixtures/stm-chr1-25331046-25331646.svg'

/**
 * The default fixture's own target, which its filename predates and does not carry. Known
 * from the capture rather than derived, so it is matched by path before anything is parsed.
 */
export const FIXTURE_TARGET: SeqTubeMapTarget = {
    chrom: 'chr1',
    start: 25331046,
    end: 25331646,
    minigraphnode: '5519',
}

/**
 * What the header says in place of a number it does not have.
 *
 * Not a valid `minigraphnode`, deliberately: a target carrying it describes a document that
 * has already been fetched by URL, and must never be handed to `buildSeqTubeMapURL` to fetch
 * another. Nothing on the dev pages does — they pass the url explicitly — and a request built
 * from `?` would fail loudly rather than quietly fetch the wrong node.
 */
export const UNKNOWN = '?'

/**
 * `stm-node-5514-chr1-25301271-25309238.svg` — node, contig, and the interval it spans.
 *
 * `.bands` as well as `.svg`, because the same convention names the payload of the same
 * region and the header is a claim about the region rather than about the encoding. A
 * payload captioned `?` beside a document captioned `5514` is the asymmetry #128 removed,
 * reintroduced one file extension along.
 */
const NAMED = /(?:^|\/)stm-node-(\d+)-([^/-]+)-(\d+)-(\d+)\.(?:svg|bands)$/

/** `stm-chr1-25331046-25331646.svg` — the same, from before the node was written down. */
const INTERVAL = /(?:^|\/)stm-([^/-]+)-(\d+)-(\d+)\.(?:svg|bands)$/

export function targetForUrl(url: string): SeqTubeMapTarget {
    if (FIXTURE_URL === url) {
        return FIXTURE_TARGET
    }

    const query = url.includes('?') ? new URLSearchParams(url.slice(url.indexOf('?') + 1)) : null
    const chrom = query?.get('chrom')
    const minigraphnode = query?.get('minigraphnode')
    // Read as strings first, because `Number(null)` is `0` rather than `NaN` — so a query
    // that names no interval passes `Number.isFinite` and yields a confident `0-0`, which is
    // the same kind of lie as the wrong node id.
    const start = query?.get('start')
    const end = query?.get('end')

    if (chrom && minigraphnode && null !== start && null !== end
        && Number.isFinite(Number(start)) && Number.isFinite(Number(end))) {
        return { chrom, start: Number(start), end: Number(end), minigraphnode }
    }

    const named = NAMED.exec(url)

    if (null !== named) {
        return {
            chrom: named[2],
            start: Number(named[3]),
            end: Number(named[4]),
            minigraphnode: named[1],
        }
    }

    const interval = INTERVAL.exec(url)

    if (null !== interval) {
        return {
            chrom: interval[1],
            start: Number(interval[2]),
            end: Number(interval[3]),
            minigraphnode: UNKNOWN,
        }
    }

    return { chrom: UNKNOWN, start: 0, end: 0, minigraphnode: UNKNOWN }
}
