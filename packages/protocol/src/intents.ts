import { z } from 'zod'
import { ComponentId, FaceId, GameVersionId, SeatId, TypeRef, ZoneId } from './ids.js'

// A component as a setup lists it. `version.change` carries the whole new list so that the
// line replays without the project it came from (C7).
export const ComponentSpec = z.object({
  type: TypeRef,
  cardRef: z.string().min(1),
  zone: ZoneId,
  face: FaceId,
  x: z.number().optional(),
  y: z.number().optional(),
  rot: z.number().optional(),
  counter: z.number().int().optional(),
})
export type ComponentSpec = z.infer<typeof ComponentSpec>

// A closed vocabulary of what a hand can do to a physical object.
// No game semantics live here. The set is finite because physics is finite;
// adding a verb is a protocol migration and must be treated as one.
//
// `movePile` was added deliberately (K1): picking up a whole pile is one physical act.
export const PhysicalIntent = z.discriminatedUnion('v', [
  z.object({
    v: z.literal('move'),
    component: ComponentId,
    to: ZoneId,
    index: z.number().int().nonnegative().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    rot: z.number().optional(),
  }),
  z.object({ v: z.literal('rotate'), component: ComponentId, rot: z.number() }),
  z.object({ v: z.literal('flip'), component: ComponentId, face: FaceId }),
  // Onto a card lying loose in an area: the two form a new pile there (K1).
  // Onto a card in a pile or hand: joins that zone directly above it.
  z.object({ v: z.literal('stack'), component: ComponentId, onto: ComponentId }),
  // Without `to`, the top `at` components become a new pile at (x, y) in the source pile's area.
  // Without `to`, the top `at` components become a new pile at (x, y) in table coordinates,
  // like movePile and zone geometry; a component's own x/y are relative to its zone.
  z.object({
    v: z.literal('split'),
    pile: ZoneId,
    at: z.number().int().positive(),
    to: ZoneId.optional(),
    x: z.number().optional(),
    y: z.number().optional(),
  }),
  z.object({ v: z.literal('shuffle'), pile: ZoneId }),
  z.object({ v: z.literal('draw'), from: ZoneId, to: ZoneId, count: z.number().int().positive() }),
  z.object({ v: z.literal('deal'), from: ZoneId, to: z.array(ZoneId).min(1), each: z.number().int().positive() }),
  z.object({ v: z.literal('roll'), component: ComponentId }),
  z.object({ v: z.literal('setCounter'), component: ComponentId, value: z.number().int() }),
  z.object({ v: z.literal('peek'), components: z.array(ComponentId).min(1) }),
  z.object({ v: z.literal('showTo'), components: z.array(ComponentId).min(1), seats: z.array(SeatId).min(1) }),
  z.object({ v: z.literal('reveal'), components: z.array(ComponentId).min(1) }),
  z.object({
    v: z.literal('movePile'),
    pile: ZoneId,
    to: ZoneId,
    x: z.number(),
    y: z.number(),
    rot: z.number().optional(),
  }),
])
export type PhysicalIntent = z.infer<typeof PhysicalIntent>

// Session verbs are not physical and are kept apart so the physical set stays honest.
export const SessionIntent = z.discriminatedUnion('v', [
  z.object({ v: z.literal('seat.claim'), seat: SeatId, name: z.string().min(1).max(64) }),
  z.object({ v: z.literal('seat.release'), seat: SeatId }),
  z.object({ v: z.literal('setup.reset') }),
  z.object({ v: z.literal('undo.self') }),
  z.object({ v: z.literal('rewind.propose'), toSeq: z.number().int().nonnegative() }),
  z.object({ v: z.literal('rewind.confirm'), proposal: z.string().min(1) }),
  z.object({ v: z.literal('rewind.reject'), proposal: z.string().min(1) }),
  z.object({ v: z.literal('version.change'), to: GameVersionId, components: z.array(ComponentSpec) }),
  // A flagged moment (G3): a line in the log, with an optional note. `observer` names a
  // watcher (C8), whose flags weigh differently than a player's; the server stamps it.
  z.object({ v: z.literal('flag'), note: z.string().max(280).optional(), observer: z.string().min(1).max(64).optional() }),
  z.object({ v: z.literal('session.end') }),
])
export type SessionIntent = z.infer<typeof SessionIntent>

export const Intent = z.union([PhysicalIntent, SessionIntent])
export type Intent = z.infer<typeof Intent>
