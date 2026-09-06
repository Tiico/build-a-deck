import { describe, expect, it } from 'vitest'
import { Harness } from './fixture.js'
import { applyPatch, diff } from '../src/index.js'

describe('seats in the projection', () => {
  it('lists every seat with its name, and a claim reaches the other views as a patch', () => {
    const h = new Harness()
    expect(h.view('B').seats).toEqual([
      { id: 'A', name: null },
      { id: 'B', name: null },
    ])
    const before = h.view('B')
    h.do(null, { v: 'seat.claim', seat: 'A', name: 'Ada' })
    const after = h.view('B')
    expect(after.seats).toEqual([
      { id: 'A', name: 'Ada' },
      { id: 'B', name: null },
    ])
    const patch = diff(before, after)
    expect(patch.ops).toEqual([{ op: 'seat', seat: { id: 'A', name: 'Ada' } }])
    expect(applyPatch(before, patch)).toEqual(after)
  })
})
