/**
 * The tube map documents committed to this repo, and the whole test corpus.
 *
 * The spike ran its parser tests against three captured documents. Only the smallest came
 * across (3.5 MB); the other two are 14 MB each and stay in the spike repo, where
 * the record of what they measured stays with them. What they proved that this one does not
 * — that the parser holds up on a 177,994-unit-wide document with 40,442 bands — was a
 * question about the parser's arithmetic, and it was answered before the migration.
 *
 * It sits here rather than in `public/` — where the spike kept it — because it is test data
 * and nothing the app ships ever asks for it. Vite copies `public/` into `dist/` verbatim,
 * so a fixture parked there would add 3.5 MB to every deploy for the benefit of a dev page
 * that is not in the build. Under `src/` it stays reachable two ways and shipped neither:
 * the tests read it off disk, and Vite's dev server serves it at the same path.
 *
 * The path is relative to the repo root, which is both vitest's working directory and the
 * dev server's root. `src/devTubeMapRoute.ts` names the same file again, with a leading
 * slash, and cannot import it from here — this module reads the filesystem, which is the
 * one thing a browser page cannot do. Move the fixture and both spellings need changing;
 * missing the second is not a silent failure, since the dev page is a 404 on the spot.
 */

import { readFileSync } from 'node:fs'

export const FIXTURE_PATH = 'src/tubemap/__tests__/fixtures/stm-chr1-25331046-25331646.svg'

/**
 * The second document, and it is here because of what the first one is not.
 *
 * `chr1:25,331,046-25,331,646` is 35562 × 6325 — a 5.6:1 strip, the shape every tube map
 * was assumed to have. Three defects fixed in #99 were that assumption, and none of them
 * could fail against a strip: the navigator's height had no ceiling, `fitZoom` fitted the
 * width rather than the map, and both looked correct until a map arrived that was taller
 * than it was wide.
 *
 * This is that map. Node `141457` of `il7.json`, `chr8:78,771,162-78,771,252`, fetched from
 * the API on 2026-08-18: **4717 × 7115**, 464 strands over a 90 bp span, 1,008 bands and 9
 * segment boxes. It also carries the coordinate the fourth defect turned on — the server
 * spells one box's left edge `4067.8571428571427` along its top and `4067.857142857143`
 * along its bottom, so `parseSegmentBoxes`'s tolerance is exercised against a real document
 * rather than only against a hand-written one.
 *
 * At 300 KB it is a ninth the size of the strip, which is why it is the one that was taken:
 * of the four `il7` nodes that fetched at all, this was the smallest and the fastest (6.5 s).
 */
export const TALL_FIXTURE_PATH = 'src/tubemap/__tests__/fixtures/stm-chr8-78771162-78771252.svg'

/** The strip's text. Every parser test starts here. */
export function readFixture(): string {
    return readFileSync(FIXTURE_PATH, 'utf8')
}

/** The tall document's text — the shape the strip cannot catch. */
export function readTallFixture(): string {
    return readFileSync(TALL_FIXTURE_PATH, 'utf8')
}
