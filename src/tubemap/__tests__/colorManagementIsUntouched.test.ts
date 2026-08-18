/**
 * `THREE.ColorManagement.enabled` is one flag on one shared `three` instance, and the tube
 * map is a guest in a process that has already made up its mind about it.
 *
 * Why the viewer no longer sets it, and why toggling it per frame was rejected, is
 * [ADR 0001](../../../docs/adr/0001-sequence-tube-map-panel.md) §"Accepted costs" 1 — the
 * decision is recorded there, not restated here. What is here is the guard: the assignment
 * is invisible until it changes somebody else's colours, so it needs watching rather than
 * only deleting.
 *
 * Two tests, because there are two ways it comes back. A module under `src/tubemap/`
 * reaching for the global again is caught by reading the source; a module *outside* it that
 * the viewer pulls in is not, and is caught by loading the viewer and looking at the flag.
 *
 * The renderer's own `outputColorSpace` is not in scope. That is per instance, so PGB's
 * renderer and the tube map's can hold different answers at the same time — which is
 * exactly why it survived the deletion the global did not.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { ColorManagement } from 'three'
import { afterEach, describe, expect, it } from 'vitest'

const ASSIGNS_THE_GLOBAL = /ColorManagement\s*\.\s*enabled\s*=/

const wasEnabled = ColorManagement.enabled

afterEach(() => {
    ColorManagement.enabled = wasEnabled
})

describe('the tube map leaves the colour-management global alone', () => {

    it('is not assigned to by any module under src/tubemap/', () => {
        const offenders = shippedSources('src/tubemap')
            .filter(file => ASSIGNS_THE_GLOBAL.test(readFileSync(file, 'utf8')))

        expect(offenders).toEqual([])
    })

    it('does not change the flag when the surface is loaded', async () => {
        ColorManagement.enabled = true

        // The whole viewer, entered the way a host enters it, so every module it pulls in on
        // the way — the surface, the band renderer, the picker — is covered by this, wherever
        // in the tree that module lives.
        await import('../tubeMapSurface.ts')

        expect(ColorManagement.enabled).toBe(true)
    })
})

/**
 * Every source file the viewer ships, under `root`, recursively.
 *
 * Recursive because the claim is about the whole directory, and a module in a subdirectory
 * nothing walked into would be exactly the blind spot this closes. `.js` as well as `.ts`
 * because [`CLAUDE.md`](../../../CLAUDE.md) requires *new* files to be TypeScript and says
 * nothing about a `.js` file edited into place. `__tests__` is skipped: this file sets the
 * flag itself, two lines above, and a test that swaps a global back afterwards is the one
 * place doing so is fine.
 */
function shippedSources(root: string): string[] {
    const found: string[] = []

    for (const entry of readdirSync(root)) {
        if ('__tests__' === entry) {
            continue
        }

        const path = join(root, entry)

        if (statSync(path).isDirectory()) {
            found.push(...shippedSources(path))
        } else if (/\.(?:ts|js)$/.test(entry)) {
            found.push(path)
        }
    }

    return found
}
