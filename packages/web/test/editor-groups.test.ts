import { describe, expect, it } from 'vitest'
import type { ProjectDoc } from '@byd/server'
import { cardsInGroup, groupColumn, groupOfRow, groupsOf, overriddenIds, ruleLabel } from '../src/editor/groups.js'
import { projectDoc } from './project-doc.js'

// A deck whose cards carry a `typ` column, grouped by it on the front only.
function grouped(): ProjectDoc {
  const doc = structuredClone(projectDoc())
  doc.rows = [
    { id: 'dragon', fields: { typ: 'varelse', title: 'Drake', body: 'Flygande.', antal: 2 } },
    { id: 'trap', fields: { typ: 'fälla', title: 'Fallgrop', body: 'Spelas dolt.', antal: 1 } },
    { id: 'snare', fields: { typ: 'fälla', title: 'Snara', body: 'Stoppa ett drag.', antal: 1 } },
    { id: 'nameless', fields: { typ: '', title: 'Namnlös', body: '', antal: 1 } },
  ]
  doc.template.faces['front']!.variantBy = 'typ'
  doc.template.faces['front']!.variants = {
    fälla: { override: [{ kind: 'text', id: 'title', x: 5, y: 5, w: 53, h: 10, bind: { field: 'title' }, font: { family: 'sans-serif', sizePt: 14, weight: 700 }, color: '#e74c3c' }] },
  }
  return doc
}

describe('the column that makes the groups (#13)', () => {
  it('is the faces’ variantBy, and is nothing at all until one is chosen', () => {
    expect(groupColumn(projectDoc())).toBeNull()
    expect(groupColumn(grouped())).toBe('typ')
  })

  it('makes a group of every value in that column, so a new card joins one by its data alone', () => {
    expect(groupsOf(grouped())).toEqual(['varelse', 'fälla'])
    expect(groupsOf(projectDoc())).toEqual([])
  })

  it('keeps a group the template has designed even when no card carries its value any more', () => {
    const doc = grouped()
    doc.rows = doc.rows.filter((r) => r.fields['typ'] !== 'fälla')
    expect(groupsOf(doc)).toEqual(['varelse', 'fälla'])
    expect(cardsInGroup(doc, 'fälla')).toEqual([])
  })

  it('says which cards a group is about, and which group a card falls into', () => {
    const doc = grouped()
    expect(cardsInGroup(doc, 'fälla').map((r) => r.id)).toEqual(['trap', 'snare'])
    expect(groupOfRow(doc, doc.rows[1]!)).toBe('fälla')
    // An empty value is no group: the card gets the base look (L3).
    expect(groupOfRow(doc, doc.rows[3]!)).toBeNull()
    expect(groupOfRow(projectDoc(), projectDoc().rows[0]!)).toBeNull()
  })

  it('names a group as the rule it is, never as the cards in it', () => {
    expect(ruleLabel('typ', 'fälla')).toBe('typ = fälla')
  })
})

describe('what a group changes against the base (#13)', () => {
  it('is the ids it overrides on that face, and nothing on a face it has not touched', () => {
    const doc = grouped()
    expect([...overriddenIds(doc.template.faces['front']!, 'fälla')]).toEqual(['title'])
    expect([...overriddenIds(doc.template.faces['front']!, 'varelse')]).toEqual([])
    expect([...overriddenIds(doc.template.faces['back']!, 'fälla')]).toEqual([])
  })

  it('counts an element the group takes away as changed too', () => {
    const doc = grouped()
    doc.template.faces['front']!.variants['fälla']!.remove = ['body']
    expect([...overriddenIds(doc.template.faces['front']!, 'fälla')].sort()).toEqual(['body', 'title'])
  })
})
