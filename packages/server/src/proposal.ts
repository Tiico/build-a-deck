import { z } from 'zod'
import { CARD_STANDARD_63x88 } from '@byd/engine'
import { FaceTemplate, REF_WORD, SHAPES, nameOf, parseBody, parseInline, placedElements, runsOf, type BodyBlock, type Element, type InlineNode, type Names, type Paint, type RuleBlock } from '@byd/template'
import { ANTAL, applyEdit, columnsOf, nextCardRef, type EditIntent } from './edits.js'
import type { Cell, ProjectDoc } from './projects.js'
import { kindOf } from './ai-context.js'
import { namesOfProject } from './names.js'

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

// A template face as the model writes it (#1005): the template's own element model (L1), never HTML
// or CSS, in the shape a strict schema can hold.
//
// Both providers hold the model to the schema strictly, and Anthropic's strict mode cannot say a
// recursive schema — and a template is a tree: a group or a condition holds elements, which may be
// groups and conditions. So the tree is written flat: every element of a face, or of one of its
// groups, stands in one list, and says where it belongs with `parent` — the id of the group or
// condition in the same list that holds it, or null at the top. The translator raises the tree out
// of the list, in the list's order, and refuses a parent that is not a group or condition of the
// list, or an element that holds itself. One encoding for both providers, so the model is asked one
// thing and the answer is read one way, whichever provider gave it.
//
// Every property is required, as a strict schema has it: one the element has nothing for is null,
// which is what the template model's own absence means. Nothing is bounded here — a width under
// nought, a corner count of two — because a bound is what neither strict mode reads; the template
// model judges the face once it is raised, and refuses it with the element it refused.
const Mm = z.number()
const Placed = {
  id: z.string().describe('The element’s id, unique in its list. In a group (variant), an id the base has replaces that base element on the group’s cards.'),
  parent: z.string().nullable().describe('The id of the group or if element in the same list that holds this one, or null at the top.'),
  name: z.string().nullable().describe('What the designer calls the layer, in her language; null to leave it unnamed.'),
}
const Boxed = { ...Placed, x: Mm, y: Mm, w: Mm, h: Mm }
const ProposedBind = z
  .union([z.strictObject({ field: z.string().describe('A column of the game, or one of the template’s new fields.') }), z.strictObject({ literal: z.string().describe('Fixed text in the card text syntax; for an image, empty.') })])
  .describe('What the element shows: a column, or fixed text.')
const Colour = z.string().describe('A colour as #rrggbb, or the name of one of the game’s colour roles.')
const ProposedText = z.strictObject({
  kind: z.literal('text'),
  ...Boxed,
  bind: ProposedBind,
  font: z.strictObject({
    family: z.string().describe('One of the game’s fonts.'),
    sizePt: z.number(),
    weight: z.union([z.literal(400), z.literal(600), z.literal(700), z.literal(800)]).nullable(),
    align: z.enum(['left', 'center', 'right']).nullable(),
    lineHeight: z.number().nullable(),
    letterSpacing: z.number().nullable(),
  }),
  color: Colour,
  fit: z.enum(['fixed', 'shrink']).nullable(),
  valign: z.enum(['top', 'middle', 'bottom']).nullable(),
})
const ProposedImage = z.strictObject({ kind: z.literal('image'), ...Boxed, bind: ProposedBind, fit: z.enum(['cover', 'contain', 'fill']).nullable() })
const ProposedIcons = z.strictObject({ kind: z.literal('icons'), ...Boxed, bind: ProposedBind, iconMm: Mm, gapMm: Mm.nullable() })
// A fill that follows a column (L16): the column, a colour per value as a list of pairs — a strict
// schema cannot leave an object's keys open — and what any other value gets.
const ProposedPaint = z.union([Colour, z.strictObject({ field: z.string(), map: z.array(z.strictObject({ value: z.string(), colour: Colour })), else: Colour.nullable() })])
const ProposedShape = z.strictObject({
  kind: z.literal('shape'),
  ...Boxed,
  shape: z.enum(SHAPES),
  fill: ProposedPaint.nullable(),
  stroke: Colour.nullable(),
  strokeMm: Mm.nullable(),
  radiusMm: Mm.nullable(),
  corners: z.number().nullable(),
  innerRatio: z.number().nullable(),
  rotationDeg: z.number().nullable(),
  opacity: z.number().nullable(),
  pattern: z.strictObject({ kind: z.enum(['stripes', 'grid', 'dots', 'diamonds', 'chevron']), color: Colour, scaleMm: Mm, angleDeg: z.number().nullable(), weight: z.number().nullable() }).nullable(),
  shadow: z.strictObject({ dxMm: Mm, dyMm: Mm, blurMm: Mm, color: Colour, opacity: z.number().nullable() }).nullable(),
})
const ProposedGroup = z.strictObject({ kind: z.literal('group'), ...Placed, x: Mm, y: Mm })
const ProposedIf = z.strictObject({
  kind: z.literal('if'),
  ...Placed,
  field: z.string().describe('The column the condition reads.'),
  equals: z.string().nullable().describe('Show the children when the column has this value; null to show them when it is not empty.'),
})
export const ProposedElement = z.discriminatedUnion('kind', [ProposedText, ProposedImage, ProposedIcons, ProposedShape, ProposedGroup, ProposedIf])
export type ProposedElement = z.infer<typeof ProposedElement>
const ELEMENT_KINDS: readonly string[] = ['text', 'image', 'icons', 'shape', 'group', 'if']
export const ProposedTemplate = z.strictObject({
  face: z.enum(['front', 'back']).describe('The face the template is for.'),
  variantBy: z.string().nullable().describe('The column whose value chooses a card’s group (variant), or null to keep the game’s.'),
  elements: z.array(ProposedElement).describe('Every element of the face, in drawing order, in millimetres on the card.'),
  variants: z
    .array(
      z.strictObject({
        name: z.string().describe('The value of the variantBy column whose cards this group is for.'),
        elements: z.array(ProposedElement).describe('Elements this group adds, or base elements it replaces by id.'),
        remove: z.array(z.string()).describe('Ids of base elements this group leaves out.'),
      }),
    )
    .describe('The groups of the face; empty for none.'),
  fields: z
    .array(
      z.strictObject({
        field: z.string().describe('A new column the template draws and the game does not have.'),
        values: z.array(z.strictObject({ card: z.string().describe('The id of a card the game has.'), value: z.union([z.string(), z.number(), z.boolean()]) })).describe('Its value on the cards that need one.'),
      }),
    )
    .describe('The new fields the template needs; empty when it uses only the game’s own.'),
})
export type ProposedTemplate = z.infer<typeof ProposedTemplate>

