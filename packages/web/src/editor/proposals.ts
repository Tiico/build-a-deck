import { applyEdit, type EditIntent } from '@byd/server/doc'
import { translateProposal, type ChangedCell, type ProposalProblem, type Translated } from '@byd/server/proposal'
import { elementsFor } from '@byd/template'
import { fieldLabel } from './fields.js'
import type { ProjectDoc, ProjectRow } from './types.js'
import type { RuleBlock } from '@byd/template'
import type { T } from '../i18n/index.js'

// An AI proposal as the editor holds it (#1002): the parts the answer brought, as they were written,
// read and translated against the game as it stands now — never once and kept, because the game can
// move while the proposal waits (a co-editor adds a card, and the ids it would take are taken), and
// what is accepted must be what the game takes at the moment it is accepted.
//
// Framework-free, so the panel, the wall and the table read a proposal the same way.

// The parts that arrived, in the shape the proposal model reads: new cards, changed cards (#1003), and
// a template face with its fields (#1005), which arrives whole as one part — or null, which is how a
// strict schema has the model say it proposes none — and rule text for the rulebook (#1006), an entry
// at a time.
export type ProposalParts = { cards: unknown[]; changes: unknown[]; template?: unknown; rules?: unknown[] }
export const noParts = (): ProposalParts => ({ cards: [], changes: [], rules: [] })
export function withPart(parts: ProposalParts, key: string, part: unknown): ProposalParts {
  if (key === 'cards') return { ...parts, cards: [...parts.cards, part] }
  if (key === 'changes') return { ...parts, changes: [...parts.changes, part] }
  if (key === 'template') return { ...parts, template: part }
  if (key === 'rules') return { ...parts, rules: [...(parts.rules ?? []), part] }
  return parts
}
// Whether anything has been proposed yet: a template written as null is no proposal.
export const hasParts = (parts: ProposalParts): boolean => parts.cards.length > 0 || parts.changes.length > 0 || (parts.template !== undefined && parts.template !== null) || (parts.rules?.length ?? 0) > 0

// A proposal as the editor shows it on the wall and in the table: its parts, and the ones the
// designer has left out with «Välj delar…» (#1003), which the wall and the table leave out too.
export type ShownProposal = { parts: ProposalParts; leave: ReadonlySet<string> }
// Whether a shown proposal brings a template the designer has not left out (#1005): what is shown
// on the wall from Tabell too, since the table holds no template.
export function showsTemplate({ parts, leave }: ShownProposal): boolean {
  const face = (parts.template as { face?: unknown } | null | undefined)?.face
  return typeof face === 'string' && !leave.has(`template:${face}`)
}

// Where a shown proposal is shown (#1006): rule text in the Regler tab, and the deck — new and changed
// cards and a template — on the wall or in the table. A proposal of rule text and nothing else is shown
// in the book alone; one with both is shown in each, since the two never stand on the same surface.
const kept = ({ leave }: ShownProposal, key: string) => !leave.has(key)
export function showsRules(shown: ShownProposal): boolean {
  return (shown.parts.rules ?? []).some((_, i) => kept(shown, `rules:${i + 1}`))
}
export function showsDeck(shown: ShownProposal): boolean {
  return shown.parts.cards.some((_, i) => kept(shown, `card:${i + 1}`)) || shown.parts.changes.some((change) => kept(shown, `change:${String((change as { card?: unknown } | null)?.card)}`)) || showsTemplate(shown)
}

// Translated against the game as it stands; `leave` takes out the parts left out (#1003).
export function translated(doc: ProjectDoc, parts: ProposalParts, leave?: ReadonlySet<string>): Translated {
  return translateProposal(doc, parts, leave)
}

// The cards a translation adds, as rows of the game: what the panel and the wall draw.
export function proposedRows(edits: readonly EditIntent[]): ProjectRow[] {
  return edits.flatMap((edit) => (edit.v === 'addRow' ? [{ id: edit.cardRef, fields: edit.fields }] : []))
}

