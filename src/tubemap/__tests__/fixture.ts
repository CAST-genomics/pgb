/**
 * The one tube map document committed to this repo, and the whole test corpus.
 *
 * The spike ran its parser tests against three captured documents. Only the smallest came
 * across (3.5 MB); the other two are 14 MB each and stay in the archived spike repo, where
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

/** The fixture's text. Every parser test starts here. */
export function readFixture(): string {
    return readFileSync(FIXTURE_PATH, 'utf8')
}
