import { describe, expect, it } from 'vitest'
import { Presence } from '@byd/protocol'
import { CURSOR_IDLE_MS, PULSE_MS, SHOW_MS, emptyPresence, prunePresence, reducePresence, shownCard } from '../src/table/presence.js'
import { buildScene } from './scene.js'

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

// «Visa för alla» (#508, K26): a phone holds a public card up on the room's screen. It is presence
// and not a log line — it changes nothing on the table, and a replay has nothing to say about it.
describe('a card shown for everyone (K6, K8, #508)', () => {
  it('is a presence message that names one component', () => {
    expect(Presence.safeParse({ kind: 'show', component: 'c7' }).success).toBe(true)
    expect(Presence.safeParse({ kind: 'show' }).success).toBe(false)
  })

  it('remembers the latest card shown and who showed it, without drawing a cursor for them', () => {
    let s = emptyPresence()
    expect(s.shown).toBeNull()
    s = reducePresence(s, { seat: 'A', id: 'p1' }, { kind: 'show', component: 'c7' }, 1000, name)
    expect(s.shown).toEqual({ component: 'c7', seat: 'A', name: 'Ada', at: 1000 })
    expect(s.peers['p1']).toBeUndefined()
    s = reducePresence(s, bo, { kind: 'show', component: 'c8' }, 2000, name)
    expect(s.shown).toEqual({ component: 'c8', seat: 'B', name: 'B', at: 2000 })
  })

  it('takes it down by itself once it has stood for its time', () => {
    const s = reducePresence(emptyPresence(), bo, { kind: 'show', component: 'c8' }, 1000, name)
    expect(prunePresence(s, 1000 + SHOW_MS - 1).shown).not.toBeNull()
    expect(prunePresence(s, 1000 + SHOW_MS).shown).toBeNull()
  })

  // The screen shows only what it can already see. A phone can name any id, so the TV looks the
  // card up in its own snapshot and draws it only when that snapshot carries its face: a card in
  // a hand or face down stays what it is, whatever a message says (hidden information, C3).
  it('is drawn only when the screen itself sees the card face up', () => {
    const { view } = buildScene()
    const table = view(null)
    const up = table.components.find((c) => c.zone === 'table' && c.cardRef !== null)!
    const down = table.components.find((c) => c.zone === 'table' && c.cardRef === null)!
    // A card in Ada's hand, known by its id to Ada's own view and to no one else's.
    const held = view('A').components.find((c) => c.zone === 'hand:A' && c.cardRef !== null)!
    const at = (component: string) => ({ component, seat: 'A', name: 'Ada', at: 1 })
    expect(shownCard(table, at(up.id))?.id).toBe(up.id)
    expect(shownCard(table, at(down.id))).toBeNull()
    expect(shownCard(table, at(held.id))).toBeNull()
    expect(shownCard(table, at('nothing'))).toBeNull()
    expect(shownCard(table, null)).toBeNull()
  })
})
