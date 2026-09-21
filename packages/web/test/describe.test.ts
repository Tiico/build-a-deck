import { describe, expect, it } from 'vitest'
import type { Activity, Snapshot } from '@byd/protocol'
import { describeActivity } from '../src/table/describe.js'
import { translate } from '../src/i18n/index.js'

// What the log says about a hand (K19, #86): a hand is named by whoever sits there — "Adas hand",
// and "min hand" on that seat's own phone — never by the designer's zone name `Hand`, which
// would leave the sentence without its owner.
const rect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h, rot: 0 })

function table(seat: string | null): Snapshot {
  return {
    seq: 1,
    seat,
    floor: 'table',
    seats: [
      { id: 'A', name: 'Ada', edge: 'S' },
      { id: 'B', name: 'Bo', edge: 'N' },
    ],
    zones: [
      { mode: 'order', id: 'table', kind: 'area', name: 'Spelyta', geometry: rect(-600, -400, 1200, 800), dynamic: false, order: [] },
      { mode: 'order', id: 'front:A', kind: 'area', name: 'Framför A', owner: 'A', geometry: rect(-250, 230, 500, 100), dynamic: false, order: [] },
      { mode: 'count', id: 'draw', kind: 'pile', name: 'Draghög', geometry: rect(-140, 0, 0, 0), dynamic: false, count: 5 },
      { mode: 'count', id: 'hand:A', kind: 'hand', name: 'Hand', owner: 'A', geometry: rect(-250, 340, 500, 60), dynamic: false, count: 2 },
      { mode: 'count', id: 'hand:B', kind: 'hand', name: 'Hand', owner: 'B', geometry: rect(-250, -400, 500, 60), dynamic: false, count: 2 },
    ],
    components: [],
  } as unknown as Snapshot
}

const moveToHand = (to: string): Activity => ({ seq: 7, by: 'A', at: '2026-09-13T00:00:00.000Z', intent: { v: 'move', component: 'c1', to } } as Activity)
const sv = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) => translate('sv', key, params)
const en = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) => translate('en', key, params)

describe('the log names a hand by whoever sits there (K19, #86)', () => {
  it('says "Adas hand" to a reader with no seat, the TV', () => {
    expect(describeActivity(moveToHand('hand:A'), table(null), sv)).toBe('Ada flyttade ett kort till Adas hand')
    expect(describeActivity(moveToHand('hand:A'), table(null), en)).toBe('Ada moved a card to Ada’s hand')
  })

  it('says "min hand" on the phone of the seat that owns it, and lowercase mid-sentence', () => {
    expect(describeActivity(moveToHand('hand:A'), table('A'), sv)).toBe('Ada flyttade ett kort till min hand')
    expect(describeActivity(moveToHand('hand:A'), table('A'), en)).toBe('Ada moved a card to my hand')
    // Another seat's hand is still named by its owner on my phone.
    expect(describeActivity(moveToHand('hand:B'), table('A'), sv)).toBe('Ada flyttade ett kort till Bos hand')
  })

  it('leaves every other zone with the name its designer gave it, untranslated', () => {
    expect(describeActivity(moveToHand('front:A'), table('A'), sv)).toBe('Ada flyttade ett kort till Framför A')
    expect(describeActivity(moveToHand('front:A'), table('A'), en)).toBe('Ada moved a card to Framför A')
    const shuffle: Activity = { seq: 8, by: 'A', at: '2026-09-13T00:00:00.000Z', intent: { v: 'shuffle', pile: 'draw' } } as Activity
    expect(describeActivity(shuffle, table(null), en)).toBe('Ada shuffled Draghög')
  })
})

// The two moves `split` carries (#421). The protocol's verb is physical and closed — the top `at`
// components leave the pile — so the two things a player recognises, drawing a card and cutting a
// pile, are told apart here, where the line is written, by the `to` the intent already carries.
const splitTo = (to: string, at = 1): Activity =>
  ({ seq: 9, by: 'A', at: '2026-09-21T00:00:00.000Z', intent: { v: 'split', pile: 'draw', at, to } } as Activity)
const splitBeside = (at: number): Activity =>
  ({ seq: 10, by: 'A', at: '2026-09-21T00:00:00.000Z', intent: { v: 'split', pile: 'draw', at, x: 40, y: 0 } } as Activity)

describe('the log tells a drawn card from a cut pile (#421)', () => {
  it('gives a card drawn to a hand the verb the button and the ring use', () => {
    expect(describeActivity(splitTo('hand:A'), table(null), sv)).toBe('Ada drog 1 från Draghög till Adas hand')
    expect(describeActivity(splitTo('hand:A'), table(null), en)).toBe('Ada drew 1 from Draghög to Ada’s hand')
  })

  it('says a pile cut in half became a new pile, not a drawn card', () => {
    expect(describeActivity(splitBeside(3), table(null), sv)).toBe('Ada delade av 3 från Draghög till en ny hög')
    expect(describeActivity(splitBeside(3), table(null), en)).toBe('Ada split 3 off Draghög into a new pile')
  })

  it('gives the two moves two lines, and neither says which card it was', () => {
    // The same pile, the same count: only `to` separates them, and the reader must still be able to.
    // The card the draw reached for rides along in `which`; the line must not pass it on.
    const drawn = { ...splitTo('hand:A', 3), intent: { v: 'split', pile: 'draw', at: 3, to: 'hand:A', which: [{ field: 'Typ', is: ['Drake'] }] } } as unknown as Activity
    const cut = splitBeside(3)
    for (const t of [sv, en]) {
      const lines = [describeActivity(drawn, table('A'), t), describeActivity(cut, table('A'), t)]
      expect(lines[0]).not.toBe(lines[1])
      for (const line of lines) {
        expect(line).toContain('Ada')
        expect(line).toContain('Draghög')
        expect(line).not.toContain('Drake')
        expect(line).not.toContain('Typ')
      }
    }
    expect(describeActivity(drawn, table('A'), sv)).toBe('Ada drog 3 från Draghög till min hand')
  })
})
