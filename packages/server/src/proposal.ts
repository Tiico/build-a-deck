import { z } from 'zod'
import { parseBody, placedElements, type BodyBlock, type Element, type InlineNode } from '@byd/template'
import { ANTAL, applyEdit, columnsOf, nextCardRef, type EditIntent } from './edits.js'
import type { Cell, ProjectDoc } from './projects.js'

// What the AI may answer, and how an answer becomes the editor's own edits (#1002, E4, PRD module 4).
//
// The model answers in this schema and nothing else: the provider is handed the JSON Schema written
// from the zod schema below (strictly, so it cannot answer outside it), and the answer is read back
// with the same zod schema. A proposal is then translated to plain edits and tried on a copy of the
// game with the real `applyEdit`, so what the designer is shown is exactly what accepting it does —
// and a proposal that names what the game does not have, or writes what a card cannot say, is
// refused with the reason before it ever reaches the document (PRD 39, 40).
//
// Pure, and free of anything Node: the editor translates as the parts arrive, and the actor applies
// the composite edit the translation makes.
//
// This slice proposes new cards. A proposal is an object of parts, each a property of its own, so
// the slices after it add theirs beside `cards` — changed cards (#1003), a template face with its
// fields (#1005), rule blocks (#1006) — without moving what is here. The schema is strict, so every
// property is required: a part the model has nothing for is an empty list.

// A cell as the model writes it: a column of the game and its value. A list of pairs rather than an
// object keyed by column, because a strict schema cannot leave an object's keys open, and the
// columns are the game's and not the schema's.
export const ProposedCell = z.strictObject({
  field: z.string().describe('A column from the game’s Fields, written exactly as it is named there, or antal. Never id: the tool gives each card its key.'),
  value: z.union([z.string(), z.number(), z.boolean()]).describe('The value, in the card text syntax for text. A number for antal.'),
})
export const ProposedCard = z.strictObject({
  fields: z.array(ProposedCell).describe('Every field the template draws on this card, filled, and antal: how many copies the deck holds.'),
})
export type ProposedCard = z.infer<typeof ProposedCard>
export const Proposal = z.strictObject({
  cards: z.array(ProposedCard).describe('New cards to add to the deck, one per row; empty when the answer proposes none.'),
})
export type Proposal = z.infer<typeof Proposal>

// The schema the provider is held to: the zod schema above as JSON Schema, without the `$schema`
// line neither provider asks for, and with a value of several types said as `anyOf` — zod writes
// it as a list of types, which not every provider's strict mode reads.
export function proposalSchema(): Record<string, unknown> {
  const { $schema: _, ...schema } = z.toJSONSchema(Proposal) as Record<string, unknown>
  return anyOfTypes(schema) as Record<string, unknown>
}
function anyOfTypes(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(anyOfTypes)
  if (node === null || typeof node !== 'object') return node
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(node)) {
    if (key === 'type' && Array.isArray(value)) out['anyOf'] = value.map((type) => ({ type }))
    else out[key] = anyOfTypes(value)
  }
  return out
}

// Why a proposal could not be used, as data: the editor says it in the designer's language (A4),
// naming the card by its place in the proposal and by its title when it has one.
type About = { card: number; title?: string }
export type ProposalProblem =
  | { kind: 'shape' }
  | { kind: 'empty' }
  | ({ kind: 'unknown-field' | 'picture-field' | 'repeated-field' | 'empty-field' | 'bad-syntax'; field: string } & About)
  | ({ kind: 'unknown-icon'; field: string; icon: string } & About)
  | ({ kind: 'unknown-role'; field: string; role: string } & About)
  | ({ kind: 'no-count' } & About)
  | { kind: 'refused' }

export type Translated = { ok: true; edits: EditIntent[] } | { ok: false; problem: ProposalProblem }

