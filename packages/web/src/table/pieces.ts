import type { Snapshot, VisibleComponentState } from '@byd/protocol'
import { pieceKind } from '../components.js'

// What has not been moved yet (#1475, prototype #1472 felt B): a seat's standing pieces of one kind
// that lie on one spot are one pile, drawn as one chip with the figure and the count, and one stop
// for the keyboard — the top one, which is the one a drag takes out of it. It is the counters' pile
// (#89) said of wood: read off where the pieces lie and never off how many there are, so a piece
// dragged out is its own silhouette the moment the table says where it went, and the engine and the
// log know nothing of piles, only the `move` every piece travels by. A piece laid down always lies
// by itself, as it does on a real table.
//
// The felt and the keyboard both ask this, so the chip the eye sees and the stop the keys land on
// are the same thing. `apart` are pieces drawn by themselves whatever they lie on: the one in the
// hand while it is dragged out, so the pile stays put with one fewer.
export type PiecePile = { top: VisibleComponentState; ids: string[] }

export function piecePiles(view: Snapshot, apart: ReadonlySet<string> = new Set()): Map<string, PiecePile> {
  const areas = new Set(view.zones.filter((z) => z.kind === 'area').map((z) => z.id))
  const bySpot = new Map<string, VisibleComponentState[]>()
  for (const c of view.components) {
    const kind = pieceKind(c)
    if (kind === null || !areas.has(c.zone) || apart.has(c.id) || c.face === 'lying') continue
    const spot = `${c.zone}@${Math.round(c.x)},${Math.round(c.y)}|${kind}|${c.cardRef ?? ''}`
    bySpot.set(spot, [...(bySpot.get(spot) ?? []), c])
  }
  // Every piece in a pile answers with the pile; the last drawn is the top, as on the felt.
  const out = new Map<string, PiecePile>()
  for (const pieces of bySpot.values()) {
    const top = pieces[pieces.length - 1]
    if (!top || pieces.length < 2) continue
    const pile = { top, ids: pieces.map((c) => c.id) }
    for (const c of pieces) out.set(c.id, pile)
  }
  return out
}
