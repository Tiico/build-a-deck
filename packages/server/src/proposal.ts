import { z } from 'zod'
import { parseBody, placedElements, type BodyBlock, type Element, type InlineNode } from '@byd/template'
import { ANTAL, applyEdit, columnsOf, nextCardRef, type EditIntent } from './edits.js'
import type { Cell, ProjectDoc } from './projects.js'
import { kindOf } from './ai-context.js'

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
// A card the game already has, changed (#1003): its id, and only the cells that change.
export const ProposedChange = z.strictObject({
  card: z.string().describe('The id of a card the game has, exactly as the Cards list writes it.'),
  fields: z.array(ProposedCell).describe('Only the fields that change, each with its new value; antal to change how many copies the deck holds.'),
})
export type ProposedChange = z.infer<typeof ProposedChange>
// `changes` came after `cards` (#1003), and an answer written before it — or by a model that left it
// out — reads as one that changes nothing. The schema the provider is held to still requires it,
// since a strict schema requires every property; the default is for reading only, and is never
// written into that schema (see `proposalSchema`).
export const Proposal = z.strictObject({
  cards: z.array(ProposedCard).describe('New cards to add to the deck, one per row; empty when the answer proposes none.'),
  changes: z.array(ProposedChange).default([]).describe('Changes to cards the game already has, one per card; empty when the answer changes none.'),
})
export type Proposal = z.infer<typeof Proposal>

// The schema the provider is held to: the zod schema above as JSON Schema, without the `$schema`
// line neither provider asks for, without the reading defaults no strict mode reads, and with a
// value of several types said as `anyOf` — zod writes it as a list of types, which not every
// provider's strict mode reads.
export function proposalSchema(): Record<string, unknown> {
  const { $schema: _, ...schema } = z.toJSONSchema(Proposal, { io: 'output' }) as Record<string, unknown>
  return anyOfTypes(schema) as Record<string, unknown>
}
function anyOfTypes(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(anyOfTypes)
  if (node === null || typeof node !== 'object') return node
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(node)) {
    if (key === 'default') continue
    if (key === 'type' && Array.isArray(value)) out['anyOf'] = value.map((type) => ({ type }))
    else out[key] = anyOfTypes(value)
  }
  return out
}

// Why a proposal could not be used, as data: the editor says it in the designer's language (A4),
// naming a new card by its place in the proposal and by its title when it has one, and a changed
// card by its id and by the title it has in the game.
type About = { card: number; title?: string }
type Changed = { changed: string; title?: string }
type Where = About | Changed
export type ProposalProblem =
  | { kind: 'shape' }
  | { kind: 'empty' }
  | ({ kind: 'unknown-field' | 'picture-field' | 'repeated-field' | 'empty-field' | 'bad-syntax'; field: string } & Where)
  | ({ kind: 'unknown-icon'; field: string; icon: string } & Where)
  | ({ kind: 'unknown-role'; field: string; role: string } & Where)
  // A value that breaks the column it is written in (#1003): a word in a column of numbers.
  | ({ kind: 'wrong-kind'; field: string; column: 'number' | 'yes/no' } & Where)
  | ({ kind: 'no-count' } & About)
  | ({ kind: 'bad-count' } & Changed)
  | { kind: 'unknown-card'; changed: string }
  | ({ kind: 'repeated-card' } & Changed)
  | { kind: 'refused' }

// A cell a proposal changes, with what it was — nothing, when the card never had the column — and
// what it becomes: what the wall and the table say as old → new.
export type ChangedCell = { field: string; from: Cell | undefined; to: Cell }

// One part of a proposal, the unit «Välj delar…» takes or leaves (#1003): a new card, a changed card
// with all its changed cells, or a template together with the fields and values it needs (#1005) —
// a template that draws a column nobody has written is not a part on its own. Each part carries the
// edits it is, so a choice of parts is the edits of those parts and nothing else. `key` names a part
// the same way however often the proposal is translated: a new card by its place in the proposal,
// since the id it is given depends on the game and on which cards before it were left out.
export type ProposalPart =
  | { kind: 'card'; key: string; cardRef: string; fields: Record<string, Cell>; edits: EditIntent[] }
  | { kind: 'change'; key: string; cardRef: string; cells: ChangedCell[]; edits: EditIntent[] }
  | { kind: 'template'; key: string; face: string; fields: string[]; edits: EditIntent[] }

export type Translated = { ok: true; edits: EditIntent[]; parts: ProposalPart[] } | { ok: false; problem: ProposalProblem }

