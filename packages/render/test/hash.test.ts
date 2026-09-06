import { describe, expect, it } from 'vitest'
import { contentHash } from '../src/hash.js'

describe('contentHash', () => {
  it('is stable for the same compiled output and options, and differs when anything changes', () => {
    const a = contentHash({ html: '<div>a</div>', css: 'div{}' }, { kind: 'png', dpi: 150 })
    expect(a).toBe(contentHash({ html: '<div>a</div>', css: 'div{}' }, { kind: 'png', dpi: 150 }))
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(a).not.toBe(contentHash({ html: '<div>b</div>', css: 'div{}' }, { kind: 'png', dpi: 150 }))
    expect(a).not.toBe(contentHash({ html: '<div>a</div>', css: 'div{}' }, { kind: 'png', dpi: 300 }))
    expect(a).not.toBe(contentHash({ html: '<div>a</div>', css: 'div{}' }, { kind: 'pdf' }))
  })
})
