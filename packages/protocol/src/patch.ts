import { z } from 'zod'
import { ZoneAction } from './actions.js'
import { ComponentId, FaceId, SeatId, TypeRef, ZoneId } from './ids.js'

// What one seat is allowed to know about one component.
// `cardRef` is the component's identity (which row of the table it is).
// It is null whenever the seat may not see the face — a hidden card is an
// opaque handle with position, rotation and type, and nothing else.
export const VisibleComponentState = z.object({
  id: ComponentId,
  type: TypeRef,
  zone: ZoneId,
  face: FaceId,
  x: z.number(),
  y: z.number(),
  rot: z.number(),
  counter: z.number().int().optional(),
  cardRef: z.string().nullable(),
  // Texture hashes the seat may fetch from /faces/:hash: the back for any visible component,
  // the front only when the face itself is visible. The hash is the capability.
  faces: z.record(FaceId, z.string()).optional(),
})
export type VisibleComponentState = z.infer<typeof VisibleComponentState>

export const ZoneKind = z.enum(['pile', 'area', 'hand'])
export type ZoneKind = z.infer<typeof ZoneKind>

// Where a zone sits on the table, in table millimetres (K2). Piles have a point
// and zero extent; areas and hands have a rectangle a drop can land in.
export const Geometry = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number().nonnegative(),
  h: z.number().nonnegative(),
  rot: z.number(),
})
export type Geometry = z.infer<typeof Geometry>

// The shortcut a zone offers the phone (C4): the verb on the button, apart from the name the
// table shows, and where in a pile a card played there goes. Without one, the name is the verb.
export const ZoneShortcut = z.object({ label: z.string().min(1).max(40), at: z.enum(['top', 'bottom']) })
export type ZoneShortcut = z.infer<typeof ZoneShortcut>

// Which side of a pile "beside it" is (K21, revising #87): where Dra 1, Dela på hälften and an
// action that lays cards beside the pile put them, in the pile's own rotation and turned with it.
// A pile that says nothing means its left — the side free of both its name and its count — which
// is what every pile meant before the designer could say otherwise.
export const ZoneBeside = z.enum(['left', 'right', 'above', 'below'])
export type ZoneBeside = z.infer<typeof ZoneBeside>

const zoneBase = {
  id: ZoneId,
  kind: ZoneKind,
  name: z.string(),
  shortcut: ZoneShortcut.optional(),
  beside: ZoneBeside.optional(),
  // What this zone can be asked for (K14, B5): the designer's own named actions. No secret —
  // they are in the rulebook — so every view gets them as they stand.
  actions: z.array(ZoneAction).optional(),
  owner: SeatId.optional(),
  geometry: Geometry,
  // Created during play by stacking (K1); dissolves when one component remains.
  dynamic: z.boolean(),
  // The pile's bottom card (K23), present when the pile has one and it lies under at least one
  // other card: a lone card is the top and is drawn once. `id` names it when the view may know
  // it — a public pile, or a face-up bottom card, which is public like a face-up top (K15). A
  // face-down bottom card of a hidden pile carries only the back it wears, like `back` does, and
  // never its id, its cardRef or its front.
  bottom: z.object({ id: ComponentId.optional(), back: z.string().optional() }).optional(),
}

// A zone whose order the seat may not see is reported as a count only — except that the card
// lying face-up on top of a pile is seen by everyone at the table (K15), so a hidden pile also
// names its `top` when the top is face-up. That component is then in `components` as usual.
export const ZoneView = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('order'), ...zoneBase, order: z.array(ComponentId) }),
  // `back` is the texture the pile's top card wears on its hidden side (#313). It is the one thing
  // about a face-down pile that is public in the room — a stack of cards shows its back to
  // everybody — and it says nothing about which card that is. The component itself stays out: a
  // hidden pile hands out no id, no position and no rotation (K15), so the back travels here.
  z.object({ mode: z.literal('count'), ...zoneBase, count: z.number().int().nonnegative(), top: ComponentId.optional(), back: z.string().optional() }),
])
export type ZoneView = z.infer<typeof ZoneView>

// Which edge of the table a seat sits at (K12). It is a fact about the seat — where you will
// sit — and not about the felt, which is why the seat picker may know it while it is still shown
// no zones at all.
export const SeatEdge = z.enum(['N', 'E', 'S', 'W'])
export type SeatEdge = z.infer<typeof SeatEdge>

// A seat as every view sees it: who sits there, or null while it is free, and which edge it is
// at, or null when the table gives it none.
export const SeatView = z.object({ id: SeatId, name: z.string().nullable(), edge: SeatEdge.nullable() })
export type SeatView = z.infer<typeof SeatView>

// A rewind waiting for someone else at the table to confirm it (B). `id` is the batch of the
// proposing envelope; `by` is the proposer; `toSeq` is the line the table would return to.
// `preview` is the table as it was at `toSeq`, projected for this very view (B, C): what the
// view could see then, and nothing it could not.
export const TablePreview = z.object({ zones: z.array(ZoneView), components: z.array(VisibleComponentState) })
export type TablePreview = z.infer<typeof TablePreview>
export const RewindProposal = z.object({
  id: z.string().min(1),
  toSeq: z.number().int().nonnegative(),
  by: SeatId.nullable(),
  preview: TablePreview.optional(),
})
export type RewindProposal = z.infer<typeof RewindProposal>

// What undo.self would do for this seat right now: the seq it would return to, and whether
// someone else has acted since (then a rewind proposal to that seq is the way). Null when
// there is nothing to undo, and always for the table.
export const UndoMeaning = z.object({ toSeq: z.number().int().nonnegative(), contested: z.boolean() }).nullable()
export type UndoMeaning = z.infer<typeof UndoMeaning>

export const Snapshot = z.object({
  seq: z.number().int().nonnegative(),
  seat: SeatId.nullable(),
  // The background area (K1/K2): what a drop outside every zone lands in, and the table bounds.
  floor: ZoneId,
  seats: z.array(SeatView),
  zones: z.array(ZoneView),
  components: z.array(VisibleComponentState),
  rewind: RewindProposal.nullable(),
  undo: UndoMeaning,
  // The log is locked (C9): nothing more happens at this table.
  ended: z.boolean(),
})
export type Snapshot = z.infer<typeof Snapshot>

export const Op = z.discriminatedUnion('op', [
  z.object({ op: z.literal('upsert'), state: VisibleComponentState }),
  z.object({ op: z.literal('remove'), component: ComponentId }),
  z.object({ op: z.literal('zone'), view: ZoneView }),
  z.object({ op: z.literal('zoneRemove'), zone: ZoneId }),
  z.object({ op: z.literal('seat'), seat: SeatView }),
  z.object({ op: z.literal('rewind'), proposal: RewindProposal.nullable() }),
  z.object({ op: z.literal('undo'), undo: UndoMeaning }),
  z.object({ op: z.literal('ended'), ended: z.boolean() }),
])
export type Op = z.infer<typeof Op>

export const Patch = z.object({ seq: z.number().int().nonnegative(), ops: z.array(Op) })
export type Patch = z.infer<typeof Patch>