// Rule text for the rulebook (#1006, B7): blocks in the book's own kinds, written where they stand.
// A rule names a zone, a card or a counter by its id, `[[zon:id]]`, as the book stores it, so a rule
// the designer accepts follows the thing when it is renamed — and the translator refuses a reference
// to something the game does not have, before it reaches the book.
//
// An entry is blocks placed together in one place, and it says the place by the ids of the blocks it
// touches and never by their position: in place of the blocks it names in `replace`, or after the
// block it names in `after` (null at the start of the book). An index would land on another block
// the moment a co-editor added one above it; an id lands where it was meant or nowhere — a block the
// entry names that is gone since makes the proposal unusable, with the reason, as a card a change
// names that is gone does (#1003).
const RuleText = z.string()
const ProposedRuleHeading = z.strictObject({ kind: z.literal('heading'), level: z.union([z.literal(1), z.literal(2)]).describe('1 for a section, 2 for a heading under one.'), text: RuleText.describe('One line.') })
const ProposedRuleText = z.strictObject({ kind: z.literal('text'), text: RuleText.describe('Paragraphs, separated by a blank line.') })
const ProposedRuleList = z.strictObject({ kind: z.literal('list'), ordered: z.boolean().describe('true for a numbered list.'), items: z.array(RuleText).describe('One item each.') })
export const ProposedRuleBlock = z.discriminatedUnion('kind', [ProposedRuleHeading, ProposedRuleText, ProposedRuleList])
export type ProposedRuleBlock = z.infer<typeof ProposedRuleBlock>
const RULE_KINDS: readonly string[] = ['heading', 'text', 'list']
export const ProposedRules = z.strictObject({
  replace: z.array(z.string()).describe('The ids of the rulebook’s blocks these blocks take the place of, as the Rulebook writes them; empty to add blocks without replacing any.'),
  after: z.string().nullable().describe('When nothing is replaced: the id of the block the new blocks follow, or null to put them first in the book.'),
  blocks: z.array(ProposedRuleBlock).describe('The blocks, in reading order; empty with replace to take blocks out of the book.'),
})
export type ProposedRules = z.infer<typeof ProposedRules>

// `changes` came after `cards` (#1003), and an answer written before it — or by a model that left it
// out — reads as one that changes nothing; `template` came after both (#1005) and reads as no
// template the same way, and `rules` after that (#1006) as no rule text. The schema the provider is held to still requires them, since a strict
// schema requires every property; the defaults are for reading only, and are never written into that
// schema (see `proposalSchema`).
export const Proposal = z.strictObject({
  cards: z.array(ProposedCard).describe('New cards to add to the deck, one per row; empty when the answer proposes none.'),
  changes: z.array(ProposedChange).default([]).describe('Changes to cards the game already has, one per card; empty when the answer changes none.'),
  template: ProposedTemplate.nullable().default(null).describe('A template face with the new fields it needs, or null when the answer proposes none.'),
  rules: z.array(ProposedRules).default([]).describe('Rule text for the rulebook, one entry per place in the book; empty when the answer proposes none.'),
})
export type Proposal = z.infer<typeof Proposal>