// The game as it would be with the proposal accepted, for the wall and the table to draw (#1003):
// the changed cards in their own places with their new values, and the new cards after the deck's,
// with which cards are new and what each changed card's cells were and become. A template (#1005) is
// the game's template in it, so every card is drawn as the proposal would draw it; its new fields'
// values are changed cells like any other, and `redrawn` is every card of the game the proposed
// template draws differently — on `face`, the face the wall shows the proposal on. `templated` says
// the view carries a template, which only the wall shows: the table holds the game's own columns and
// no template, so its comparison would say every card changed and show no new column at all.
export type ProposalView = { doc: ProjectDoc; added: ReadonlySet<string>; changed: ReadonlyMap<string, readonly ChangedCell[]>; redrawn: ReadonlySet<string>; face: string; templated: boolean }
export function proposalView(doc: ProjectDoc, read: Extract<Translated, { ok: true }>): ProposalView {
  const changed = new Map<string, ChangedCell[]>()
  const added = new Set<string>()
  const cellsOf = (cardRef: string): ChangedCell[] => {
    const had = changed.get(cardRef)
    if (had) return had
    const fresh: ChangedCell[] = []
    changed.set(cardRef, fresh)
    return fresh
  }
  let face = 'front'
  for (const part of read.parts) {
    if (part.kind === 'change') cellsOf(part.cardRef).push(...part.cells)
    else if (part.kind === 'card') added.add(part.cardRef)
    else if (part.kind === 'template') {
      face = part.face
      for (const edit of part.edits) if (edit.v === 'setCell') cellsOf(edit.cardRef).push({ field: edit.field, from: doc.rows.find((r) => r.id === edit.cardRef)?.fields[edit.field], to: edit.value })
    }
  }
  // The edits the game takes on accepting, applied to a copy: the cards in their places, the new
  // after the deck's, and the template the proposal brings.
  const after = read.edits.reduce(applyEdit, doc)
  const redrawn = new Set<string>()
  const before = doc.template.faces[face]
  const now = after.template.faces[face]
  const templated = read.parts.some((part) => part.kind === 'template')
  if (templated && now) {
    for (const row of after.rows) {
      const had = doc.rows.find((r) => r.id === row.id)
      if (had && (!before || JSON.stringify(elementsFor(before, had.fields)) !== JSON.stringify(elementsFor(now, row.fields)))) redrawn.add(row.id)
    }
  }
  return { doc: after, added, changed, redrawn, face, templated }
}

// The rulebook as a proposal would leave it, for the Regler tab to draw (#1006): every block of the
// book in its place, the blocks an entry takes the place of still standing where they stood and
// marked `gone`, and after them — or after the block an entry is placed after — the entry's own
// blocks, marked `new` when they are added and `changed` when they replace. `first` marks the block
// a run of one entry's marks opens with, where the mark is said in words. Null when the proposal
// brings no rule text.
export type RuleMark = 'new' | 'changed' | 'gone'
export type RuleEntry = { block: RuleBlock; mark: RuleMark | null; part?: string; first?: boolean }
export type RulesView = { title: string; entries: RuleEntry[]; added: number; rewritten: number }
export function rulesView(doc: ProjectDoc, read: Extract<Translated, { ok: true }>): RulesView | null {
  const parts = read.parts.flatMap((part) => (part.kind === 'rules' ? [part] : []))
  if (parts.length === 0) return null
  const entries: RuleEntry[] = (doc.rules?.blocks ?? []).map((block) => ({ block, mark: null }))
  for (const part of parts) {
    const edit = part.edits[0]
    if (edit?.v !== 'spliceRules') continue
    const gone = new Set(edit.replace)
    let at: number
    if (gone.size > 0) {
      const first = entries.findIndex((entry) => gone.has(entry.block.id))
      entries.forEach((entry, i) => {
        if (gone.has(entry.block.id)) entries[i] = { ...entry, mark: 'gone', part: part.key, first: i === first }
      })
      // The new blocks stand after the run of replaced blocks they begin at, so the old is read
      // before the new.
      at = first
      while (at < entries.length && entries[at]?.mark === 'gone' && entries[at]?.part === part.key) at++
    } else at = edit.after === null ? 0 : entries.findIndex((entry) => entry.block.id === edit.after) + 1
    const mark: RuleMark = gone.size > 0 ? 'changed' : 'new'
    entries.splice(at, 0, ...edit.blocks.map((block, i) => ({ block, mark, part: part.key, first: i === 0 })))
  }
  return {
    title: doc.rules?.title ?? doc.name,
    entries,
    added: parts.filter((part) => part.replaced.length === 0).length,
    rewritten: parts.filter((part) => part.replaced.length > 0).length,
  }
}

// How much rule text a proposal brings, in its own words: «1 tillägg i regelboken», «2 omskrivningar
// i regelboken» — the panel's summary, the book's band and what an accepted proposal says.
export function rulesWords(added: number, rewritten: number, t: T): string[] {
  const out: string[] = []
  if (added > 0) out.push(t(added === 1 ? 'ai.proposal.rules.added.one' : 'ai.proposal.rules.added.other', { n: added }))
  if (rewritten > 0) out.push(t(rewritten === 1 ? 'ai.proposal.rules.rewritten.one' : 'ai.proposal.rules.rewritten.other', { n: rewritten }))
  return out
}

// A cell's value as the old → new of a change says it: nothing as a dash, and a long text as the
// piece of it that changed with a few words around it — «…förloraren dricker 7 → …förloraren
// dricker 5». A whole effect text twice says nothing about what changed.
export function cellWords(from: ChangedCell['from'], to: ChangedCell['to']): [string, string] {
  const was = from === undefined || from === null ? '' : String(from)
  const now = to === null ? '' : String(to)
  if (was === '') return ['—', clip(now)]
  if (now === '') return [clip(was), '—']
  if (was.length <= 24 && now.length <= 24) return [was, now]
  let a = 0
  while (a < was.length && a < now.length && was[a] === now[a]) a++
  let b = 0
  while (b < was.length - a && b < now.length - a && was[was.length - 1 - b] === now[now.length - 1 - b]) b++
  const start = Math.max(0, was.lastIndexOf(' ', Math.max(0, a - 8)) + 1)
  const cut = (text: string) => {
    const end = text.length - b
    const stop = text.indexOf(' ', end + 1)
    const piece = text.slice(start, stop === -1 ? text.length : stop)
    return `${start > 0 ? '…' : ''}${piece}${stop === -1 ? '' : '…'}`
  }
  return [cut(was), cut(now)]
}
const clip = (text: string) => (text.length > 24 ? `${text.slice(0, 23)}…` : text)

