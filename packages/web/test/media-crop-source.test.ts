// The two rules the sheet's stylesheet owes the corners and the reader (#297, L33), read off the
// sheet itself so that a later hand cannot put them back by accident. `media-crop-layout` measures
// the corners in Chromium; this is the reason they measure right, said at the source: a box that
// clips its overflow cannot hold a handle that overhangs it, and a layer that is switched on and
// off has no movement to take away under `prefers-reduced-motion`.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(join(import.meta.dirname, '..', 'src', 'editor', 'editor.css'), 'utf8')
// The declarations of one rule, by its exact selector.
const rule = (selector: string): string => {
  const at = css.indexOf(`\n${selector} {`)
  expect(at, `no rule for ${selector}`).toBeGreaterThan(-1)
  return css.slice(at, css.indexOf('}', at))
}

describe('the crop sheet’s stylesheet (#297, L33)', () => {
  it('lets no box on the way to a corner clip its overflow, and lays air at least a corner’s overhang wide', () => {
    for (const selector of ['.byd-crop-sheet', '.byd-crop-picture']) expect(rule(selector)).not.toMatch(/overflow:\s*hidden/)
    // The air is a rung of the ladder, resolved here as the ladder declares it; the overhang is
    // half the corner, which is centred on the window's corner.
    const rung = /padding:\s*var\((--byd-s\d)\)/.exec(rule('.byd-crop-sheet'))?.[1]
    const air = Number(new RegExp(`${rung}:\\s*(\\d+)px`).exec(css)?.[1])
    const corner = rule('.byd-crop-corner')
    expect(corner).toMatch(/translate:\s*-50% -50%/)
    const overhang = Number(/width:\s*(\d+)px/.exec(corner)?.[1]) / 2
    expect(overhang).toBeGreaterThan(0)
    expect(air).toBeGreaterThanOrEqual(overhang)
  })

  it('moves nothing on the sheet: on and off, with no transition or animation to reduce', () => {
    for (const selector of ['.byd-media-sheet', '.byd-media-library[inert]']) expect(rule(selector)).not.toMatch(/transition|animation/)
  })
})

// Vad som gör ytan till en som visar och inte en som klipper (#468).
describe('beskärningens bild klipper aldrig (#468)', () => {
  it('ritas med `contain`, så att ingen bildruta någonsin gömmer en del av filen', () => {
    const img = rule('.byd-crop-picture img')
    expect(img).toMatch(/object-fit:\s*contain/)
    expect(img).not.toMatch(/object-fit:\s*cover/)
  })
})
