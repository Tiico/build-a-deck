// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { TAP_FLOOR, heldWidths, rememberWidths } from '../src/editor/widths.js'

// The widths a designer set herself, read back (#46, #220).
//
// The table has clamped a width to a target ever since it could be set: `setWidth` and the reading
// under the hand both refuse to go narrower than `--byd-tap`, because a column thinner than a
// fingertip is not a width anybody chose — it is a column thrown away by a hand that slipped, with
// no edge left wide enough to catch and drag back.
//
// What was never clamped is the way back in. `heldWidths` let through every positive number in the
// browser's own store, so a width written before the floor existed — or by a hand on another
// version, or by anything at all that can write to `localStorage` — came back as it was and the
// column was drawn invisible again on the next visit, with no way to recover it.

const PROJECT = 'skogens-herrar'
afterEach(() => localStorage.clear())

describe('a width read back from the browser (#220)', () => {
  it('gives back the widths a hand really chose', () => {
    rememberWidths(PROJECT, { title: 200, body: 320 })
    expect(heldWidths(PROJECT)).toEqual({ title: 200, body: 320 })
  })

  it('lifts a width that stands under the floor to it, rather than drawing an invisible column', () => {
    localStorage.setItem('byd.widths', JSON.stringify({ [PROJECT]: { title: 3, body: 320 } }))
    expect(heldWidths(PROJECT)).toEqual({ title: TAP_FLOOR, body: 320 })
  })

  it('takes the floor the page declares when it is given one, since --byd-tap is the real answer', () => {
    localStorage.setItem('byd.widths', JSON.stringify({ [PROJECT]: { title: 30 } }))
    expect(heldWidths(PROJECT, 64)).toEqual({ title: 64 })
  })

  it('still throws away what is not a width at all', () => {
    localStorage.setItem('byd.widths', JSON.stringify({ [PROJECT]: { title: 'bred', body: -5, id: null, antal: 120 } }))
    expect(heldWidths(PROJECT)).toEqual({ antal: 120 })
  })
})
