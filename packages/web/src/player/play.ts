import type { Intent, Snapshot, VisibleComponentState } from '@byd/protocol'

// Playing from the hand (K11): into a public zone the card turns face-up, as a hand would; into
// a hidden pile it stays down. Several cards go in one envelope (K3). Used by the phone's sheet
// and by a card dragged out of the hand onto the table (C2).
export function playIntents(view: Snapshot, cards: readonly VisibleComponentState[], zone: string, at?: { x: number; y: number }): Intent[] {
  const isPublic = view.zones.find((z) => z.id === zone)?.mode === 'order'
  return cards.flatMap((c): Intent[] => {
    const move: Intent = { v: 'move', component: c.id, to: zone, ...(at ? { x: at.x, y: at.y } : {}) }
    return isPublic ? [move, { v: 'flip', component: c.id, face: 'front' }] : [move]
  })
}
