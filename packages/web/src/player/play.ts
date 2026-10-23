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
//
// A card in `turned` was turned over in the hand (#1133, beslut A) and is played face down
// wherever it goes: K11's second choice. It turns while it is still in the hand, where nobody else
// sees it, so it never lies face up in a public zone even for the length of an envelope. In front
// of the seat herself it is still hers to know, as a card she turns down there is (#483); anywhere
// else no knowledge follows the card (B6).
export function playIntents(view: Snapshot, cards: readonly VisibleComponentState[], zone: string, at?: { x: number; y: number }, place: 'top' | 'bottom' = 'top', turned: ReadonlySet<string> = new Set()): Intent[] {
  const target = view.zones.find((z) => z.id === zone)
  const isPublic = target?.mode === 'order'
  const count = target ? (target.mode === 'count' ? target.count : target.order.length) : 0
  return cards.flatMap((c, i): Intent[] => {
    const laid = at === undefined ? laidIn(view, zone, i) : null
    const where = at ? { x: at.x, y: at.y } : laid ? { x: laid.x, y: laid.y } : {}
    const order = laid ? { index: laid.index } : place === 'bottom' ? { index: count + i } : {}
    const move: Intent & { v: 'move' } = { v: 'move', component: c.id, to: zone, ...where, ...order }
    if (turned.has(c.id)) return faceDown(view, c, move)
    return isPublic ? [move, { v: 'flip', component: c.id, face: 'front' }] : [move]
  })
}

// A card turned over in the hand, played (#1133): turned face down while it is still in the hand,
// then moved, and peeked at when it lands in front of the seat herself (#483). The one rule for
// every way a hand plays — the phone's buttons and sheet, the fan dragged onto the felt, and the
// address panel behind Enter.
export function faceDown(view: Snapshot, c: Pick<VisibleComponentState, 'id' | 'face'>, move: Intent & { v: 'move' }): Intent[] {
  const target = view.zones.find((z) => z.id === move.to)
  const mine = target?.kind === 'area' && target.owner === view.seat
  const down: Intent[] = c.face === 'back' ? [] : [{ v: 'flip', component: c.id, face: 'back' }]
  return [...down, move, ...(mine ? [{ v: 'peek' as const, components: [c.id] }] : [])]
}
