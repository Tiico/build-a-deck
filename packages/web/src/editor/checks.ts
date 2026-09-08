import { CARD_STANDARD_63x88 } from '@byd/engine'
import { validateCard, type Issue, type IssueCode, type IssueValues, type Severity } from '@byd/template'
import type { ProjectDoc } from './types.js'
import type { Key, T } from '../i18n/index.js'

// The physical checks (E5) over a whole deck, as the editor reads them. A fault is almost always
// the template's rather than one card's — the same element on every row — so the wall shows them
// gathered by kind, with the cards each one touches.
export type Found = Issue & { cardRef: string; face: string }
export type Group = { code: IssueCode; severity: Severity; values: IssueValues; cards: string[]; faces: string[]; elements: string[]; count: number }

export function deckIssues(doc: ProjectDoc): Found[] {
  const found: Found[] = []
  for (const row of doc.rows) {
    for (const [face, template] of Object.entries(doc.template.faces)) {
      for (const issue of validateCard({ type: CARD_STANDARD_63x88, face: template, row: row.fields, ...(doc.fonts ? { fonts: doc.fonts } : {}) })) found.push({ ...issue, cardRef: row.id, face })
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
      values: first?.values ?? {},
      cards: [...new Set(rows.map((r) => r.cardRef))],
      faces: [...new Set(rows.map((r) => r.face))],
      elements: [...new Set(rows.map((r) => r.element))],
      count: rows.length,
    }
  })
  return groups.sort((a, b) => (a.severity === b.severity ? b.count - a.count : a.severity === 'error' ? -1 : 1))
}

// A fault in the words a printer uses, in the reader's own language (A4). The catalogue is
// reached through a `t` the caller hands over rather than a hook, because this module is
// framework-free and the wall that shows the words already has one.
// What a fault means, said where the reader is (A4, E5). The check measures and hands over the
// numbers; the sentence is written here, in the reader's language, and one kind of fault reads
// differently as an error than as a warning — an error is what will happen, a warning what may.
export function issueDetail(group: Pick<Group, 'code' | 'severity' | 'values'>, t: T): string {
  const v = { ...group.values, ...('blindness' in group.values ? { blindness: t(BLINDNESS_WORDS[String(group.values['blindness'])] ?? 'wall.eye.normal') } : {}) }
  switch (group.code) {
    case 'text-too-small':
      return group.severity === 'error' ? t('wall.detail.text-too-small.error', v) : t('wall.detail.text-too-small.warning', v)
    case 'low-contrast':
      return group.severity === 'error' ? t('wall.detail.low-contrast.error', v) : t('wall.detail.low-contrast.warning', v)
    case 'outside-safe-area':
      return group.severity === 'error' ? t('wall.detail.outside-safe-area.error', v) : t('wall.detail.outside-safe-area.warning', v)
    case 'short-of-bleed':
      return t('wall.detail.short-of-bleed.error', v)
    case 'hairline':
      return group.severity === 'error' ? t('wall.detail.hairline.error', v) : t('wall.detail.hairline.warning', v)
    case 'unpinned-font':
      return t('wall.detail.unpinned-font.warning', v)
    case 'colour-only':
      return t('wall.detail.colour-only.warning', v)
  }
}

// The eyes the wall is read with are the same words the colour check names (E5).
const BLINDNESS_WORDS: Record<string, Key> = {
  protanopia: 'wall.eye.protanopia',
  deuteranopia: 'wall.eye.deuteranopia',
  tritanopia: 'wall.eye.tritanopia',
}

export function issueWords(t: T): Record<IssueCode, string> {
  return {
    'text-too-small': t('wall.issue.text-too-small'),
    'low-contrast': t('wall.issue.low-contrast'),
    'outside-safe-area': t('wall.issue.outside-safe-area'),
    'short-of-bleed': t('wall.issue.short-of-bleed'),
    hairline: t('wall.issue.hairline'),
    'unpinned-font': t('wall.issue.unpinned-font'),
    'colour-only': t('wall.issue.colour-only'),
  }
}
export { CARD_STANDARD_63x88 }
