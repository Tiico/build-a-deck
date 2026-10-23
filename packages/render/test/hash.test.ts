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

  // One card in two partners' forms is two renderings, and the same card in the same form is one
  // (#1207, DRIFT §6). The bleed is part of the compiled page; the pixels and the format are not.
  it('tells a partner raster apart by its pixels and its format', () => {
    const page = { html: '<div data-card data-bleed="3.175"></div>', css: '' }
    const tgc = contentHash(page, { kind: 'raster', format: 'png', widthPx: 819, heightPx: 1114 })
    expect(tgc).toBe(contentHash(page, { kind: 'raster', format: 'png', widthPx: 819, heightPx: 1114 }))
    for (const other of [
      { kind: 'raster', format: 'png', widthPx: 1638, heightPx: 2228 },
      { kind: 'raster', format: 'png', widthPx: 819, heightPx: 1115 },
      { kind: 'raster', format: 'jpg', widthPx: 819, heightPx: 1114 },
      { kind: 'pdf' },
      { kind: 'png', dpi: 300 },
    ] as const) expect(contentHash(page, other), JSON.stringify(other)).not.toBe(tgc)
    expect(contentHash({ ...page, html: '<div data-card data-bleed="3"></div>' }, { kind: 'raster', format: 'png', widthPx: 819, heightPx: 1114 })).not.toBe(tgc)
  })
})
