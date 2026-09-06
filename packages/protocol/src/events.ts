import { z } from 'zod'
import { ComponentId, SeatId } from './ids.js'
import { Intent } from './intents.js'

// What a client sends. `seat` is null for a `table` connection.
// An envelope carries one or more intents and is atomic (K3): the server validates
// all of them against a working state first, then applies all with consecutive
// seq numbers — or none. Picking up four cards is one act, and the log says so.
export const Envelope = z.object({
  id: z.string().min(1),
  seat: SeatId.nullable(),
  intents: z.array(Intent).min(1),
})
export type Envelope = z.infer<typeof Envelope>

// Randomness is decided on the server and recorded as a *result*, never as a seed.
// This is what makes the log deterministically replayable.
//
// A shuffle re-keys every component in the pile: stable ids would let a player
// track a card they once held through a shuffle, which is knowledge no physical
// shuffle grants. The old→new mapping is recorded for replay and never sent to clients.
export const Outcome = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('shuffle'),
    rekey: z.array(z.tuple([ComponentId, ComponentId])),
    order: z.array(ComponentId),
  }),
  z.object({ kind: z.literal('roll'), value: z.number().int() }),
])
export type Outcome = z.infer<typeof Outcome>

// A single line in the event log. `seq` is monotonic per session and defines order.
// All lines from one envelope share its id as `batch`; undo and rewind treat them as a unit.
export const Applied = z.object({
  seq: z.number().int().nonnegative(),
  batch: z.string().min(1),
  at: z.string(),
  by: SeatId.nullable(),
  intent: Intent,
  outcome: Outcome.optional(),
})
export type Applied = z.infer<typeof Applied>
