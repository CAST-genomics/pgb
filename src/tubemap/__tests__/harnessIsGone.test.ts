/**
 * The migration's stated boundary, enforced where it now lives.
 *
 * This replaces the spike repo's `spikeIsGone.test.ts`, which asserted the other end of the
 * same contract: that the throwaway `spike/` directory was gone and nothing had grown a path
 * back into it. That statement is about the spike repo's history and means nothing here, so
 * what came across is the check, repointed at the boundary this repo has.
 *
 * Three modules deliberately did not migrate — `main.ts`, `frameMeter.ts` and
 * `nodeCatalog.ts`. They were the standalone harness: they owned the container, the URL
 * field, the node picker and the FPS readout, all of which PGB supplies itself. The viewer's
 * entire input surface is `open(url)` (`docs/adr/0001-sequence-tube-map-panel.md`), and
 * every one of those three is a way of deciding *which* URL — a decision that belongs to the
 * host. A copy of one reappearing under `src/tubemap/` would be the viewer quietly growing a
 * second input surface, which is the failure this guards.
 *
 * `src/devTubeMapRoute.ts` is not an exception. It is a host, and it lives outside
 * `src/tubemap/` precisely so that this distinction stays visible in the directory listing.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const IMPORT = /(?:^|\n)\s*(?:import|export)[^\n]*?from\s+['"]([^'"]+)['"]/g

const HARNESS = ['main', 'frameMeter', 'nodeCatalog']

describe('the standalone harness did not come across', () => {

    it('has no harness module under src/tubemap/', () => {
        const present = readdirSync('src/tubemap')
            .filter(entry => HARNESS.includes(entry.replace(/\.ts$/, '')))

        expect(present).toEqual([])
    })

    it('is imported by nothing', () => {
        const offenders: string[] = []

        for (const file of sourceFiles('src')) {
            for (const specifier of imports(file)) {
                if (namesHarnessModule(file, specifier)) {
                    offenders.push(`${file} → ${specifier}`)
                }
            }
        }

        expect(offenders).toEqual([])
    })
})

/**
 * Whether `specifier`, as written in `file`, resolves to a harness module under
 * `src/tubemap/`.
 *
 * Resolved against the importing file rather than matched as a substring, because the place
 * a harness module would actually reappear is inside `src/tubemap/` itself — where it is
 * imported as `./main.ts`, with no `tubemap/` in the text to match on. A guard that only
 * caught the spelling used from outside would be blind in exactly the one directory it
 * exists to watch.
 */
function namesHarnessModule(file: string, specifier: string): boolean {
    const resolved = specifier.startsWith('.')
        ? join(dirname(file), specifier)
        : specifier

    const [directory, module] = [dirname(resolved), basename(resolved).replace(/\.tsx?$/, '')]

    return directory.endsWith(join('src', 'tubemap')) && HARNESS.includes(module)
}

function sourceFiles(root: string): string[] {
    const found: string[] = []

    const walk = (directory: string): void => {
        for (const entry of readdirSync(directory)) {
            const path = join(directory, entry)

            if (statSync(path).isDirectory()) {
                walk(path)
            } else if (/\.tsx?$/.test(entry)) {
                found.push(path)
            }
        }
    }

    walk(root)

    return found
}

function imports(file: string): string[] {
    const text = readFileSync(file, 'utf8')
    const specifiers: string[] = []
    let match: RegExpExecArray | null

    IMPORT.lastIndex = 0

    while (null !== (match = IMPORT.exec(text))) {
        specifiers.push(match[1])
    }

    return specifiers
}
