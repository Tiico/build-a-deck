// Stored template data, read into the shape this version of the tool reads (#221, L22, beslut 3).
// It takes a template, or any document holding one, and gives back the same thing with every
// measure in it lifted — so the server can hand it a whole project record at the door rather than
// knowing where inside one a template can sit.
//
// `anchor` is retired, and retiring a field is a schema change with a migration rather than a
// silent divergence: the schema below refuses a template that still names one, so nothing can
// drop the field quietly on the way in, and this is the one door a document written before the
// retirement comes through. It is the upcaster DRIFT §7 describes, for the two things in a
// template that have needed one: the anchor, and the starter frames' square picture (#1238,
// further down).
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
  // A face is the one thing with a base and its variants, and the one place a starter frame's
  // picture stands.
  return Array.isArray(out['base']) && isRecord(out['variants']) ? withRoundedStarterPicture(out) : out
}

// The starter frames' picture before #1224 (#1238). Classic and dark gave the picture square
// corners on a plate rounded 2 mm, and in classic the square corners were drawn out over the frame
// line's curve. #1224 rounded the picture in the frames, which only reaches games made after it, and
// a version is never rewritten (B4), so the games made before it are lifted here instead, on every
// read of every version, exactly as the anchor is.
//
// Only the frame's own geometry, untouched, is lifted: the picture where the frame put it, at the
// size it gave it and with no radius of its own, on the frame's plate at the frame's 2 mm, and in
// classic inside the frame's line as the frame drew it. Whatever the designer moved, resized,
// rounded or redrew is hers, and is read as she left it. What comes out is what the frame makes
// today (`packages/web/src/wizard/frames.ts`), which `frame-art-corners.test.ts` holds the two to.
type Box = { x: number; y: number; w: number; h: number }
type Starter = { picture: Box; line?: Box & { strokeMm: number; radiusMm: number }; radiusMm: number }
const OLD_PLATE_MM = 2
const STARTERS: Starter[] = [
  // Classic: rounded round the same centre as the line's inner edge, 0.4 mm inside it.
  { picture: { x: 4, y: 4, w: 55, h: 36 }, line: { x: 3, y: 3, w: 57, h: 82, strokeMm: 0.6, radiusMm: 3 }, radiusMm: 2.3 },
  // Dark: as its plate is.
  { picture: { x: 3, y: 3, w: 57, h: 48 }, radiusMm: 2 },
]

const sameBox = (el: Record<string, unknown>, box: Box) => el['x'] === box.x && el['y'] === box.y && el['w'] === box.w && el['h'] === box.h
const squarePicture = (el: unknown, s: Starter): el is Record<string, unknown> =>
  isRecord(el) && el['kind'] === 'image' && el['id'] === 'art' && sameBox(el, s.picture) && el['radiusMm'] === undefined
const oldPlate = (el: unknown, s: Starter): el is Record<string, unknown> =>
  isRecord(el) && el['kind'] === 'shape' && el['id'] === 'artbg' && el['shape'] === 'rect' && sameBox(el, s.picture) && el['radiusMm'] === OLD_PLATE_MM
const frameLine = (el: unknown, line: NonNullable<Starter['line']>) =>
  isRecord(el) && el['kind'] === 'shape' && el['id'] === 'frame' && el['shape'] === 'rect' && sameBox(el, line) && el['strokeMm'] === line.strokeMm && el['radiusMm'] === line.radiusMm

function withRoundedStarterPicture(face: Record<string, unknown>): Record<string, unknown> {
  const base = face['base'] as unknown[]
  const lined = (s: Starter) => {
    const line = s.line
    return line === undefined || base.some((el) => frameLine(el, line))
  }
  const starter = STARTERS.find((s) => base.some((el) => squarePicture(el, s)) && base.some((el) => oldPlate(el, s)) && lined(s))
  if (!starter) return face
  const round = (el: unknown) => (squarePicture(el, starter) || oldPlate(el, starter) ? { ...el, radiusMm: starter.radiusMm } : el)
  // A group's copy of the picture or its plate is the frame's too while it stands where the frame
  // put it: a variant that only binds another column keeps the frame's corners with it.
  const variants = Object.fromEntries(
    Object.entries(face['variants'] as Record<string, unknown>).map(([name, v]) =>
      isRecord(v) && Array.isArray(v['override']) ? [name, { ...v, override: v['override'].map(round) }] : [name, v],
    ),
  )
  return { ...face, base: base.map(round), variants }
}

function withoutAnchor(frame: Record<string, unknown>): Record<string, unknown> {
  const { anchor: _anchor, ...rest } = frame
  return rest
}
