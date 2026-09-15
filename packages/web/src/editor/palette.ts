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
  const count = (name: string | undefined) => {
    if (name) out[name] = (out[name] ?? 0) + 1
  }
  const braced = /\{([\p{L}\p{N}_-]+)(?:\|[\p{L}\p{N}_-]+)?\}/gu
  const NAME = /^([\p{L}\p{N}_-]+)(?:\|[\p{L}\p{N}_-]+)?$/u
  for (const { fields } of rows) {
    for (const [field, value] of Object.entries(fields)) {
      if (typeof value !== 'string') continue
      if (bare.includes(field)) {
        for (const word of value.split(/[\s,]+/)) count(NAME.exec(word)?.[1])
        continue
      }
      for (const m of value.matchAll(braced)) count(m[1])
    }
  }
  return out
}
