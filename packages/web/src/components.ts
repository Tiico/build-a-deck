import { BOARDS, CARD_STANDARD_63x88, DICE, PIECES, TOKEN_COUNTER } from '@byd/engine'
import type { Snapshot, VisibleComponentState } from '@byd/protocol'
import { CHIP_MM, DIE_MM, PIECE_MM, PIECE_PILE_MM } from '@byd/server/felt-sizes'

// What a thing on the table is, as against where it is (`zones.ts`) or how it got there
// (`table/drop.ts`). A component's type is a fact about the component, and the rooms that ask
// about it — the felt, the address, the phone's sheet, a seat's own pills — are four readers of
// one answer and not four answers.
//
// A counter is a component of a type of its own (C4): a value with one face, `stackable: false`
// and `flippable: false`, drawn as a chip rather than as a card. The id is the engine's to own,
// so it is read from `TOKEN_COUNTER` and never written out again here; a copy of a type id is a
// copy that can go stale on its own.
export const isCounter = (c: { type: { id: string } }): boolean => c.type.id === TOKEN_COUNTER.id

// A die (#1136, K28): one type per number of sides, `die.d4` to `die.d20`, its side up kept where a
// counter keeps its value. What the felt, the keyboard and the activity line call it is its kind,
// «d6», the word a table uses; the number of sides is read off the type's own `rollable`, the
// engine's to own, and never off the id's spelling.
const DIE_FACES = new Map(DICE.flatMap((d) => (d.behaviours.rollable === false ? [] : [[d.id, d.behaviours.rollable.faces] as const])))
export const dieFaces = (c: { type: { id: string } }): number | null => DIE_FACES.get(c.type.id) ?? null
export const isDie = (c: { type: { id: string } }): boolean => DIE_FACES.has(c.type.id)
export const dieKind = (c: { type: { id: string } }): string | null => {
  const n = dieFaces(c)
  return n === null ? null : `d${n}`
}

// A wooden piece (#1471): a meeple, a cube or a disc, one type each in the `piece.` family. Its kind
// is what a sentence calls it; its `cardRef` is the seat whose colour it wears (L11), never a name.
const PIECE_KINDS = new Map(PIECES.map((p) => [p.id, p.id.slice('piece.'.length) as PieceKind] as const))
export type PieceKind = 'meeple' | 'cube' | 'disc'
export const pieceKind = (c: { type: { id: string } }): PieceKind | null => PIECE_KINDS.get(c.type.id) ?? null

// The square of the felt a piece of material is drawn in, in the felt's millimetres, its top left
// corner where the table says it lies: a chip's 24, a die's 30, and a wooden piece by its kind
// (#1475). `room` is what it may come to take: a wooden piece can be the top of a pile, drawn as the
// pile's wider chip round the same middle, and what lays a card beside it keeps clear of that.
export function materialBox(c: { x: number; y: number; type: { id: string } }, room = false): { x: number; y: number; w: number; h: number } {
  const kind = pieceKind(c)
  const size = kind !== null ? PIECE_MM[kind] : isDie(c) ? DIE_MM : CHIP_MM
  const drawn = kind !== null && room ? PIECE_PILE_MM : size
  const inset = (drawn - size) / 2
  return { x: c.x - inset, y: c.y - inset, w: drawn, h: drawn }
}

export const isWoodenPiece = (c: { type: { id: string } }): boolean => PIECE_KINDS.has(c.type.id)

// Material, as K32 calls it: what is not a card — a counter, a die or a wooden piece. Never held,
// and never drawn as a card in a row of cards: the phone gives each a place of its own (the
// counters' pills, the dice's sheet), and the felt draws each in its own form.
export const isMaterial = (c: { type: { id: string } }): boolean => isCounter(c) || isDie(c) || isWoodenPiece(c)

// A board (#1479, #1480): the main board or a seat's player board, lying fixed where the setup put it.
// Its size is its type's, the engine's to own. It is no card and no piece: nobody picks it up, so the
// felt draws it under everything and every other reader of the table leaves it out (`withoutBoards`).
const BOARD_MM = new Map(BOARDS.map((b) => [b.id, { w: b.physical.widthMm, h: b.physical.heightMm }] as const))
export const isBoard = (c: { type: { id: string } }): boolean => BOARD_MM.has(c.type.id)
export const boardMm = (c: { type: { id: string } }): { w: number; h: number } | null => BOARD_MM.get(c.type.id) ?? null

// The table as everything but the felt's floor reads it: without its boards (#1480). A board is in
// the zone it lies in, as everything is, but it is not something lying there to count, lay a card
// beside, name with the keyboard or list on the phone (C2): a seat's «Framför» with its player board
// in it and nothing else holds no cards. Handed back as the very object when there is no board.
export function withoutBoards(view: Snapshot): Snapshot {
  const boards = new Set(view.components.filter(isBoard).map((c) => c.id))
  if (boards.size === 0) return view
  const per = new Map<string, number>()
  for (const c of view.components) if (boards.has(c.id)) per.set(c.zone, (per.get(c.zone) ?? 0) + 1)
  return {
    ...view,
    components: view.components.filter((c) => !boards.has(c.id)),
    zones: view.zones.map((z) => {
      const n = per.get(z.id)
      if (!n) return z
      return z.mode === 'order' ? { ...z, order: z.order.filter((id) => !boards.has(id)) } : { ...z, count: Math.max(0, z.count - n) }
    }),
  }
}

// A card the screen shows without the wire having handed it out (K23): a face-down bottom card
// held up to look at. It knows only what the zone said — that there is a card, and the back it
// wears — and it is a standard card because that is the one shape the felt draws a back on. It
// never travels: nothing serialises it, and its id names the place and not a card.
export function standIn(id: string, zone: string, back: string | undefined): VisibleComponentState {
  return { id, type: { id: CARD_STANDARD_63x88.id, version: CARD_STANDARD_63x88.version }, zone, face: 'back', x: 0, y: 0, rot: 0, cardRef: null, ...(back === undefined ? {} : { faces: { back } }) }
}
