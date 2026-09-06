import { describe, expect, it } from 'vitest'
import { Harness, registry, twoSeatSetup } from './fixture.js'
import { initialState } from '../src/index.js'

const rejected = (d: ReturnType<Harness['try']>) => (d.ok ? null : d.reason)

describe('structural validation (never rules)', () => {
  it('rejects drawing more than a zone holds', () => {
    const h = new Harness()
    expect(rejected(h.try('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 11 }))).toMatch(/fewer than 11/)
  })

  it('rejects a peek from the table connection', () => {
    const h = new Harness()
    h.do(null, { v: 'draw', from: 'draw', to: 'table', count: 1 })
    expect(rejected(h.try(null, { v: 'peek', components: [h.top('table')] }))).toMatch(/table connection cannot peek/)
  })

  it('rejects flipping to a face the type does not have', () => {
    const h = new Harness()
    h.do(null, { v: 'draw', from: 'draw', to: 'table', count: 1 })
    expect(rejected(h.try(null, { v: 'flip', component: h.top('table'), face: 'side' }))).toMatch(/no face side/)
  })

  it('rejects claiming a claimed seat and releasing an unclaimed one', () => {
    const h = new Harness()
    expect(rejected(h.try(null, { v: 'seat.release', seat: 'A' }))).toMatch(/not claimed/)
    h.do(null, { v: 'seat.claim', seat: 'A', name: 'Ada' })
    expect(rejected(h.try(null, { v: 'seat.claim', seat: 'A', name: 'Al' }))).toMatch(/already claimed/)
  })

  it('only the seat itself or the table may release a seat', () => {
    const h = new Harness()
    h.do(null, { v: 'seat.claim', seat: 'A', name: 'Ada' })
    expect(rejected(h.try('B', { v: 'seat.release', seat: 'A' }))).toMatch(/only the seat itself/)
    expect(h.try('A', { v: 'seat.release', seat: 'A' }).ok).toBe(true)
    expect(h.try(null, { v: 'seat.release', seat: 'A' }).ok).toBe(true)
  })

  it('rejects an envelope from an unknown seat', () => {
    const h = new Harness()
    expect(rejected(h.try('Z', { v: 'shuffle', pile: 'draw' }))).toMatch(/unknown seat Z/)
  })

  it('rejects everything after session.end', () => {
    const h = new Harness()
    h.do(null, { v: 'session.end' })
    expect(rejected(h.try(null, { v: 'shuffle', pile: 'draw' }))).toMatch(/ended/)
  })

  it('names the verbs the thin slice does not implement', () => {
    const h = new Harness()
    expect(rejected(h.try('A', { v: 'undo.self' }))).toMatch(/not implemented/)
    expect(rejected(h.try('A', { v: 'rewind.propose', toSeq: 0 }))).toMatch(/not implemented/)
  })

  it('does not enforce game rules: a seat may draw into another seat\'s hand', () => {
    const h = new Harness()
    expect(h.try('A', { v: 'draw', from: 'draw', to: 'hand:B', count: 1 }).ok).toBe(true)
  })
})

describe('setup validation', () => {
  it('requires hands to have an owner and a returnTo', () => {
    const s = twoSeatSetup()
    delete s.zones[3]!.returnTo
    expect(() => initialState('v1', s, registry)).toThrow(/needs returnTo/)
  })

  it('requires all hands of one seat to return to the same pile', () => {
    const s = twoSeatSetup()
    s.zones.push({
      id: 'hand2:A',
      kind: 'hand',
      name: 'Hand 2',
      visibility: 'owner',
      owner: 'A',
      returnTo: 'discard',
      geometry: { x: 0, y: 0, w: 100, h: 100, rot: 0 },
    })
    expect(() => initialState('v1', s, registry)).toThrow(/returning to both/)
  })

  it('rejects a component placed in an unknown zone', () => {
    const s = twoSeatSetup()
    s.components[0]!.zone = 'nowhere'
    expect(() => initialState('v1', s, registry)).toThrow(/unknown zone nowhere/)
  })
})