// One changed cell as a line: «kostnad: 3 → 2», with the column named as the table's header names it
// (#1037, A4) — «Titel» and not the key «title» — wherever the line is said.
export function cellLine(cell: ChangedCell, t: T): string {
  const [from, to] = cellWords(cell.from, cell.to)
  return t('ai.proposal.cell', { field: fieldLabel(cell.field, t), from, to })
}

// Why a proposal could not be used, in the reader's words (A4): a whole sentence naming the card —
// a new one by its place in the proposal and its title, a changed one by its title and id (#1003) —
// and the field, symbol or meaning that was wrong.
export function problemWords(problem: ProposalProblem | { kind: 'broken' }, t: T): string {
  const card =
    'card' in problem
      ? problem.title
        ? t('ai.unusable.card.named', { n: problem.card, title: problem.title })
        : t('ai.unusable.card', { n: problem.card })
      : 'changed' in problem
        ? 'title' in problem && problem.title
          ? t('ai.unusable.changed.named', { id: problem.changed, title: problem.title })
          : t('ai.unusable.changed', { id: problem.changed })
        : ''
  switch (problem.kind) {
    case 'rules': {
      // Rule text's fault at the entry it is in, by its place and its heading (#1006).
      const part = problem.title !== undefined ? t('ai.unusable.rules.named', { n: problem.section, title: problem.title }) : t('ai.unusable.rules.part', { n: problem.section })
      const fault = problem.fault
      switch (fault.kind) {
        case 'unknown-ref': {
          // `zon:finns-inte` as «zonen «finns-inte»»: the kind in the reader's words, the id as written.
          const colon = fault.ref.indexOf(':')
          const word = fault.ref.slice(0, colon)
          const kind = word === 'zon' ? 'zone' : word === 'kort' ? 'card' : 'counter'
          return t(`ai.unusable.rules.unknown-ref.${kind}`, { part, id: fault.ref.slice(colon + 1) })
        }
        case 'keeps':
          return t(`ai.unusable.rules.keeps.${fault.what}`, { part })
        case 'unknown-kind':
          return t('ai.unusable.rules.unknown-kind', { part, type: fault.type })
        case 'bad-ref':
          return t('ai.unusable.rules.bad-ref', { part, written: fault.written })
        case 'unknown-icon':
          return t('ai.unusable.rules.unknown-icon', { part, icon: `{${fault.icon}}` })
        case 'unknown-role':
          return t('ai.unusable.rules.unknown-role', { part, role: fault.role })
        default:
          return t(`ai.unusable.rules.${fault.kind}`, { part })
      }
    }
    case 'template': {
      // The template's fault at the layer it is in, by the word the layer list uses (#1005).
      const where = problem.element !== undefined ? t('ai.unusable.template.layer', { element: problem.element }) : t('ai.unusable.template.whole')
      const fault = problem.fault
      switch (fault.kind) {
        case 'unknown-element':
          return t('ai.unusable.template.unknown-element', { where, type: fault.type })
        case 'unknown-field':
        case 'field-exists':
          return t(`ai.unusable.template.${fault.kind}`, { where, field: fieldLabel(fault.field, t) })
        case 'unknown-font':
          return t('ai.unusable.template.unknown-font', { where, font: fault.font })
        case 'unknown-role':
          return t('ai.unusable.template.unknown-role', { where, role: fault.role })
        case 'unknown-icon':
          return t('ai.unusable.template.unknown-icon', { where, icon: `{${fault.icon}}` })
        default:
          return t(`ai.unusable.template.${fault.kind}`, { where })
      }
    }
    case 'shape':
    case 'empty':
    case 'refused':
    case 'broken':
      return t(`ai.unusable.${problem.kind}`)
    case 'unknown-card':
      return t('ai.unusable.unknown-card', { id: problem.changed })
    case 'no-count':
    case 'bad-count':
    case 'repeated-card':
      return t(`ai.unusable.${problem.kind}`, { card })
    case 'unknown-icon':
      return t('ai.unusable.unknown-icon', { card, icon: `{${problem.icon}}` })
    case 'unknown-role':
      return t('ai.unusable.unknown-role', { card, role: problem.role })
    case 'wrong-kind':
      return t(problem.column === 'number' ? 'ai.unusable.wrong-kind.number' : 'ai.unusable.wrong-kind.truth', { card, field: fieldLabel(problem.field, t) })
    default:
      return t(`ai.unusable.${problem.kind}`, { card, field: fieldLabel(problem.field, t) })
  }
}
