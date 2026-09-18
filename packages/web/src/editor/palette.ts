import { APART, BLINDNESS, TOGETHER, contrastRatio, distance, simulate, type Blindness } from '@byd/template'
import type { ProjectDoc, Row } from './types.js'

// The game's meanings and what they are painted in (E4), judged all at once.
//
// A colour per use would be forty chances to write an unreadable card and forty chances to say
// the same thing in two different reds. A meaning is one place instead — so this is the one place
// a deck can be told that a colour will not be read on the card it sits on, or that two of its
// meanings become the same colour for a colour-blind reader. Both judgements are the card check's
// own (E5), reused rather than rewritten, so the palette cannot pass what a card would fail.

// A symbol is a graphic and not a sentence: it wants 3:1 against its ground, not 4.5:1.
export const ROLE_MIN_CONTRAST = 3

export type PaletteIssue =
  | { role: string; code: 'too-faint'; against: string }
  | { role: string; code: 'colour-only'; with: string; blindness: Blindness }

export function paletteIssues(palette: Record<string, string>, ground: string): PaletteIssue[] {
  const roles = Object.entries(palette)
  const issues: PaletteIssue[] = []
  for (const [role, colour] of roles) {
    if (contrastRatio(colour, ground) < ROLE_MIN_CONTRAST) issues.push({ role, code: 'too-faint', against: ground })
  }
  for (const [i, [aRole, a]] of roles.entries()) {
    for (const [bRole, b] of roles.slice(i + 1)) {
      // Two colours that already look alike to everyone are the deck's own choice and not a
      // finding: what is caught here is a pair that parts company only for some readers.
      if (distance(a, b) < APART) continue
      const lost = BLINDNESS.find((kind) => distance(simulate(a, kind), simulate(b, kind)) < TOGETHER)
      if (lost) issues.push({ role: bRole, code: 'colour-only', with: aRole, blindness: lost })
    }
  }
  return issues
}

// How often each meaning is actually written, so the palette can show what the deck uses and what
// it has stopped using. A meaning is written the same way in card text and in an icon row — after
// a bar — because the row and the sentence are the same symbols (L1, L2, E4).
export function rolesUsed(rows: readonly { fields: Row }[]): Record<string, number> {
  const out: Record<string, number> = {}
  const written = /\{?[\p{L}\p{N}_-]+\|([\p{L}\p{N}_-]+)\}?/gu
  for (const { fields } of rows) {
    for (const value of Object.values(fields)) {
      if (typeof value !== 'string') continue
      for (const [, role] of value.matchAll(written)) if (role) out[role] = (out[role] ?? 0) + 1
    }
  }
  return out
}

// What a symbol will sit on, so the palette is judged against the card and not against a guess:
// the lowest thing the template paints across the whole card. A background the deck chooses per
// card is no one colour and is left to the card check, which can see one card at a time (E5).
const PAPER = '#ffffff'

export function groundOf(doc: ProjectDoc, face: string): string {
  const base = doc.template.faces[face]?.base ?? []
  const covering = base.find((el) => el.kind === 'shape' && typeof el.fill === 'string' && el.x <= 0 && el.y <= 0 && el.w >= 63 && el.h >= 88)
  return covering && covering.kind === 'shape' && typeof covering.fill === 'string' ? covering.fill : PAPER
}

// How often each symbol is written (E4). It has to count a symbol that wears a meaning too: the
// panel used to look for `{namn}` exactly, and a deck that had painted all of its symbols was
// told, on every row, that it used none of them.
//
// Which columns are icon rows has to be handed in, because nothing about a cell's contents can
// tell a row of names from a sentence — `bare` is the caller's `iconFieldsOf`. In a sentence a
// symbol wears braces; in a row it stands bare among others. Either may carry a meaning after a
// bar, and the name is what is counted, never the meaning.
export function iconsUsed(rows: readonly { fields: Row }[], bare: readonly string[] = []): Record<string, number> {
  const out: Record<string, number> = {}
  // Mentions and not cards, which is what the set beside the library has always counted: a card
  // that says the same symbol twice is two here.
  for (const { fields } of rows) for (const name of iconMentions(fields, bare)) out[name] = (out[name] ?? 0) + 1
  return out
}