// The schema the provider is held to: the zod schema above as JSON Schema, without the `$schema`
// line neither provider asks for, without the reading defaults no strict mode reads, and in the words
// both strict modes read: a value of several types as `anyOf` — zod writes it as a list of types —
// and an element of one of several kinds as `anyOf` too, where zod writes `oneOf` (#1005). An element
// is of exactly one kind all the same, since each kind's `kind` is a constant of its own.
export function proposalSchema(): Record<string, unknown> {
  const { $schema: _, ...schema } = z.toJSONSchema(Proposal, { io: 'output' }) as Record<string, unknown>
  return strictWords(schema) as Record<string, unknown>
}
function strictWords(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strictWords)
  if (node === null || typeof node !== 'object') return node
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(node)) {
    // A property's name is the answer's and never a keyword, however it is spelt.
    if (key === 'properties') out[key] = Object.fromEntries(Object.entries(value as object).map(([name, property]) => [name, strictWords(property)]))
    else if (key === 'default') continue
    else if (key === 'type' && Array.isArray(value)) out['anyOf'] = value.map((type) => ({ type }))
    else if (key === 'oneOf') out['anyOf'] = strictWords(value)
    else out[key] = strictWords(value)
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
  // What is wrong with a proposed template (#1005), on its face, at the element it is wrong in when
  // it is one element's fault.
  | { kind: 'template'; face: string; element?: string; fault: TemplateFault }
  // What is wrong with an entry of rule text (#1006), named by its place in the proposal and by its
  // first heading when it has one.
  | { kind: 'rules'; section: number; title?: string; fault: RulesFault }

// Why rule text could not be used: a block of a kind the book does not have, a place in the book that
// is not there, a block two entries both claim, the setup or a picture replaced — they are the game's
// own — a reference to something the game does not have or one the book cannot read, a symbol or
// meaning the game does not have, text past the inline syntax, and a block with nothing in it.
export type RulesFault =
  | { kind: 'unknown-kind'; type: string }
  | { kind: 'unknown-block' | 'repeated-block'; block: string }
  | { kind: 'keeps'; block: string; what: 'setup' | 'image' }
  | { kind: 'unknown-ref'; ref: string }
  | { kind: 'bad-ref'; written: string }
  | { kind: 'unknown-icon'; icon: string }
  | { kind: 'unknown-role'; role: string }
  | { kind: 'bad-syntax' }
  | { kind: 'empty' }

// Why a proposed template could not be used: an element kind the model does not have, a field that
// is neither the game's nor one the proposal brings, an element outside the card, a typeface, a
// colour role or an icon the game does not have, text outside the card text syntax (L2), a new field
// the game already has, groups without a column to choose them by, and anything else the template
// model refuses.
export type TemplateFault =
  | { kind: 'unknown-element'; type: string }
  | { kind: 'unknown-field'; field: string }
  | { kind: 'outside-card' }
  | { kind: 'unknown-font'; font: string }
  | { kind: 'unknown-role'; role: string }
  | { kind: 'unknown-icon'; icon: string }
  | { kind: 'bad-syntax' }
  | { kind: 'field-exists'; field: string }
  | { kind: 'no-variant-column' }
  | { kind: 'bad-template' }

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
  // `fields` are the new columns, and `filled` how many of the game's cards they write values on.
  | { kind: 'template'; key: string; face: string; fields: string[]; filled: number; edits: EditIntent[] }
  // An entry of rule text (#1006): the blocks it brings, and the blocks of the book it takes the
  // place of. One entry is one part: the blocks the model placed together, a section with its heading,
  // paragraphs and list, or a rewrite of a run of blocks — a block on its own is a heading without its
  // text, and a rewrite of three blocks as two has no block that answers to another.
  | { kind: 'rules'; key: string; replaced: string[]; blocks: RuleBlock[]; edits: EditIntent[] }

export type Translated = { ok: true; edits: EditIntent[]; parts: ProposalPart[] } | { ok: false; problem: ProposalProblem }

// A proposal, read and translated against the game as it stands. `answer` is whatever came back,
// unread: reading it is part of the translation. `leave` names the parts the designer left out
// (#1003): they are read and judged like the rest — a proposal that cannot be used is refused whole —
// but they are not in the edits, and a new card left out takes no id from the ones after it.
export function translateProposal(doc: ProjectDoc, answer: unknown, leave: ReadonlySet<string> = new Set()): Translated {
  // An element of a kind the model does not have is said by its kind, which is the one thing the
  // schema's own refusal would not name.
  const kinded = ruleKindsByFields(answer)
  const stranger = strangeElement(kinded) ?? strangeRuleBlock(kinded)
  if (stranger) return refused(stranger)
  const read = Proposal.safeParse(kinded)
  if (!read.success) return { ok: false, problem: { kind: 'shape' } }
  const parts: ProposalPart[] = []
  let left = false
  let at = doc
  // The template comes first (#1005): the cards and changes beside it were written for the game as
  // it would draw them, so they are judged against the game with the template's face and fields —
  // and their edits follow it, so a column it brings is one they can write.
  let judged = doc
  if (read.data.template) {
    const made = templatePart(doc, read.data.template)
    if (!made.ok) return made
    judged = made.part.edits.reduce(applyEdit, doc)
    if (leave.has(made.part.key)) left = true
    else {
      at = judged
      parts.push(made.part)
    }
  }
  const columns = new Set(columnsOf(judged))
  const pictures = pictureColumns(judged)
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
      const fault = cellFault(judged, columns, pictures, field, value)
      if (fault) return refused({ ...fault, ...about })
      fields[field] = value
    }
    if (!(ANTAL in fields)) return refused({ kind: 'no-count', ...about })
    const empty = drawnFields(judged, fields).find((field) => !pictures.has(field) && blank(fields[field]))
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
    const row = judged.rows.find((r) => r.id === proposed.card)
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
        const fault = cellFault(judged, columns, pictures, field, value)
        if (fault) return refused({ ...fault, ...about })
      }
      // A cell written with the value it already has changes nothing, and is no change to show.
      if (same(row.fields[field], to)) continue
      cells.push({ field, from: row.fields[field], to })
      after[field] = to
    }
    const emptied = drawnFields(judged, after).find((field) => !pictures.has(field) && cells.some((c) => c.field === field) && blank(after[field]))
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
  const ruled = rulesParts(judged, read.data.rules, leave)
  if (!ruled.ok) return ruled
  for (const part of ruled.parts) {
    if (!tried(part.edits)) return refused({ kind: 'refused' })
    parts.push(part)
  }
  if (ruled.left) left = true
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

