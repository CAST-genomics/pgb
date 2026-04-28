// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { downloadBlob, timestampedFilename } from '../utils/downloadBlob'

describe('timestampedFilename', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date(2026, 3, 28, 9, 5, 7))
    })
    afterEach(() => vi.useRealTimers())

    it('produces a pgb-prefixed filename with zero-padded timestamp and extension', () => {
        expect(timestampedFilename('graph', 'png')).toBe('pgb-graph-20260428-090507.png')
    })

    it('passes the layer and extension through unchanged', () => {
        expect(timestampedFilename('pca-chart', 'svg')).toBe('pgb-pca-chart-20260428-090507.svg')
    })
})

describe('downloadBlob', () => {
    it('creates an object URL, anchors a download, and revokes the URL', () => {
        const createObjectURL = vi.fn(() => 'blob:fake-url')
        const revokeObjectURL = vi.fn()
        const originalCreate = URL.createObjectURL
        const originalRevoke = URL.revokeObjectURL
        URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL
        URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL

        const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

        const blob = new Blob(['hello'], { type: 'text/plain' })
        downloadBlob(blob, 'test.txt')

        expect(createObjectURL).toHaveBeenCalledWith(blob)
        expect(clickSpy).toHaveBeenCalledOnce()
        expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-url')

        URL.createObjectURL = originalCreate
        URL.revokeObjectURL = originalRevoke
        clickSpy.mockRestore()
    })
})