// A proposal, read and translated against the game as it stands. `answer` is whatever came back,
// unread: reading it is part of the translation.
export function translateProposal(doc: ProjectDoc, answer: unknown): Translated {
  const read = Proposal.safeParse(answer)
  if (!read.success) return { ok: false, problem: { kind: 'shape' } }
  if (read.data.cards.length === 0) return { ok: false, problem: { kind: 'empty' } }
  const columns = new Set(columnsOf(doc))
  const pictures = pictureColumns(doc)
  const edits: EditIntent[] = []
  let at = doc
  for (const [i, proposed] of read.data.cards.entries()) {
    const fields: Record<string, Cell> = {}
    const titled = proposed.fields.find((c) => c.field === 'title' && typeof c.value === 'string' && c.value.trim() !== '')?.value
    const about: About = { card: i + 1, ...(typeof titled === 'string' ? { title: titled } : {}) }
    for (const { field, value } of proposed.fields) {
      if (field in fields) return refused({ kind: 'repeated-field', field, ...about })
      if (field !== ANTAL && (field === 'id' || !columns.has(field))) return refused({ kind: 'unknown-field', field, ...about })
      if (pictures.has(field)) return refused({ kind: 'picture-field', field, ...about })
      if (field === ANTAL) {
        const n = typeof value === 'number' ? value : typeof value === 'string' && /^\s*\d+\s*$/.test(value) ? Number(value) : NaN
        if (!Number.isInteger(n) || n < 0) return refused({ kind: 'no-count', ...about })
        fields[field] = n
        continue
      }
      if (typeof value === 'string') {
        const fault = textFault(doc, value)
        if (fault) return refused({ ...fault, field, ...about })
      }
      fields[field] = value
    }
    if (!(ANTAL in fields)) return refused({ kind: 'no-count', ...about })
    const empty = drawnFields(doc, fields).find((field) => !pictures.has(field) && blank(fields[field]))
    if (empty !== undefined) return refused({ kind: 'empty-field', field: empty, ...about })
    const edit: EditIntent = { v: 'addRow', cardRef: nextCardRef(at), fields }
    try {
      at = applyEdit(at, edit)
    } catch {
      return refused({ kind: 'refused' })
    }
    edits.push(edit)
  }
  return { ok: true, edits }
}

const refused = (problem: ProposalProblem): Translated => ({ ok: false, problem })
const blank = (value: Cell | undefined): boolean => value === undefined || value === null || (typeof value === 'string' && value.trim() === '')

// What the template draws for a card with these values, on every face: the columns its texts and
// rows of icons read, in the variant the card chooses and under the conditions it meets.
function drawnFields(doc: ProjectDoc, fields: Record<string, Cell>): string[] {
  const out: string[] = []
  for (const face of Object.values(doc.template.faces)) {
    for (const { el } of placedElements(face, fields)) {
      if ((el.kind === 'text' || el.kind === 'icons') && 'field' in el.bind && !out.includes(el.bind.field)) out.push(el.bind.field)
    }
  }
  return out
}

// The columns the template draws as pictures, anywhere: the designer's own art, which the model
// never writes (E4).
function pictureColumns(doc: ProjectDoc): Set<string> {
  const out = new Set<string>()
  const walk = (els: readonly Element[]) => {
    for (const el of els) {
      if (el.kind === 'image' && 'field' in el.bind) out.add(el.bind.field)
      if (el.kind === 'if' || el.kind === 'group') walk(el.children)
    }
  }
  for (const face of Object.values(doc.template.faces)) {
    walk(face.base)
    for (const v of Object.values(face.variants)) walk(v.override ?? [])
  }
  return out
}

// What is wrong with a text written for a card, if anything: something written past the five
// constructions of the card text syntax (L2), or a symbol or meaning the game does not have.
//
// L2's parser reads whatever it does not understand as text, which is right for a designer typing —
// a stray brace prints as a brace and she sees it — and wrong for an answer: the model was told the
// syntax, and a brace, an asterisk or a tag that is left over as text is the model writing something
// else. HTML, headings, links and code are named outright, since the parser reads each of them as
// ordinary text.
type TextFault = { kind: 'bad-syntax' } | { kind: 'unknown-icon'; icon: string } | { kind: 'unknown-role'; role: string }
const OUTSIDE_L2 = [/<\/?[a-zA-Z][^>]*>/, /^\s{0,3}#{1,6}\s/m, /\[[^\]]*\]\([^)]*\)/, /`/]
function textFault(doc: ProjectDoc, text: string): TextFault | null {
  if (OUTSIDE_L2.some((pattern) => pattern.test(text))) return { kind: 'bad-syntax' }
  let fault: TextFault | null = null
  const walk = (nodes: readonly InlineNode[]) => {
    for (const node of nodes) {
      if (fault) return
      if (node.type === 'text' && /[{}*]/.test(node.text)) fault = { kind: 'bad-syntax' }
      else if (node.type === 'icon') {
        // A bare number is a pip (L2), unless the game has a symbol by that name.
        if (!(node.name in doc.icons) && !/^\d+$/.test(node.name)) fault = { kind: 'unknown-icon', icon: node.name }
        else if (node.role !== undefined && !(node.role in (doc.palette ?? {}))) fault = { kind: 'unknown-role', role: node.role }
      } else if (node.type === 'bold' || node.type === 'italic') walk(node.children)
    }
  }
  for (const block of parseBody(text) as BodyBlock[]) {
    if (block.type === 'paragraph') walk(block.children)
    else for (const item of block.items) walk(item)
  }
  return fault
}
