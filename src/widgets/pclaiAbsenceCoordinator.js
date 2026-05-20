/**
 * pclaiAbsenceCoordinator — refcounts the presenters that need the 3D graph
 * in "absence" mode (PCLAI widget and PCLAI chart).
 *
 * Background: both the PCLAI widget card and the PCLAI chart panel want the
 * 3D graph to paint nodes with no PCLAI coordinates as "absent" while they
 * are visible. Without coordination, dismissing one presenter while the
 * other is still visible would publish `pclaiWidget:normal` and wipe the
 * absence state the surviving presenter still needs.
 *
 * Single-gatekeeper rules:
 *   - First presenter to `acquire()` triggers `pclaiWidget:absence`.
 *   - Only the last presenter to `release()` triggers `pclaiWidget:normal`.
 *   - Re-entrant acquire from the same presenter is a no-op.
 */

import eventBus from '../utils/eventBus.ts'
import { pclaiCoordinateService } from './pclaiCoordinateService.js'
import PCLAIWidget from './pclaiWidget.ts'

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
        eventBus.publish('pclaiWidget:absence', { absentNodeSet, absenceColor: PCLAIWidget.NODE_ABSENCE_COLOR })
    }
}

function publishNormal() {
    const absentNodeSet = pclaiCoordinateService.getAbsentNodeSet()
    eventBus.publish('pclaiWidget:normal', { nodeSet: absentNodeSet })
}
