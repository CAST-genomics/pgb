import { describe, it, expect } from 'vitest'
import getDataWrapper from '../io/dataWrapper.js'

describe('StringDataWrapper', () => {

    it('iterates lines separated by newline', () => {
        const wrapper = getDataWrapper('line1\nline2\nline3')
        expect(wrapper.nextLine()).toBe('line1')
        expect(wrapper.nextLine()).toBe('line2')
        expect(wrapper.nextLine()).toBe('line3')
        expect(wrapper.nextLine()).toBeUndefined()
    })

    it('handles CR/LF line endings', () => {
        const wrapper = getDataWrapper('line1\r\nline2\r\nline3')
        expect(wrapper.nextLine()).toBe('line1')
        expect(wrapper.nextLine()).toBe('line2')
        expect(wrapper.nextLine()).toBe('line3')
        expect(wrapper.nextLine()).toBeUndefined()
    })

    it('handles final line without trailing newline', () => {
        const wrapper = getDataWrapper('line1\nline2')
        expect(wrapper.nextLine()).toBe('line1')
        expect(wrapper.nextLine()).toBe('line2')
        expect(wrapper.nextLine()).toBeUndefined()
    })

    it('handles empty string', () => {
        const wrapper = getDataWrapper('')
        expect(wrapper.nextLine()).toBeUndefined()
    })

    it('handles single line with no newline', () => {
        const wrapper = getDataWrapper('only line')
        expect(wrapper.nextLine()).toBe('only line')
        expect(wrapper.nextLine()).toBeUndefined()
    })
})

describe('ByteArrayDataWrapper', () => {

    const encode = (str) => new TextEncoder().encode(str)

    it('iterates lines separated by newline', () => {
        const wrapper = getDataWrapper(encode('line1\nline2\nline3'))
        expect(wrapper.nextLine()).toBe('line1')
        expect(wrapper.nextLine()).toBe('line2')
        expect(wrapper.nextLine()).toBe('line3')
        expect(wrapper.nextLine()).toBeUndefined()
    })

    it('handles CR/LF line endings', () => {
        const wrapper = getDataWrapper(encode('line1\r\nline2\r\nline3'))
        expect(wrapper.nextLine()).toBe('line1')
        expect(wrapper.nextLine()).toBe('line2')
        expect(wrapper.nextLine()).toBe('line3')
        expect(wrapper.nextLine()).toBeUndefined()
    })

    it('handles final line without trailing newline', () => {
        const wrapper = getDataWrapper(encode('abc\ndef'))
        expect(wrapper.nextLine()).toBe('abc')
        expect(wrapper.nextLine()).toBe('def')
        expect(wrapper.nextLine()).toBeUndefined()
    })

    it('handles empty byte array', () => {
        const wrapper = getDataWrapper(new Uint8Array(0))
        expect(wrapper.nextLine()).toBeUndefined()
    })
})