// An element of a kind the template model does not have, anywhere in a proposed template, as the
// problem that names it — read off the answer before the schema reads it, since the schema would only
// say that the answer was not a proposal.
function strangeElement(answer: unknown): ProposalProblem | null {
  const template = (answer as { template?: unknown } | null)?.template
  if (template === null || typeof template !== 'object') return null
  const said = (template as { face?: unknown }).face
  const face = typeof said === 'string' ? said : 'front'
  const lists: unknown[] = [(template as { elements?: unknown }).elements]
  const variants = (template as { variants?: unknown }).variants
  if (Array.isArray(variants)) for (const v of variants) lists.push((v as { elements?: unknown } | null)?.elements)
  for (const list of lists) {
    if (!Array.isArray(list)) continue
    for (const el of list) {
      const kind = (el as { kind?: unknown } | null)?.kind
      if (typeof kind === 'string' && !ELEMENT_KINDS.includes(kind)) {
        const id = (el as { id?: unknown }).id
        return { kind: 'template', face, ...(typeof id === 'string' ? { element: id } : {}), fault: { kind: 'unknown-element', type: kind } }
      }
    }
  }
  return null
}

type Made = { ok: true; part: Extract<ProposalPart, { kind: 'template' }> } | { ok: false; problem: ProposalProblem }

// A proposed template as the part it is (#1005): the face with its groups, the column that chooses
// them, the new fields and their values — judged against the game, and made into the editor's own
// edits in the order the game can take them: the new columns, the face, the column, the values.
function templatePart(doc: ProjectDoc, proposed: ProposedTemplate): Made {
  const { face } = proposed
  const fail = (fault: TemplateFault, element?: string): Made => ({ ok: false, problem: { kind: 'template', face, ...(element !== undefined ? { element } : {}), fault } })
  const had = doc.template.faces[face]

  // The new fields: names the game answers to in no spelling (#694), and none of them twice.
  const known = ['id', ANTAL, ...columnsOf(doc)].map((name) => name.toLowerCase())
  const fresh: string[] = []
  for (const { field } of proposed.fields) {
    const name = field.trim()
    if (name === '' || name !== field || known.includes(name.toLowerCase()) || fresh.some((f) => f.toLowerCase() === name.toLowerCase())) return fail({ kind: 'field-exists', field })
    fresh.push(name)
  }
  const columns = new Set([...columnsOf(doc), ...fresh])

  const variantBy = proposed.variantBy ?? had?.variantBy ?? null
  if (variantBy !== null && !columns.has(variantBy)) return fail({ kind: 'unknown-field', field: variantBy })
  if (proposed.variants.length > 0 && variantBy === null) return fail({ kind: 'no-variant-column' })

  const base = raiseTree(doc, proposed.elements, had?.base ?? [], columns)
  if ('fault' in base) return fail(base.fault, base.element)
  const variants: FaceTemplate['variants'] = {}
  const topIds = new Set(base.els.map((e) => e.id))
  for (const v of proposed.variants) {
    if (v.name === '' || v.name in variants) return fail({ kind: 'bad-template' })
    const raised = raiseTree(doc, v.elements, had?.variants[v.name]?.override ?? [], columns)
    if ('fault' in raised) return fail(raised.fault, raised.element)
    const strange = v.remove.find((id) => !topIds.has(id))
    if (strange !== undefined) return fail({ kind: 'bad-template' }, strange)
    variants[v.name] = { ...(raised.els.length > 0 ? { override: raised.els } : {}), ...(v.remove.length > 0 ? { remove: v.remove } : {}) }
  }
  const made: FaceTemplate = { base: base.els, variants, ...(variantBy !== null ? { variantBy } : {}) }
  const checked = FaceTemplate.safeParse(made)
  if (!checked.success) return fail({ kind: 'bad-template' }, elementAt(made, checked.error.issues[0]?.path ?? []))

  const edits: EditIntent[] = [...fresh.map((field): EditIntent => ({ v: 'addField', field })), { v: 'replaceFace', face, base: made.base, variants: made.variants }]
  if (variantBy !== null && variantBy !== had?.variantBy) edits.push({ v: 'setGroupColumn', column: variantBy })
  let after: ProjectDoc
  try {
    after = edits.reduce(applyEdit, doc)
  } catch {
    return fail({ kind: 'bad-template' })
  }

  // The values the new fields take on the game's cards, judged as a changed card's are (#1003).
  const pictures = pictureColumns(after)
  const afterColumns = new Set(columnsOf(after))
  const filled = new Set<string>()
  for (const { field, values } of proposed.fields) {
    const seen = new Set<string>()
    for (const { card, value } of values) {
      const row = doc.rows.find((r) => r.id === card)
      if (!row) return { ok: false, problem: { kind: 'unknown-card', changed: card } }
      const titled = row.fields['title']
      const about: Changed = { changed: row.id, ...(typeof titled === 'string' && titled.trim() !== '' ? { title: titled } : {}) }
      if (seen.has(card)) return { ok: false, problem: { kind: 'repeated-card', ...about } }
      seen.add(card)
      const fault = cellFault(after, afterColumns, pictures, field, value)
      if (fault) return { ok: false, problem: { ...fault, ...about } }
      if (blank(value)) continue
      edits.push({ v: 'setCell', cardRef: card, field, value })
      filled.add(card)
    }
  }
  return { ok: true, part: { kind: 'template', key: `template:${face}`, face, fields: fresh, filled: filled.size, edits } }
}

