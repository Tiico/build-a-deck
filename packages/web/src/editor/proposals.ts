import type { EditIntent } from '@byd/server/doc'
import { translateProposal, type ChangedCell, type ProposalProblem, type Translated } from '@byd/server/proposal'
import { fieldLabel } from './fields.js'
import type { ProjectDoc, ProjectRow } from './types.js'
import type { T } from '../i18n/index.js'

// An AI proposal as the editor holds it (#1002): the parts the answer brought, as they were written,
// read and translated against the game as it stands now — never once and kept, because the game can
// move while the proposal waits (a co-editor adds a card, and the ids it would take are taken), and
// what is accepted must be what the game takes at the moment it is accepted.
//
// Framework-free, so the panel, the wall and the table read a proposal the same way.

// The parts that arrived, in the shape the proposal model reads: new cards, and changed cards
// (#1003). The parts later slices add (#1005, #1006) are gathered under their own keys beside them.
export type ProposalParts = { cards: unknown[]; changes: unknown[] }
export const noParts = (): ProposalParts => ({ cards: [], changes: [] })
export function withPart(parts: ProposalParts, key: string, part: unknown): ProposalParts {
  if (key === 'cards') return { ...parts, cards: [...parts.cards, part] }
  if (key === 'changes') return { ...parts, changes: [...parts.changes, part] }
  return parts
}

// A proposal as the editor shows it on the wall and in the table: its parts, and the ones the
// designer has left out with «Välj delar…» (#1003), which the wall and the table leave out too.
export type ShownProposal = { parts: ProposalParts; leave: ReadonlySet<string> }

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
// with which cards are new and what each changed card's cells were and become.
export type ProposalView = { doc: ProjectDoc; added: ReadonlySet<string>; changed: ReadonlyMap<string, readonly ChangedCell[]> }
export function proposalView(doc: ProjectDoc, read: Extract<Translated, { ok: true }>): ProposalView {
  const changed = new Map<string, readonly ChangedCell[]>()
  const added = new Set<string>()
  const fresh: ProjectRow[] = []
  for (const part of read.parts) {
    if (part.kind === 'change') changed.set(part.cardRef, part.cells)
    else if (part.kind === 'card') {
      added.add(part.cardRef)
      fresh.push({ id: part.cardRef, fields: part.fields })
    }
  }
  const rows = doc.rows.map((row) => {
    const cells = changed.get(row.id)
    if (!cells) return row
    const fields = { ...row.fields }
    for (const cell of cells) fields[cell.field] = cell.to
    return { ...row, fields }
  })
  return { doc: { ...doc, rows: [...rows, ...fresh] }, added, changed }
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
