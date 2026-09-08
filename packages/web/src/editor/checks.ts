import { CARD_STANDARD_63x88 } from '@byd/engine'
import { validateCard, type Issue, type IssueCode, type Severity } from '@byd/template'
import type { ProjectDoc } from './types.js'

// The physical checks (E5) over a whole deck, as the editor reads them. A fault is almost always
// the template's rather than one card's — the same element on every row — so the wall shows them
// gathered by kind, with the cards each one touches.
export type Found = Issue & { cardRef: string; face: string }
export type Group = { code: IssueCode; severity: Severity; detail: string; cards: string[]; faces: string[]; elements: string[]; count: number }

export function deckIssues(doc: ProjectDoc): Found[] {
  const found: Found[] = []
  for (const row of doc.rows) {
    for (const [face, template] of Object.entries(doc.template.faces)) {
      for (const issue of validateCard({ type: CARD_STANDARD_63x88, face: template, row: row.fields })) found.push({ ...issue, cardRef: row.id, face })
    }
  }
  return found
}

// Errors before warnings: one stops an order, the other does not.
export function groupIssues(found: readonly Found[]): Group[] {
  const codes = [...new Set(found.map((f) => f.code))]
  const groups = codes.map((code): Group => {
    const rows = found.filter((f) => f.code === code)
    const first = rows[0]
    return {
      code,
      severity: rows.some((r) => r.severity === 'error') ? 'error' : 'warning',
      detail: first?.detail ?? '',
      cards: [...new Set(rows.map((r) => r.cardRef))],
      faces: [...new Set(rows.map((r) => r.face))],
      elements: [...new Set(rows.map((r) => r.element))],
      count: rows.length,
    }
  })
  return groups.sort((a, b) => (a.severity === b.severity ? b.count - a.count : a.severity === 'error' ? -1 : 1))
}

export const ISSUE_WORDS: Record<IssueCode, string> = {
  'text-too-small': 'för liten text',
  'low-contrast': 'för svag kontrast',
  'outside-safe-area': 'för nära kanten',
  'short-of-bleed': 'når inte utfallet',
  hairline: 'för tunn linje',
  'colour-only': 'skiljs bara av färg',
}
export { CARD_STANDARD_63x88 }