// The id of the element a refusal of the template model stands at, read off the path of the refusal.
function elementAt(face: FaceTemplate, path: readonly PropertyKey[]): string | undefined {
  let at: unknown = face
  let id: string | undefined
  for (const step of path) {
    if (at === null || typeof at !== 'object') break
    at = (at as Record<PropertyKey, unknown>)[step]
    const own = (at as { id?: unknown } | null)?.id
    if (typeof own === 'string' && typeof (at as { kind?: unknown }).kind === 'string') id = own
  }
  return id
}

type Raised = { els: Element[] } | { fault: TemplateFault; element?: string }

// One flat list of proposed elements raised into the template's tree, each element judged as it is
// made: the columns it reads, its typeface, its colours, its text, and its place on the card.
// `before` is the list the face had where this one goes, so what the proposal cannot say about an
// element it keeps — a shape's own outline (L26), a picture's trim and frame, a lock (L15) — is kept
// with it.
function raiseTree(doc: ProjectDoc, list: readonly ProposedElement[], before: readonly Element[], columns: ReadonlySet<string>): Raised {
  const byId = new Map<string, ProposedElement>()
  for (const el of list) {
    if (el.id === '' || byId.has(el.id)) return { fault: { kind: 'bad-template' }, element: el.id }
    byId.set(el.id, el)
  }
  // A parent is a group or a condition of the same list, and no element is its own ancestor.
  for (const el of list) {
    const seen = new Set<string>([el.id])
    for (let up = el.parent; up !== null; up = byId.get(up)?.parent ?? null) {
      const holder = byId.get(up)
      if (!holder || (holder.kind !== 'group' && holder.kind !== 'if') || seen.has(up)) return { fault: { kind: 'bad-template' }, element: el.id }
      seen.add(up)
    }
  }
  const fonts = knownFonts(doc)
  const kept = new Map<string, Element>()
  const keep = (els: readonly Element[]) => {
    for (const el of els) {
      kept.set(el.id, el)
      if (el.kind === 'group' || el.kind === 'if') keep(el.children)
    }
  }
  keep(before)
  const made = new Map<string, Element>()
  for (const el of list) {
    const out = elementOf(doc, el, kept.get(el.id), columns, fonts)
    if ('fault' in out) return { fault: out.fault, element: el.id }
    made.set(el.id, out.el)
  }
  const childrenOf = (parent: string | null): Element[] =>
    list.flatMap((el) => {
      const own = made.get(el.id)
      if (el.parent !== parent || !own) return []
      return [own.kind === 'group' || own.kind === 'if' ? { ...own, children: childrenOf(el.id) } : own]
    })
  const els = childrenOf(null)
  const outside = outsideCard(els, 0, 0)
  if (outside !== null) return { fault: { kind: 'outside-card' }, element: outside }
  return { els }
}

// The first element that reaches past the card's bleed, with the groups it stands in folded in: the
// knife may leave the bleed on the card, and nothing beyond it is on any card that is ever printed.
function outsideCard(els: readonly Element[], dx: number, dy: number): string | null {
  const { widthMm, heightMm } = CARD_STANDARD_63x88.physical
  const { bleedMm } = CARD_STANDARD_63x88.print
  for (const el of els) {
    if (el.kind === 'group' || el.kind === 'if') {
      const inner = el.kind === 'group' ? outsideCard(el.children, dx + el.x, dy + el.y) : outsideCard(el.children, dx, dy)
      if (inner !== null) return inner
      continue
    }
    const x = el.x + dx
    const y = el.y + dy
    if (x < -bleedMm || y < -bleedMm || x + el.w > widthMm + bleedMm || y + el.h > heightMm + bleedMm) return el.id
  }
  return null
}

// The typefaces a template may set its text in: the game's own (L57), and any its template already
// sets text in — a game made before its fonts were carried still sets its texts in the families it
// named.
function knownFonts(doc: ProjectDoc): Set<string> {
  const out = new Set(Object.keys(doc.fonts ?? {}))
  const walk = (els: readonly Element[]) => {
    for (const el of els) {
      if (el.kind === 'text') out.add(el.font.family)
      if (el.kind === 'group' || el.kind === 'if') walk(el.children)
    }
  }
  for (const face of Object.values(doc.template.faces)) {
    walk(face.base)
    for (const v of Object.values(face.variants)) walk(v.override ?? [])
  }
  return out
}

// A colour as the template holds it: a colour the model wrote out, or the colour of the role it
// named (L57). Nothing else reaches a card's style sheet, which a colour is written into as it stands.
function colourOf(doc: ProjectDoc, written: string): string | TemplateFault {
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(written)) return written
  return doc.palette?.[written] ?? { kind: 'unknown-role', role: written }
}
const isFault = (value: unknown): value is TemplateFault => typeof value === 'object' && value !== null

