// Stored template data, read into the shape this version of the tool reads (#221, L22, beslut 3).
// It takes a template, or any document holding one, and gives back the same thing with every
// measure in it lifted — so the server can hand it a whole project record at the door rather than
// knowing where inside one a template can sit.
//
// `anchor` is retired, and retiring a field is a schema change with a migration rather than a
// silent divergence: the schema below refuses a template that still names one, so nothing can
// drop the field quietly on the way in, and this is the one door a document written before the
// retirement comes through. It is the upcaster DRIFT §7 describes, for the one thing in a
// template that has ever needed one.
//
// It is a pure function over the stored JSON and it runs on the way in, not once over a database:
// a project's history is written once and never rewritten (B4), so every old version has to go on
// reading, and a migration that only touched today's row would leave yesterday's unreadable.
//
// What is lost is said out loud rather than left to be discovered. A measure placed the drawing
// in the middle of its window or standing on a line shared by the whole deck, and the two differ
// only where the window was held by its width — a drawing wider than its frame leaves vertical air
// over, and the ground line put all of it above the drawing instead of splitting it. Every other
// card, including every card of a deck that never left the centre, is drawn exactly where it was.
// A card that truly wants the old placement says so on its own row, which is what beslut 2's
// exception is for.

// Whether a value is a plain JSON object, which is the only thing here that can hold a measure.
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

export function liftTemplate<T>(template: T): T {
  return lift(template) as T
}

function lift(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(lift)
  if (!isRecord(value)) return value
  const out: Record<string, unknown> = {}
  for (const [key, v] of Object.entries(value)) {
    // The measure is the one place an anchor was ever written. Naming the key rather than
    // hunting the word means nothing else in a document can lose a field that happens to share
    // its name.
    out[key] = key === 'frame' && isRecord(v) && 'anchor' in v ? withoutAnchor(v) : lift(v)
  }
  return out
}

function withoutAnchor(frame: Record<string, unknown>): Record<string, unknown> {
  const { anchor: _anchor, ...rest } = frame
  return rest
}