// A proposal, read and translated against the game as it stands. `answer` is whatever came back,
// unread: reading it is part of the translation. `leave` names the parts the designer left out
// (#1003): they are read and judged like the rest — a proposal that cannot be used is refused whole —
// but they are not in the edits, and a new card left out takes no id from the ones after it.
export function translateProposal(doc: ProjectDoc, answer: unknown, leave: ReadonlySet<string> = new Set()): Translated {
  const read = Proposal.safeParse(answer)
  if (!read.success) return { ok: false, problem: { kind: 'shape' } }
  const columns = new Set(columnsOf(doc))
  const pictures = pictureColumns(doc)
  const parts: ProposalPart[] = []
  let left = false
  let at = doc
  const tried = (edits: EditIntent[]): boolean => {
    try {
      at = edits.reduce(applyEdit, at)
      return true
    } catch {
      return false
    }
  }
  for (const [i, proposed] of read.data.cards.entries()) {
    const fields: Record<string, Cell> = {}
    const titled = proposed.fields.find((c) => c.field === 'title' && typeof c.value === 'string' && c.value.trim() !== '')?.value
    const about: About = { card: i + 1, ...(typeof titled === 'string' ? { title: titled } : {}) }
    for (const { field, value } of proposed.fields) {
      if (field in fields) return refused({ kind: 'repeated-field', field, ...about })
      if (field === ANTAL) {
        const n = countOf(value)
        if (n === null) return refused({ kind: 'no-count', ...about })
        fields[field] = n
        continue
      }
      const fault = cellFault(doc, columns, pictures, field, value)
      if (fault) return refused({ ...fault, ...about })
      fields[field] = value
    }
    if (!(ANTAL in fields)) return refused({ kind: 'no-count', ...about })
    const empty = drawnFields(doc, fields).find((field) => !pictures.has(field) && blank(fields[field]))
    if (empty !== undefined) return refused({ kind: 'empty-field', field: empty, ...about })
    const key = `card:${i + 1}`
    if (leave.has(key)) {
      left = true
      continue
    }
    const edit: EditIntent = { v: 'addRow', cardRef: nextCardRef(at), fields }
    if (!tried([edit])) return refused({ kind: 'refused' })
    parts.push({ kind: 'card', key, cardRef: edit.cardRef, fields, edits: [edit] })
  }
  const seen = new Set<string>()
  for (const proposed of read.data.changes) {
    const row = doc.rows.find((r) => r.id === proposed.card)
    if (!row) return refused({ kind: 'unknown-card', changed: proposed.card })
    const titled = row.fields['title']
    const about: Changed = { changed: row.id, ...(typeof titled === 'string' && titled.trim() !== '' ? { title: titled } : {}) }
    if (seen.has(row.id)) return refused({ kind: 'repeated-card', ...about })
    seen.add(row.id)
    const after: Record<string, Cell> = { ...row.fields }
    const cells: ChangedCell[] = []
    const written = new Set<string>()
    for (const { field, value } of proposed.fields) {
      if (written.has(field)) return refused({ kind: 'repeated-field', field, ...about })
      written.add(field)
      let to: Cell = value
      if (field === ANTAL) {
        const n = countOf(value)
        if (n === null) return refused({ kind: 'bad-count', ...about })
        to = n
      } else {
        const fault = cellFault(doc, columns, pictures, field, value)
        if (fault) return refused({ ...fault, ...about })
      }
      // A cell written with the value it already has changes nothing, and is no change to show.
      if (same(row.fields[field], to)) continue
      cells.push({ field, from: row.fields[field], to })
      after[field] = to
    }
    const emptied = drawnFields(doc, after).find((field) => !pictures.has(field) && cells.some((c) => c.field === field) && blank(after[field]))
    if (emptied !== undefined) return refused({ kind: 'empty-field', field: emptied, ...about })
    if (cells.length === 0) continue
    const key = `change:${row.id}`
    if (leave.has(key)) {
      left = true
      continue
    }
    const edits: EditIntent[] = cells.map((c) => ({ v: 'setCell', cardRef: row.id, field: c.field, value: c.to }))
    if (!tried(edits)) return refused({ kind: 'refused' })
    parts.push({ kind: 'change', key, cardRef: row.id, cells, edits })
  }
  // Nothing to propose is an answer that proposed nothing; nothing chosen is the designer's choice.
  if (parts.length === 0 && !left) return { ok: false, problem: { kind: 'empty' } }
  return { ok: true, edits: parts.flatMap((p) => p.edits), parts }
}

const refused = (problem: ProposalProblem): Translated => ({ ok: false, problem })
// A count as the deck keeps it (L4): a whole number from nought, written as a number or as digits.
function countOf(value: Cell): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && /^\s*\d+\s*$/.test(value) ? Number(value) : NaN
  return Number.isInteger(n) && n >= 0 ? n : null
}
// Whether a cell already holds what is written to it: the same value, or nothing written as nothing.
const same = (had: Cell | undefined, to: Cell): boolean => had === to || (blank(had) && blank(to))

// What is wrong with writing this value in this column, if anything: a column the game does not have
// or its key, a picture, a value of another kind than the column reads (#1003), or text past the
// card text syntax.
type CellFault =
  | { kind: 'unknown-field' | 'picture-field' | 'bad-syntax'; field: string }
  | { kind: 'unknown-icon'; field: string; icon: string }
  | { kind: 'unknown-role'; field: string; role: string }
  | { kind: 'wrong-kind'; field: string; column: 'number' | 'yes/no' }
function cellFault(doc: ProjectDoc, columns: ReadonlySet<string>, pictures: ReadonlySet<string>, field: string, value: Cell): CellFault | null {
  if (field === 'id' || !columns.has(field)) return { kind: 'unknown-field', field }
  if (pictures.has(field)) return { kind: 'picture-field', field }
  const column = kindOf(doc, field)
  const numeric = typeof value === 'number' || (typeof value === 'string' && Number.isFinite(Number(value.trim())))
  if (column === 'number' && !blank(value) && !numeric) return { kind: 'wrong-kind', field, column }
  if (column === 'yes/no' && !blank(value) && typeof value !== 'boolean') return { kind: 'wrong-kind', field, column }
  if (typeof value === 'string') {
    const fault = textFault(doc, value)
    if (fault) return { ...fault, field }
  }
  return null
}

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
