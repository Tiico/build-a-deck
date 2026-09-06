import { z } from 'zod'
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

const zoneBase = {
  id: ZoneId,
  kind: ZoneKind,
  name: z.string(),
  owner: SeatId.optional(),
  geometry: Geometry,
  // Created during play by stacking (K1); dissolves when one component remains.
  dynamic: z.boolean(),
}

// A zone whose order the seat may not see is reported as a count only — except that the card
// lying face-up on top of a pile is seen by everyone at the table (K15), so a hidden pile also
// names its `top` when the top is face-up. That component is then in `components` as usual.
export const ZoneView = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('order'), ...zoneBase, order: z.array(ComponentId) }),
  z.object({ mode: z.literal('count'), ...zoneBase, count: z.number().int().nonnegative(), top: ComponentId.optional() }),
])
export type ZoneView = z.infer<typeof ZoneView>

// A seat as every view sees it: who sits there, or null while it is free.
export const SeatView = z.object({ id: SeatId, name: z.string().nullable() })
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