/**
 * Every symbol one card says, once per card (#178).
 *
 * The symbol tab asks which cards say a symbol; the set beside the library asks how many times it
 * is said. Two questions, one walk — a deck that had painted every symbol it uses was once told it
 * used none, because a second reader looked for `{namn}` exactly, and the way not to have that
 * twice is not to have two readers.
 */
export const iconsIn = (fields: Row, bare: readonly string[] = []): Set<string> => new Set(iconMentions(fields, bare))

/** Each symbol as it is said, in order, repeats and all. The one walk both readings are taken from. */
function* iconMentions(fields: Row, bare: readonly string[]): Generator<string> {
  const braced = /\{([\p{L}\p{N}_-]+)(?:\|[\p{L}\p{N}_-]+)?\}/gu
  for (const [field, value] of Object.entries(fields)) {
    if (typeof value !== 'string') continue
    if (bare.includes(field)) {
      yield* namesIn(value)
      continue
    }
    for (const m of value.matchAll(braced)) if (m[1]) yield m[1]
  }
}

/**
 * A row of names, read as the renderer reads one: split on spaces and commas, and the name is what
 * stands before the bar (E4). It is the same reading whether the names come out of a cell or out
 * of an `icons` element's literal, because it is the same cell the compiler splits either way.
 */
function* namesIn(value: string): Generator<string> {
  const NAME = /^([\p{L}\p{N}_-]+)(?:\|[\p{L}\p{N}_-]+)?$/u
  for (const word of value.split(/[\s,]+/)) {
    const name = NAME.exec(word)?.[1]
    if (name) yield name
  }
}

/**
 * How a symbol the template paints reaches the cards (#213, E4).
 *
 * A symbol gets onto a card two ways. The card says it — `{namn}` in a sentence, a bare name in an
 * icon row — which is what `iconsUsed` and `iconsIn` count. Or the template paints it: an `icons`
 * element bound to a literal, which puts the symbol on every card that element is drawn on without
 * a single row naming it. Those cards are not cards that *say* the symbol, so the count stays 0 —
 * but a 0 with no explanation reads as a fault, and this is what lets the surfaces say why.
 *
 * `all` and `some` are the honest difference between them. An element in a face's base is drawn on
 * every card the deck has; one in a variant's override, or under an `if`, is drawn on some of them,
 * and so is a base element that a variant removes or overrides. The cards are not counted either
 * way — the point is only that the message must not promise every card when the template promises
 * a few.
 */
export type Painted = 'all' | 'some'

export function iconsPainted(doc: Pick<ProjectDoc, 'template'>): Record<string, Painted> {
  const out: Record<string, Painted> = {}
  // One element that draws the symbol on every card is enough, whatever the rest of the template
  // does with it elsewhere.
  const paint = (name: string, how: Painted) => {
    if (out[name] !== 'all') out[name] = how
  }
  const walk = (els: ProjectDoc['template']['faces'][string]['base'], how: Painted, touched: ReadonlySet<string>) => {
    for (const el of els) {
      if (el.kind === 'icons' && 'literal' in el.bind) for (const name of namesIn(el.bind.literal)) paint(name, touched.has(el.id) ? 'some' : how)
      // A condition is the template's own way of saying "not on every card"; a group is a
      // position and decides nothing about whether what it holds is drawn.
      if (el.kind === 'if') walk(el.children, 'some', touched)
      if (el.kind === 'group') walk(el.children, how, touched)
    }
  }
  for (const face of Object.values(doc.template.faces)) {
    const variants = Object.values(face.variants)
    // What a variant takes away or replaces by id, it takes away from the cards wearing it — so a
    // base element any variant touches is no longer drawn on every card in the deck.
    const touched = new Set([...variants.flatMap((v) => v.remove ?? []), ...variants.flatMap((v) => (v.override ?? []).map((el) => el.id))])
    walk(face.base, 'all', touched)
    for (const v of variants) walk(v.override ?? [], 'some', touched)
  }
  return out
}
