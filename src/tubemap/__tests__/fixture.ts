/**
 * The tube map documents committed to this repo, and the whole test corpus.
 *
 * The spike ran its parser tests against three captured documents. At migration only the
 * smallest came across (3.5 MB) and the other two, 14 MB each, stayed behind. **They are
 * here now, 2026-08-20**, along with the rest of the spike's research apparatus: the
 * separation turned out to cost more than the bytes do. `5514+` and `5520+` are the wide
 * strips — 177,994 units and 40,442 bands — and they are what the fit-to-screen regime can
 * be exercised against, which nothing else in this corpus can do. They are *not* read by
 * the unit tests, which stay on the two small documents so the suite stays fast; they exist
 * for the Playwright harnesses in `scripts/` and for looking at — with one exception,
 * `readEveryFixture`, which parses all five and checks nothing about the picture but that
 * it has not moved.
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

/**
 * The third document, and it is here for the same reason as the second: the corpus could
 * not exhibit the case.
 *
 * Every band in the two documents above runs left to right, as does every band in the two
 * large survey documents — 0 of 49,682 connectors run the other way. The parser took that
 * regularity for a rule and asserted it, and on 2026-08-25 a document from **chr8p23.1**
 * was refused whole because it does not hold.
 *
 * This is that document. Minigraph node `136685`, `chr8:10,079,054-10,080,461`, fetched
 * from the API on 2026-08-25: 65024 × 7220, 463 strands, 5948 connectors of which **3771
 * run right-to-left**. 297 haplotypes traverse the window one way and 166 the other, and
 * **no haplotype mixes the two** — the signature of an inversion polymorphism rather than
 * a malformed document.
 *
 * The second thing it is the only cover for: **`GRCh38#0#chr8` runs leftward here**, with
 * the 297, while `CHM13#0#chr8#0` runs rightward with the 166. The x-axis is the server's
 * layout order and is oriented along neither. Any test that assumes the reference runs
 * with the axis is wrong, and this is the document that says so.
 *
 * At 4.2 MB it is the second largest committed, which is the price of the only inversion
 * in the corpus. ADR `0004` records what was decided about it.
 */
export const INVERTED_FIXTURE_PATH = 'src/tubemap/__tests__/fixtures/stm-chr8-10079054-10080461.svg'

/** Every document in the corpus, oldest first, and the order is the corpus's history:
 *  the two the unit tests read, the two large survey documents, then the inversion.
 *
 *  For the one test that has to read all of them — the geometry regression in
 *  `parseBands.test.ts`, which pins what each document already parsed to. Reading the two
 *  14 MB documents costs about a tenth of a second, which is worth paying once to know that
 *  a change to the parser left the four documents that already drew exactly where they were. */
export const EVERY_FIXTURE_PATH = [
    FIXTURE_PATH,
    TALL_FIXTURE_PATH,
    'src/tubemap/__tests__/fixtures/stm-node-5514-chr1-25301271-25309238.svg',
    'src/tubemap/__tests__/fixtures/stm-node-5520-chr1-25331646-25335796.svg',
    INVERTED_FIXTURE_PATH
]

/** The strip's text. Every parser test starts here. */
export function readFixture(): string {
    return readFileSync(FIXTURE_PATH, 'utf8')
}

/** The tall document's text — the shape the strip cannot catch. */
export function readTallFixture(): string {
    return readFileSync(TALL_FIXTURE_PATH, 'utf8')
}

/** The inverted document's text — the direction the other three cannot catch. */
export function readInvertedFixture(): string {
    return readFileSync(INVERTED_FIXTURE_PATH, 'utf8')
}

/** Each document's path with its text, for the regression that reads the whole corpus. */
export function readEveryFixture(): Array<{ path: string, text: string }> {
    return EVERY_FIXTURE_PATH.map(path => ({ path, text: readFileSync(path, 'utf8') }))
}
