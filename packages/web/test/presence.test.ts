import { describe, expect, it } from 'vitest'
import { CURSOR_IDLE_MS, PULSE_MS, emptyPresence, prunePresence, reducePresence } from '../src/table/presence.js'

const name = (seat: string | null) => (seat === null ? 'bordet' : seat === 'A' ? 'Ada' : seat)
const bo = { seat: 'B', id: 'c1' }

describe('presence state (K6)', () => {
  it('tracks each connection\'s cursor and carried card, drops it when both are gone, and keeps pointing pulses apart', () => {
    let s = emptyPresence()
    s = reducePresence(s, bo, { kind: 'cursor', x: 1, y: 2 }, 1000, name)
    expect(s.peers['c1']).toMatchObject({ seat: 'B', name: 'B', cursor: { x: 1, y: 2 }, drag: null })
    s = reducePresence(s, bo, { kind: 'drag', component: 'c9', x: 5, y: 6 }, 1100, name)
    s = reducePresence(s, bo, { kind: 'away' }, 1200, name)
    expect(s.peers['c1']).toMatchObject({ cursor: null, drag: { component: 'c9' } })
    s = reducePresence(s, bo, { kind: 'drop' }, 1300, name)
    expect(s.peers['c1']).toBeUndefined()
    s = reducePresence(s, { seat: null, id: 't1' }, { kind: 'point', x: 0, y: 0 }, 1400, name)
    expect(s.pulses).toEqual([{ id: 't1', seat: null, name: 'bordet', x: 0, y: 0, at: 1400 }])
    expect(s.peers['t1']).toBeUndefined()
  })

  it('prunes idle cursors and spent pulses, but never a card someone is still carrying', () => {
    let s = emptyPresence()
    s = reducePresence(s, bo, { kind: 'cursor', x: 1, y: 2 }, 1000, name)
    s = reducePresence(s, { seat: 'A', id: 'c2' }, { kind: 'drag', component: 'c9', x: 5, y: 6 }, 1000, name)
    s = reducePresence(s, bo, { kind: 'point', x: 0, y: 0 }, 1000, name)
    const later = prunePresence(s, 1000 + CURSOR_IDLE_MS + 1)
    expect(later.peers['c1']).toBeUndefined()
    expect(later.peers['c2']).toMatchObject({ name: 'Ada', drag: { component: 'c9' } })
    expect(prunePresence(s, 1000 + PULSE_MS - 1).pulses).toHaveLength(1)
    expect(later.pulses).toHaveLength(0)
  })
})
