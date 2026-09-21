import { describe, expect, it } from 'vitest'
import { scrubbed, SCRUB_PX } from '../src/editor/scrub.js'

// The number that is dragged rather than typed (L25). The arithmetic is the panel's whole grip:
// how far the pointer has travelled, how much of that has been spent, and where the value lands.
// It is framework-free on purpose — a drag is a hundred reports of one doing, and none of them
// should need a document to be tested.

describe('the travel a scrub spends (L25)', () => {
  // Two pixels a step is the prototype's measurement: a pull across the panel's 280 px is a
  // useful range for a millimetre, and a hand that rests still moves nothing.
  it('spends two pixels of travel for one step of the number', () => {
    expect(SCRUB_PX).toBe(2)
    expect(scrubbed(8.5, { travel: 2, step: 0.5 }).value).toBe(9)
    expect(scrubbed(8.5, { travel: 6, step: 0.5 }).value).toBe(10)
  })

  // The pointer reports a pixel at a time, so a step that took three reports must still arrive.
  // What is left over stays on the drag rather than being thrown away at each report.
  it('keeps the travel it could not spend for the next report', () => {
    const first = scrubbed(8.5, { travel: 1, step: 0.5 })
    expect(first.value).toBe(8.5)
    expect(first.rest).toBe(1)
    expect(scrubbed(first.value, { travel: first.rest + 1, step: 0.5 }).value).toBe(9)
  })

  it('counts a pull to the left downwards', () => {
    expect(scrubbed(8.5, { travel: -4, step: 0.5 }).value).toBe(7.5)
  })

  // Shift is ten steps everywhere in the panel (L25), on the grip as in the field.
  it('takes ten steps at a time while Shift is held', () => {
    expect(scrubbed(8.5, { travel: 2, step: 0.5, shift: true }).value).toBe(13.5)
  })

  // A line width steps by a tenth, and a tenth added to a tenth in binary is not a tenth.
  it('lands on a number the panel can show, not on float dust', () => {
    expect(scrubbed(0.1, { travel: 2, step: 0.1 }).value).toBe(0.2)
    expect(scrubbed(0.3, { travel: -2, step: 0.1 }).value).toBe(0.2)
  })

  // A width of minus two millimetres is not a shape, and a share of one is between none and all.
  it('stops at the floor and at the ceiling the number has', () => {
    expect(scrubbed(0.5, { travel: -20, step: 0.5, min: 0 }).value).toBe(0)
    expect(scrubbed(98, { travel: 20, step: 1, min: 0, max: 100 }).value).toBe(100)
  })
})