// One proposed element as the template's own, with no children yet, or what is wrong with it.
function elementOf(doc: ProjectDoc, el: ProposedElement, before: Element | undefined, columns: ReadonlySet<string>, fonts: ReadonlySet<string>): { el: Element } | { fault: TemplateFault } {
  const designer = { ...(el.name !== null && el.name !== '' ? { name: el.name } : {}), ...(before?.kind === el.kind && before.locked ? { locked: true as const } : {}) }
  const column = (field: string): TemplateFault | null => (columns.has(field) ? null : { kind: 'unknown-field', field })
  const colour = (written: string) => colourOf(doc, written)
  switch (el.kind) {
    case 'text': {
      const bound = 'field' in el.bind ? column(el.bind.field) : textFault(doc, el.bind.literal)
      if (bound) return { fault: bound }
      if (!fonts.has(el.font.family)) return { fault: { kind: 'unknown-font', font: el.font.family } }
      const color = colour(el.color)
      if (isFault(color)) return { fault: color }
      const { family, sizePt, weight, align, lineHeight, letterSpacing } = el.font
      const font = { family, sizePt, ...(weight !== null ? { weight } : {}), ...(align !== null ? { align } : {}), ...(lineHeight !== null ? { lineHeight } : {}), ...(letterSpacing !== null ? { letterSpacing } : {}) }
      return { el: { kind: 'text', id: el.id, ...designer, x: el.x, y: el.y, w: el.w, h: el.h, bind: el.bind, font, color, ...(el.fit !== null ? { fit: el.fit } : {}), ...(el.valign !== null ? { valign: el.valign } : {}) } }
    }
    case 'image': {
      if ('field' in el.bind) {
        const bound = column(el.bind.field)
        if (bound) return { fault: bound }
      } else if (el.bind.literal !== '' && !knownPicture(doc, el.bind.literal)) return { fault: { kind: 'bad-template' } }
      // What the model does not write about a picture it keeps: the motif fitting, and the rounded
      // corners that follow the frame round it (#1224).
      const kept =
        before?.kind === 'image'
          ? { ...(before.trim ? { trim: before.trim } : {}), ...(before.frame ? { frame: before.frame } : {}), ...(before.radiusMm !== undefined ? { radiusMm: before.radiusMm } : {}) }
          : {}
      return { el: { kind: 'image', id: el.id, ...designer, x: el.x, y: el.y, w: el.w, h: el.h, bind: el.bind, ...(el.fit !== null ? { fit: el.fit } : {}), ...kept } }
    }
    case 'icons': {
      const bound =
        'field' in el.bind
          ? column(el.bind.field)
          : textFault(
              doc,
              el.bind.literal
                .split(/[\s,]+/)
                .filter((n) => n.length > 0)
                .map((n) => `{${n}}`)
                .join(' '),
            )
      if (bound) return { fault: bound }
      return { el: { kind: 'icons', id: el.id, ...designer, x: el.x, y: el.y, w: el.w, h: el.h, bind: el.bind, iconMm: el.iconMm, ...(el.gapMm !== null ? { gapMm: el.gapMm } : {}) } }
    }
    case 'shape': {
      let fill: Paint | undefined
      if (typeof el.fill === 'string') {
        const c = colour(el.fill)
        if (isFault(c)) return { fault: c }
        fill = c
      } else if (el.fill !== null) {
        const bound = column(el.fill.field)
        if (bound) return { fault: bound }
        const map: Record<string, string> = {}
        for (const { value, colour: written } of el.fill.map) {
          const c = colour(written)
          if (isFault(c)) return { fault: c }
          map[value] = c
        }
        const otherwise = el.fill.else === null ? null : colour(el.fill.else)
        if (isFault(otherwise)) return { fault: otherwise }
        fill = { field: el.fill.field, map, ...(otherwise !== null ? { else: otherwise } : {}) }
      }
      const stroke = el.stroke === null ? null : colour(el.stroke)
      if (isFault(stroke)) return { fault: stroke }
      const patternColour = el.pattern === null ? null : colour(el.pattern.color)
      if (isFault(patternColour)) return { fault: patternColour }
      const shadowColour = el.shadow === null ? null : colour(el.shadow.color)
      if (isFault(shadowColour)) return { fault: shadowColour }
      const pattern =
        el.pattern !== null && patternColour !== null
          ? { pattern: { kind: el.pattern.kind, color: patternColour, scaleMm: el.pattern.scaleMm, ...(el.pattern.angleDeg !== null ? { angleDeg: el.pattern.angleDeg } : {}), ...(el.pattern.weight !== null ? { weight: el.pattern.weight } : {}) } }
          : {}
      const shadow =
        el.shadow !== null && shadowColour !== null
          ? { shadow: { dxMm: el.shadow.dxMm, dyMm: el.shadow.dyMm, blurMm: el.shadow.blurMm, color: shadowColour, ...(el.shadow.opacity !== null ? { opacity: el.shadow.opacity } : {}) } }
          : {}
      const points = before?.kind === 'shape' && before.points ? { points: before.points } : {}
      return {
        el: {
          kind: 'shape',
          id: el.id,
          ...designer,
          x: el.x,
          y: el.y,
          w: el.w,
          h: el.h,
          shape: el.shape,
          ...(fill !== undefined ? { fill } : {}),
          ...(stroke !== null ? { stroke } : {}),
          ...(el.strokeMm !== null ? { strokeMm: el.strokeMm } : {}),
          ...(el.radiusMm !== null ? { radiusMm: el.radiusMm } : {}),
          ...(el.corners !== null ? { corners: el.corners } : {}),
          ...(el.innerRatio !== null ? { innerRatio: el.innerRatio } : {}),
          ...(el.rotationDeg !== null ? { rotationDeg: el.rotationDeg } : {}),
          ...(el.opacity !== null ? { opacity: el.opacity } : {}),
          ...pattern,
          ...shadow,
          ...points,
        },
      }
    }
    case 'group':
      return { el: { kind: 'group', id: el.id, ...designer, x: el.x, y: el.y, children: [] } }
    case 'if': {
      const bound = column(el.field)
      if (bound) return { fault: bound }
      return { el: { kind: 'if', id: el.id, ...designer, when: el.equals === null ? { field: el.field, nonEmpty: true } : { field: el.field, equals: el.equals }, children: [] } }
    }
  }
}

