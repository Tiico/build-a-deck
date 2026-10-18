import { translateProposal, type EditIntent, type ProposalProblem, type Translated } from '@byd/server/doc'
import type { ProjectDoc, ProjectRow } from './types.js'
import type { T } from '../i18n/index.js'

// An AI proposal as the editor holds it (#1002): the parts the answer brought, as they were written,
// read and translated against the game as it stands now — never once and kept, because the game can
// move while the proposal waits (a co-editor adds a card, and the ids it would take are taken), and
// what is accepted must be what the game takes at the moment it is accepted.
//
// Framework-free, so the panel and the wall read a proposal the same way.

// The parts that arrived, in the shape the proposal model reads. Only cards in this slice; the parts
// later slices add (#1003, #1005, #1006) are gathered under their own keys beside them.
export type ProposalParts = { cards: unknown[] }
export const noParts = (): ProposalParts => ({ cards: [] })
export function withPart(parts: ProposalParts, key: string, part: unknown): ProposalParts {
  return key === 'cards' ? { ...parts, cards: [...parts.cards, part] } : parts
}

export function translated(doc: ProjectDoc, parts: ProposalParts): Translated {
  return translateProposal(doc, parts)
}

// The cards a translation adds, as rows of the game: what the panel and the wall draw.
export function proposedRows(edits: readonly EditIntent[]): ProjectRow[] {
  return edits.flatMap((edit) => (edit.v === 'addRow' ? [{ id: edit.cardRef, fields: edit.fields }] : []))
}

// Why a proposal could not be used, in the reader's words (A4): a whole sentence naming the card by
// its place in the proposal and its title, and the field, symbol or meaning that was wrong.
export function problemWords(problem: ProposalProblem | { kind: 'broken' }, t: T): string {
  const card = 'card' in problem ? (problem.title ? t('ai.unusable.card.named', { n: problem.card, title: problem.title }) : t('ai.unusable.card', { n: problem.card })) : ''
  switch (problem.kind) {
    case 'shape':
    case 'empty':
    case 'refused':
    case 'broken':
      return t(`ai.unusable.${problem.kind}`)
    case 'no-count':
      return t('ai.unusable.no-count', { card })
    case 'unknown-icon':
      return t('ai.unusable.unknown-icon', { card, icon: `{${problem.icon}}` })
    case 'unknown-role':
      return t('ai.unusable.unknown-role', { card, role: problem.role })
    default:
      return t(`ai.unusable.${problem.kind}`, { card, field: problem.field })
  }
}
