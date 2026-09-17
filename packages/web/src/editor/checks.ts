import { CARD_STANDARD_63x88 } from '@byd/engine'
import { remedyFor, validateCard, type Issue, type IssueCode, type IssueValues, type Remedy, type Severity } from '@byd/template'
import type { ProjectDoc } from './types.js'
import type { Key, T } from '../i18n/index.js'

// The physical checks (E5) over a whole deck, as the editor reads them. A fault is almost always
// the template's rather than one card's — the same element on every row — so the wall shows them
// gathered by kind, with the cards each one touches.
export type Found = Issue & { cardRef: string; face: string }
export type Group = { code: IssueCode; severity: Severity; values: IssueValues; cards: string[]; faces: string[]; elements: string[]; count: number }

// One edit that mends a whole group (#233).
//
// A fault is nearly always the template's — the same element on every row, which is the very
// reason the wall gathers them by kind rather than badging forty cards — so its remedy is the
// template's too. What comes back is therefore one patch per element and face, not one per card:
// forty cards failing on `body` are one edit, and applying it forty times would be thirty-nine
// versions of the deck saying nothing.
export type Fix = { face: string; element: string; patch: Remedy['patch'] }

export function fixesFor(doc: ProjectDoc, group: Pick<Group, 'code'>, found: readonly Found[]): Fix[] {
  const fixes = new Map<string, Fix>()
  for (const f of found) {
    if (f.code !== group.code) continue
    const template = doc.template.faces[f.face]
    const row = doc.rows.find((r) => r.id === f.cardRef)
    if (!template || !row) continue
    const remedy = remedyFor(f, { type: CARD_STANDARD_63x88, face: template, row: row.fields, ...(doc.fonts ? { fonts: doc.fonts } : {}) })
    if (!remedy) continue
    // The first answer for an element wins. Two cards can ask for different numbers — a box nudged
    // in from the right edge on one row and from the left on another — and the template has one
    // element to hold whichever it is told last. Taking the first keeps the edit the same every
    // time the button is pressed, which is what makes it something a designer can undo and repeat.
    const key = `${f.face}/${remedy.element}`
    if (!fixes.has(key)) fixes.set(key, { face: f.face, element: remedy.element, patch: remedy.patch })
  }
  return [...fixes.values()]
}

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
