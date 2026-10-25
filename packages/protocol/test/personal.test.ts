import { describe, expect, it } from 'vitest'
import { z as zod, type z } from 'zod'
import { IMPERSONAL_FIELDS, Intent, NOTE_MAX, Outcome, PERSONAL_FIELDS, REDACTED } from '../src/index.js'

// The map in #1269 as a gate (#1276): every field of a log line that can carry a string is either a
// person's own words, listed once in `PERSONAL_FIELDS`, or said not to be, in `IMPERSONAL_FIELDS`.
// A field added to an intent or an outcome without either turns this red before it reaches the log,
// the corpus or the backups.

type Def = { type: string; shape?: Record<string, z.ZodType>; element?: z.ZodType; innerType?: z.ZodType; options?: z.ZodType[]; items?: z.ZodType[]; keyType?: z.ZodType; valueType?: z.ZodType; in?: z.ZodType; out?: z.ZodType }
const defOf = (schema: z.ZodType): Def => (schema as unknown as { _zod: { def: Def } })._zod.def

// Whether a value of this schema can hold a string anywhere in it — as a value, a record's key, or
// behind `unknown`, which can hold anything.
function holdsText(schema: z.ZodType): boolean {
  const def = defOf(schema)
  switch (def.type) {
    case 'string':
    case 'unknown':
    case 'any':
      return true
    case 'number':
    case 'int':
    case 'boolean':
    case 'literal':
    case 'enum':
      return false
    case 'optional':
    case 'nullable':
    case 'default':
    case 'readonly':
      return holdsText(def.innerType!)
    case 'array':
      return holdsText(def.element!)
    case 'tuple':
      return def.items!.some(holdsText)
    case 'union':
      return def.options!.some(holdsText)
    case 'record':
      return true
    case 'object':
      return Object.values(def.shape!).some(holdsText)
    case 'pipe':
      return holdsText(def.in!) || holdsText(def.out!)
    default:
      throw new Error(`the walk does not know a zod ${def.type}; teach it before trusting its answer`)
  }
}

// Every field of every intent and outcome that can hold text, as `<verb>.<field>` and
// `outcome:<kind>.<field>`.
function textFields(intent: z.ZodType = Intent, outcome: z.ZodType = Outcome): string[] {
  const out: string[] = []
  const options = (union: z.ZodType): z.ZodType[] => defOf(union).options!.flatMap((o) => (defOf(o).type === 'union' ? options(o) : [o]))
  for (const option of options(intent)) {
    const shape = defOf(option).shape!
    const v = String((defOf(shape['v']!) as unknown as { values: unknown[] }).values[0])
    for (const [field, schema] of Object.entries(shape)) if (field !== 'v' && holdsText(schema)) out.push(`${v}.${field}`)
  }
  for (const option of options(outcome)) {
    const shape = defOf(option).shape!
    const kind = String((defOf(shape['kind']!) as unknown as { values: unknown[] }).values[0])
    for (const [field, schema] of Object.entries(shape)) if (field !== 'kind' && holdsText(schema)) out.push(`outcome:${kind}.${field}`)
  }
  return out
}

const personal = PERSONAL_FIELDS.map((f) => `${f.v}.${f.field}`)
const unclassified = (found: string[]) => found.filter((f) => !personal.includes(f) && !(f in IMPERSONAL_FIELDS))

describe('the personal fields of the log (#1276, #1269)', () => {
  it('finds the five fields #1269 found, so the walk is not looking past them', () => {
    const found = textFields()
    for (const known of ['seat.claim.name', 'flag.note', 'flag.observer', 'note.add.text', 'note.edit.text']) expect(found).toContain(known)
    expect([...personal].sort()).toEqual(['flag.note', 'flag.observer', 'note.add.text', 'note.edit.text', 'seat.claim.name'])
  })

  it('classifies every field of every intent and outcome that can hold text, once', () => {
    const found = textFields()
    expect(unclassified(found)).toEqual([])
    expect(found.filter((f) => personal.includes(f) && f in IMPERSONAL_FIELDS)).toEqual([])
    // A classification of a field that is no longer there is a map gone stale.
    expect([...personal, ...Object.keys(IMPERSONAL_FIELDS)].filter((f) => !found.includes(f))).toEqual([])
  })

  it('falls for a string field that nobody classified', () => {
    // The vocabulary with one field nobody has said anything about, the way a new one would arrive.
    const grown = zod.union([Intent, zod.object({ v: zod.literal('seat.release'), seat: zod.string(), reason: zod.string().optional() })])
    expect(unclassified(textFields(grown))).toEqual(['seat.release.reason'])
    const outcome = zod.union([Outcome, zod.object({ kind: zod.literal('tally'), said: zod.string() })])
    expect(unclassified(textFields(Intent, outcome))).toEqual(['outcome:tally.said'])
  })

  it('the placeholder fits every personal field and is no blank, so a masked line still validates', () => {
    expect(REDACTED.trim().length).toBeGreaterThan(0)
    expect(REDACTED.length).toBeLessThanOrEqual(Math.min(64, NOTE_MAX))
    expect(Intent.safeParse({ v: 'seat.claim', seat: 'A', name: REDACTED }).success).toBe(true)
    expect(Intent.safeParse({ v: 'flag', note: REDACTED, observer: REDACTED }).success).toBe(true)
    expect(Intent.safeParse({ v: 'note.add', text: REDACTED }).success).toBe(true)
    expect(Intent.safeParse({ v: 'note.edit', note: 'n1', text: REDACTED }).success).toBe(true)
  })
})
