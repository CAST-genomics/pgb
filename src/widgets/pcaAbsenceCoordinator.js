/**
 * pcaAbsenceCoordinator — refcounts the presenters that need the 3D graph
 * in "absence" mode (PCA widget and PCA chart).
 *
 * Background: both the PCA widget card and the PCA chart panel want the
 * 3D graph to paint nodes with no PCLAI coordinates as "absent" while they
 * are visible. Without coordination, dismissing one presenter while the
 * other is still visible would publish `pcaWidget:normal` and wipe the
 * absence state the surviving presenter still needs.
 *
 * Single-gatekeeper rules:
 *   - First presenter to `acquire()` triggers `pcaWidget:absence`.
 *   - Only the last presenter to `release()` triggers `pcaWidget:normal`.
 *   - Re-entrant acquire from the same presenter is a no-op.
 */

import eventBus from '../utils/eventBus.ts'
import { pclaiCoordinateService } from './pclaiCoordinateService.js'

const presenters = new Set()

export function acquireAbsence(presenterId) {
    const wasEmpty = presenters.size === 0
    presenters.add(presenterId)
    if (wasEmpty) publishAbsence()
}

export function releaseAbsence(presenterId) {
    if (!presenters.has(presenterId)) return
    presenters.delete(presenterId)
    if (presenters.size === 0) publishNormal()
}

function publishAbsence() {
    const absentNodeSet = pclaiCoordinateService.getAbsentNodeSet()
    if (absentNodeSet.size > 0) {
        eventBus.publish('pcaWidget:absence', { absentNodeSet })
    }
}

function publishNormal() {
    const absentNodeSet = pclaiCoordinateService.getAbsentNodeSet()
    eventBus.publish('pcaWidget:normal', { nodeSet: absentNodeSet })
}
