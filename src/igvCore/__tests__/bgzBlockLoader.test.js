import { describe, it, expect } from 'vitest'
import { bgzBlockSize, findBlockBoundaries } from '../io/bgzBlockLoader.js'

describe('bgzBlockLoader', () => {

    describe('bgzBlockSize', () => {

        it('extracts block size from bgzip header bytes', () => {
            // bgzip header: bytes 16-17 encode (BSIZE - 1) in little-endian
            // If block size = 256, then BSIZE-1 = 255 = 0x00FF
            const header = new Uint8Array(26)
            header[16] = 0xFF // low byte of BSIZE-1
            header[17] = 0x00 // high byte of BSIZE-1
            // bgzBlockSize returns (ba[17] << 8 | ba[16]) + 1 = 0xFF + 1 = 256
            expect(bgzBlockSize(header)).toBe(256)
        })

        it('handles larger block sizes', () => {
            const header = new Uint8Array(26)
            // BSIZE-1 = 65535 = 0xFFFF → block size = 65536
            header[16] = 0xFF
            header[17] = 0xFF
            expect(bgzBlockSize(header)).toBe(65536)
        })

        it('works with ArrayBuffer input', () => {
            const buffer = new ArrayBuffer(26)
            const view = new Uint8Array(buffer)
            view[16] = 0x63 // BSIZE-1 = 0x0063 = 99 → block size = 100
            view[17] = 0x00
            expect(bgzBlockSize(buffer)).toBe(100)
        })
    })

    describe('findBlockBoundaries', () => {

        it('finds block boundaries in a multi-block buffer', () => {
            // Create a fake buffer with 2 blocks of known sizes
            // Block 1: BSIZE-1 = 49 → size = 50 (at bytes 16-17)
            // Block 2: BSIZE-1 = 29 → size = 30 (at bytes 66-67)
            const buffer = new ArrayBuffer(80)
            const view = new Uint8Array(buffer)
            view[16] = 49  // block 1: BSIZE-1 = 49
            view[17] = 0
            view[50 + 16] = 29  // block 2: BSIZE-1 = 29
            view[50 + 17] = 0

            const boundaries = findBlockBoundaries(buffer)
            expect(boundaries[0]).toBe(0)
            expect(boundaries[1]).toBe(50)
        })
    })
})
