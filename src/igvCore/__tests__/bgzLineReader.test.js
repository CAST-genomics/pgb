import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('igv-utils', async () => {
    const actual = await vi.importActual('igv-utils')
    return {
        ...actual,
        igvxhr: {
            loadArrayBuffer: vi.fn(),
        },
        BGZip: {
            ...actual.BGZip,
            bgzBlockSize: vi.fn(),
            unbgzf: vi.fn(),
        },
    }
})

import BGZLineReader from '../io/bgzLineReader.js'
import { igvxhr, BGZip } from 'igv-utils'

beforeEach(() => {
    vi.clearAllMocks()
})

describe('BGZLineReader', () => {

    it('nextLine() reads lines from bgzipped data', async () => {
        const line1 = 'first line'
        const line2 = 'second line'
        const textBytes = new TextEncoder().encode(line1 + '\n' + line2 + '\n')

        // Mock: first call gets header size, second gets the block data
        BGZip.bgzBlockSize.mockReturnValue(100)
        igvxhr.loadArrayBuffer
            .mockResolvedValueOnce(new ArrayBuffer(26)) // header peek
            .mockResolvedValueOnce(new ArrayBuffer(100)) // block data
        BGZip.unbgzf.mockReturnValueOnce(textBytes)

        const reader = new BGZLineReader({ url: 'http://example.com/data.gz' })

        const result1 = await reader.nextLine()
        expect(result1).toBe('first line')

        const result2 = await reader.nextLine()
        expect(result2).toBe('second line')
    })

    it('returns undefined at EOF', async () => {
        BGZip.bgzBlockSize.mockReturnValue(100)
        igvxhr.loadArrayBuffer
            .mockResolvedValueOnce(new ArrayBuffer(26))
            .mockResolvedValueOnce(new ArrayBuffer(100))
        BGZip.unbgzf.mockReturnValueOnce(new Uint8Array(0))

        const reader = new BGZLineReader({ url: 'http://example.com/data.gz' })
        const result = await reader.nextLine()

        expect(result).toBeUndefined()
    })

    it('handles \\r\\n line endings', async () => {
        const textBytes = new TextEncoder().encode('hello\r\nworld\r\n')

        BGZip.bgzBlockSize.mockReturnValue(100)
        igvxhr.loadArrayBuffer
            .mockResolvedValueOnce(new ArrayBuffer(26))
            .mockResolvedValueOnce(new ArrayBuffer(100))
        BGZip.unbgzf.mockReturnValueOnce(textBytes)

        const reader = new BGZLineReader({ url: 'http://example.com/data.gz' })

        expect(await reader.nextLine()).toBe('hello')
        expect(await reader.nextLine()).toBe('world')
    })
})
