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
})
export type VisibleComponentState = z.infer<typeof VisibleComponentState>

export const ZoneKind = z.enum(['pile', 'area', 'hand'])
export type ZoneKind = z.infer<typeof ZoneKind>

// A zone whose order the seat may not see is reported as a count only.
export const ZoneView = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('order'),
    id: ZoneId,
    kind: ZoneKind,
    name: z.string(),
    owner: SeatId.optional(),
    order: z.array(ComponentId),
  }),
  z.object({
    mode: z.literal('count'),
    id: ZoneId,
    kind: ZoneKind,
    name: z.string(),
    owner: SeatId.optional(),
    count: z.number().int().nonnegative(),
  }),
])
export type ZoneView = z.infer<typeof ZoneView>

export const Snapshot = z.object({
  seq: z.number().int().nonnegative(),
  seat: SeatId.nullable(),
  zones: z.array(ZoneView),
  components: z.array(VisibleComponentState),
})
export type Snapshot = z.infer<typeof Snapshot>

export const Op = z.discriminatedUnion('op', [
  z.object({ op: z.literal('upsert'), state: VisibleComponentState }),
  z.object({ op: z.literal('remove'), component: ComponentId }),
  z.object({ op: z.literal('zone'), view: ZoneView }),
])
export type Op = z.infer<typeof Op>

export const Patch = z.object({ seq: z.number().int().nonnegative(), ops: z.array(Op) })
export type Patch = z.infer<typeof Patch>
