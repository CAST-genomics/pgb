/**
 * The staleness comparison behind the info popover.
 *
 * This is small logic guarding a failure that is invisible by construction: a hosted copy
 * running a months-old bundle looks exactly like a current one, and the popover is the only
 * place that can say otherwise. The two things worth pinning are that a `v` prefix on one
 * side is not a mismatch — tags carry it, `package.json` does not — and that a missing
 * value is silence rather than an accusation, since an offline tab must not tell a
 * researcher their deployment is stale.
 */

import { describe, expect, it } from 'vitest'
import { isStaleAgainstLatest } from '../utils/utils.js'

describe('isStaleAgainstLatest', () => {

    it('treats a v-prefixed tag and a bare version as the same version', () => {
        expect(isStaleAgainstLatest('2.8.0', 'v2.8.0')).toBe(false)
        expect(isStaleAgainstLatest('v2.8.0', '2.8.0')).toBe(false)
        expect(isStaleAgainstLatest('2.8.0', '2.8.0')).toBe(false)
    })

    it('reports a mismatch when the running build is not the latest release', () => {
        expect(isStaleAgainstLatest('2.5.0', 'v2.8.0')).toBe(true)
    })

    it('stays silent when either side is unknown', () => {
        // An unreachable GitHub API, or a bundle built without the version define. Neither
        // is evidence of a stale deployment.
        expect(isStaleAgainstLatest('2.8.0', null)).toBe(false)
        expect(isStaleAgainstLatest(null, 'v2.8.0')).toBe(false)
        expect(isStaleAgainstLatest(null, null)).toBe(false)
    })
})
