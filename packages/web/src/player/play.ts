import type { Intent, Snapshot, VisibleComponentState } from '@byd/protocol'

// Playing from the hand (K11): into a public zone the card turns face-up, as a hand would; into
// a hidden pile it stays down. Several cards go in one envelope (K3). Used by the phone's sheet
// and by a card dragged out of the hand onto the table (C2). `place` (C4) puts the cards
// underneath a pile instead of on top: each below the one before it.
export function playIntents(view: Snapshot, cards: readonly VisibleComponentState[], zone: string, at?: { x: number; y: number }, place: 'top' | 'bottom' = 'top'): Intent[] {
  const target = view.zones.find((z) => z.id === zone)
  const isPublic = target?.mode === 'order'
  const count = target ? (target.mode === 'count' ? target.count : target.order.length) : 0
  return cards.flatMap((c, i): Intent[] => {
    const move: Intent = { v: 'move', component: c.id, to: zone, ...(at ? { x: at.x, y: at.y } : {}), ...(place === 'bottom' ? { index: count + i } : {}) }
    return isPublic ? [move, { v: 'flip', component: c.id, face: 'front' }] : [move]
  })
}
