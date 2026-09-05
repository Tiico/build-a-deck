import { z } from 'zod'

// Identifiers are opaque strings. They are deliberately not branded:
// the engine constructs them freely, and the wire format is plain JSON.
export const ComponentId = z.string().min(1)
export type ComponentId = z.infer<typeof ComponentId>

export const ZoneId = z.string().min(1)
export type ZoneId = z.infer<typeof ZoneId>

export const SeatId = z.string().min(1)
export type SeatId = z.infer<typeof SeatId>

export const FaceId = z.string().min(1)
export type FaceId = z.infer<typeof FaceId>

export const GameVersionId = z.string().min(1)
export type GameVersionId = z.infer<typeof GameVersionId>

export const TypeRef = z.object({ id: z.string().min(1), version: z.number().int().nonnegative() })
export type TypeRef = z.infer<typeof TypeRef>