// Whether a fixed picture is one of the game's own: a picture it holds, or one its template already
// shows. The model never brings a picture of its own (E4).
function knownPicture(doc: ProjectDoc, ref: string): boolean {
  const hash = /^asset:([0-9a-f]{64})$/.exec(ref)?.[1]
  if (hash !== undefined && doc.pictures?.[hash]) return true
  const shows = (els: readonly Element[]): boolean => els.some((el) => (el.kind === 'image' && 'literal' in el.bind && el.bind.literal === ref) || ((el.kind === 'group' || el.kind === 'if') && shows(el.children)))
  return Object.values(doc.template.faces).some((face) => shows(face.base) || Object.values(face.variants).some((v) => shows(v.override ?? [])))
}

// Rule text as the parts it is (#1006): each entry judged against the book as it stands, whether the
// designer keeps it or not — a proposal that cannot be used is refused whole, as it was shown — and
// made into one `spliceRules` per entry kept. The new blocks get the ids the book has free, in the
// spelling a template's book begins with, and an entry left out takes none of them, so the ids of
// the ones after it do not move with the choice. Two entries after the same block stand in the
// order they were written: the second follows the first one's last block.
type RulesPart = Extract<ProposalPart, { kind: 'rules' }>
type Ruled = { ok: true; parts: RulesPart[]; left: boolean } | { ok: false; problem: ProposalProblem }
type Written = Extract<RuleBlock, { kind: 'heading' | 'text' | 'list' }>
type Unplaced = Written extends infer B ? (B extends { id: string } ? Omit<B, 'id'> : never) : never
function rulesParts(doc: ProjectDoc, entries: readonly ProposedRules[], leave: ReadonlySet<string>): Ruled {
  const book = doc.rules?.blocks ?? []
  const known = new Map(book.map((block) => [block.id, block]))
  const names = namesOfProject(doc)
  const fail = (i: number, fault: RulesFault): Ruled => ({ ok: false, problem: { kind: 'rules', section: i + 1, ...titleOf(entries[i]), fault } })
  // The blocks each entry takes the place of, claimed once.
  const claimed = new Set<string>()
  for (const [i, entry] of entries.entries()) {
    for (const id of entry.replace) {
      const block = known.get(id)
      if (!block) return fail(i, { kind: 'unknown-block', block: id })
      if (claimed.has(id)) return fail(i, { kind: 'repeated-block', block: id })
      if (block.kind === 'setup' || block.kind === 'image') return fail(i, { kind: 'keeps', block: id, what: block.kind })
      claimed.add(id)
    }
  }
  const made: Unplaced[][] = []
  for (const [i, entry] of entries.entries()) {
    if (entry.replace.length === 0 && entry.after !== null) {
      if (!known.has(entry.after)) return fail(i, { kind: 'unknown-block', block: entry.after })
      if (claimed.has(entry.after)) return fail(i, { kind: 'repeated-block', block: entry.after })
    }
    if (entry.replace.length === 0 && entry.blocks.length === 0) return fail(i, { kind: 'empty' })
    const blocks: Unplaced[] = []
    for (const proposed of entry.blocks) {
      const read = ruleBlocksOf(doc, names, proposed)
      if ('fault' in read) return fail(i, read.fault)
      blocks.push(...read.blocks)
    }
    made.push(blocks)
  }
  const taken = new Set(book.map((block) => block.id))
  const lastAt = new Map<string | null, string>()
  const parts: RulesPart[] = []
  let left = false
  for (const [i, entry] of entries.entries()) {
    const key = `rules:${i + 1}`
    if (leave.has(key)) {
      left = true
      continue
    }
    const blocks = (made[i] ?? []).map((block) => ({ ...block, id: freeBlockId(taken) }) as RuleBlock)
    const inserting = entry.replace.length === 0
    const after = inserting ? (lastAt.get(entry.after) ?? entry.after) : null
    const last = blocks.at(-1)
    if (inserting && last) lastAt.set(entry.after, last.id)
    const edit: EditIntent = { v: 'spliceRules', replace: [...entry.replace], after, blocks, ...(doc.rules === undefined ? { title: doc.name } : {}) }
    parts.push({ kind: 'rules', key, replaced: [...entry.replace], blocks, edits: [edit] })
  }
  return { ok: true, parts, left }
}

// An entry named as the editor names it: by its first heading, when it has one.
function titleOf(entry: { blocks?: readonly unknown[] } | undefined): { title?: string } {
  for (const block of entry?.blocks ?? []) {
    const b = block as { kind?: unknown; text?: unknown } | null
    if (b?.kind === 'heading' && typeof b.text === 'string' && b.text.trim() !== '') return { title: b.text.trim() }
  }
  return {}
}

// The spelling a template's book begins with (`templateRules` in the Regler tab): the first `b<n>`
// the book does not have. The tab itself draws a new block's id at random since #1053, so a block a
// co-editor adds in the same moment never takes the same one.
function freeBlockId(taken: Set<string>): string {
  for (let n = 1; ; n++) {
    if (taken.has(`b${n}`)) continue
    taken.add(`b${n}`)
    return `b${n}`
  }
}

