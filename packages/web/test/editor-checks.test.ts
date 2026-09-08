import { describe, expect, it } from 'vitest'
import { deckIssues, groupIssues, issueDetail } from '../src/editor/checks.js'
import { projectDoc } from './project-doc.js'
import type { Element } from '../src/editor/types.js'
import { translate, type T } from '../src/i18n/index.js'

const tiny: Element = { kind: 'text', id: 'flavour', x: 6, y: 70, w: 51, h: 10, bind: { field: 'flavour' }, font: { family: 'system-ui', sizePt: 5 }, color: '#111111' }
const bled: Element = { kind: 'shape', id: 'paper', x: -3, y: -3, w: 69, h: 94, shape: 'rect', fill: '#ffffff' }

function deck() {
  const doc = projectDoc()
  doc.template.faces['front']!.base = [bled, tiny]
  doc.template.faces['back']!.base = [bled]
  return doc
}

const swedish: T = (key, params) => translate('sv', key, params)

describe('the physical checks over a whole deck (E5)', () => {
  it('reads every card on every face and says which card each anmärkning belongs to', () => {
    const found = deckIssues(deck())
    // Three cards, one fault each, on the front only.
    expect(found).toHaveLength(3)
    expect(found.map((f) => f.cardRef)).toEqual(['dragon', 'knight', 'wizard'])
    expect(found[0]).toMatchObject({ face: 'front', element: 'flavour', code: 'text-too-small', severity: 'error' })
    // A deck with nothing wrong says nothing.
    const clean = deck()
    clean.template.faces['front']!.base = [bled]
    expect(deckIssues(clean)).toEqual([])
  })

  it('gathers them by kind, errors first, because a fault in the template is a fault on every card', () => {
    const doc = deck()
    doc.template.faces['front']!.base = [bled, tiny, { kind: 'shape', id: 'rule', x: 6, y: 20, w: 51, h: 0, shape: 'line', stroke: '#333333', strokeMm: 0.3 }]
    const groups = groupIssues(deckIssues(doc))
    expect(groups.map((g) => [g.code, g.severity, g.cards.length])).toEqual([
      ['text-too-small', 'error', 3],
      ['hairline', 'warning', 3],
    ])
    expect(groups[0]?.elements).toEqual(['flavour'])
    // The group carries what was measured; the words are written where the reader is (A4).
    expect(groups[0]?.values).toMatchObject({ sizePt: 5, floor: 6 })
    expect(issueDetail(groups[0]!, swedish)).toContain('5 pt är under 6 pt')
    expect(issueDetail(groups[0]!, (key, params) => translate('en', key, params))).toContain('smallest readable size')
    expect(groups[0]?.faces).toEqual(['front'])
  })

  it('counts what stops an order apart from what only warns', () => {
    const groups = groupIssues(deckIssues(deck()))
    expect(groups.filter((g) => g.severity === 'error')).toHaveLength(1)
    expect(groupIssues([])).toEqual([])
  })
})
