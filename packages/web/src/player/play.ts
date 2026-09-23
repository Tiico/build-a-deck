import type { Intent, Snapshot, VisibleComponentState } from '@byd/protocol'
import { laidIn } from '../table/lay.js'

// Playing from the hand (K11): into a public zone the card turns face-up, as a hand would; into
// a hidden pile it stays down. Several cards go in one envelope (K3). Used by the phone's sheet
// and by a card dragged out of the hand onto the table (C2). `place` (C4) puts the cards
// underneath a pile instead of on top: each below the one before it.
//
// An area nobody pointed in lays the card out itself (L47): `laidIn` answers both where it lands
// and what it lands on top of, because the two are one question. `place` is then a pile's word
// and a pile's alone — which is all the sheet ever showed it as, since a target that is not a pile
// says «var du vill» and nothing about top or bottom. A point that *was* given — a card dragged
// out of the hand onto the felt — keeps it: the rule is for when nobody pointed.
export function playIntents(view: Snapshot, cards: readonly VisibleComponentState[], zone: string, at?: { x: number; y: number }, place: 'top' | 'bottom' = 'top'): Intent[] {
  const target = view.zones.find((z) => z.id === zone)
  const isPublic = target?.mode === 'order'
  const count = target ? (target.mode === 'count' ? target.count : target.order.length) : 0
  return cards.flatMap((c, i): Intent[] => {
    const laid = at === undefined ? laidIn(view, zone, i) : null
    const where = at ? { x: at.x, y: at.y } : laid ? { x: laid.x, y: laid.y } : {}
    const order = laid ? { index: laid.index } : place === 'bottom' ? { index: count + i } : {}
    const move: Intent = { v: 'move', component: c.id, to: zone, ...where, ...order }
    return isPublic ? [move, { v: 'flip', component: c.id, face: 'front' }] : [move]
  })
}