// A proposed block as the book's blocks: a heading as one, a list with its items, and a paragraph as
// the paragraphs and lists its lines were written as — what the Regler tab makes of a paragraph when
// it is closed (L68), so a list written with «- » in a paragraph is a list in the book and never a
// paragraph that reads «- Dra.» at the table.
function ruleBlocksOf(doc: ProjectDoc, names: Names, proposed: ProposedRuleBlock): { blocks: Unplaced[] } | { fault: RulesFault } {
  const check = (text: string): RulesFault | null => (text.trim() === '' ? { kind: 'empty' } : ruleTextFault(doc, names, text))
  if (proposed.kind === 'heading') {
    const fault = check(proposed.text)
    return fault ? { fault } : { blocks: [{ kind: 'heading', level: proposed.level, text: proposed.text.trim() }] }
  }
  const listOf = (ordered: boolean, written: readonly string[]): { blocks: Unplaced[] } | { fault: RulesFault } => {
    const items = written.map((item) => item.trim()).filter((item) => item !== '')
    if (items.length === 0) return { fault: { kind: 'empty' } }
    for (const item of items) {
      const fault = check(item)
      if (fault) return { fault }
    }
    return { blocks: [{ kind: 'list', ordered, items }] }
  }
  if (proposed.kind === 'list') return listOf(proposed.ordered, proposed.items)
  if (proposed.text.trim() === '') return { fault: { kind: 'empty' } }
  const blocks: Unplaced[] = []
  for (const run of runsOf(proposed.text.trim())) {
    if (run.kind === 'list') {
      const read = listOf(run.ordered, run.items)
      if ('fault' in read) return read
      blocks.push(...read.blocks)
      continue
    }
    const fault = check(run.text)
    if (fault) return { fault }
    blocks.push({ kind: 'text', text: run.text })
  }
  return { blocks }
}

// What is wrong with a line of rule text, if anything: what the card text syntax refuses (L2), and —
// since the book reads one construction more (B7) — a reference that does not read as one, or names
// what the game does not have. The parser reads a bracket it does not understand as text, which is
// right for a designer typing and wrong for an answer that was told the syntax.
function ruleTextFault(doc: ProjectDoc, names: Names, text: string): RulesFault | null {
  if (OUTSIDE_L2.some((pattern) => pattern.test(text.replace(/\[\[[^\]]*\]\]/g, '')))) return { kind: 'bad-syntax' }
  let fault: RulesFault | null = null
  const walk = (nodes: readonly InlineNode[]) => {
    for (const node of nodes) {
      if (fault) return
      if (node.type === 'text') {
        const ref = /\[\[[^\]]*\]{0,2}|\]\]/.exec(node.text)
        if (ref) fault = { kind: 'bad-ref', written: ref[0] }
        else if (/[{}*]/.test(node.text)) fault = { kind: 'bad-syntax' }
      } else if (node.type === 'ref') {
        if (nameOf(node, names) === null) fault = { kind: 'unknown-ref', ref: `${REF_WORD[node.of]}:${node.id}` }
      } else if (node.type === 'icon') {
        if (!(node.name in doc.icons) && !/^\d+$/.test(node.name)) fault = { kind: 'unknown-icon', icon: node.name }
        else if (node.role !== undefined && !(node.role in (doc.palette ?? {}))) fault = { kind: 'unknown-role', role: node.role }
      } else walk(node.children)
    }
  }
  for (const paragraph of parseInline(text, { refs: true })) walk(paragraph.children)
  return fault
}

// A rule block under a kind word the book does not have, read as the one kind its fields fit (#1183).
// Anthropic's tool is not strict (#1088), and a long answer has come back with a list under the kind
// «ordered_placeholder_removed_marker_do_not_use»; the kinds share no field but `text`, so the fields
// say which block was meant. A block whose fields fit no kind keeps its word, and is refused by it.
const RULE_FIELDS: readonly (readonly [string, readonly string[]])[] = [
  ['heading', ['level', 'text']],
  ['text', ['text']],
  ['list', ['items', 'ordered']],
]
function ruleKindsByFields(answer: unknown): unknown {
  const entries = (answer as { rules?: unknown } | null)?.rules
  if (!Array.isArray(entries)) return answer
  const kinded = (block: unknown): unknown => {
    if (block === null || typeof block !== 'object') return block
    const { kind, ...fields } = block as Record<string, unknown>
    if (typeof kind !== 'string' || RULE_KINDS.includes(kind)) return block
    const names = Object.keys(fields).sort().join()
    const fit = RULE_FIELDS.find(([, own]) => own.join() === names)
    return fit ? { kind: fit[0], ...fields } : block
  }
  const rules = entries.map((entry) => {
    const blocks = (entry as { blocks?: unknown } | null)?.blocks
    return Array.isArray(blocks) ? { ...(entry as object), blocks: blocks.map(kinded) } : entry
  })
  return { ...(answer as object), rules }
}

// A block of a kind the book does not have, anywhere in the proposed rule text, as the problem that
// names it — read off the answer before the schema reads it, as a template's strange element is.
function strangeRuleBlock(answer: unknown): ProposalProblem | null {
  const entries = (answer as { rules?: unknown } | null)?.rules
  if (!Array.isArray(entries)) return null
  for (const [i, entry] of entries.entries()) {
    const blocks = (entry as { blocks?: unknown } | null)?.blocks
    if (!Array.isArray(blocks)) continue
    for (const block of blocks) {
      const kind = (block as { kind?: unknown } | null)?.kind
      if (typeof kind === 'string' && !RULE_KINDS.includes(kind)) return { kind: 'rules', section: i + 1, ...titleOf(entry as { blocks: unknown[] }), fault: { kind: 'unknown-kind', type: kind } }
    }
  }
  return null
}
