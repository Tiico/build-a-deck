import { describe, expect, it } from 'vitest'
import { renderRules, type RuleDoc } from '@byd/template'
import { findRules } from '../src/rules/search.js'

const names = { zones: { draw: 'Draghög', discard: 'Kasthög' }, cards: { drake: 'Drake' } }
const doc: RuleDoc = {
  title: 'Skogens herrar',
  blocks: [
    { kind: 'heading', id: 'h1', level: 1, text: 'Så spelar ni' },
    { kind: 'text', id: 't1', text: 'Spelet slutar när [[zon:draw]] är tom.\n\nDen med flest poäng vinner.' },
    { kind: 'heading', id: 'h2', level: 2, text: 'Kasthögen' },
    { kind: 'list', id: 'l1', ordered: true, items: ['Dra ur [[zon:draw]].', 'Lägg i [[zon:discard]].'] },
    { kind: 'text', id: 't2', text: '[[zon:discard]] ligger öppen. Ingen får ta ur den.' },
    { kind: 'setup', id: 's1', caption: 'Bordet' },
  ],
}
const out = renderRules(doc, names)

describe('looking a rule up mid-game (B7)', () => {
  it('finds the passages that mention a word, each under the heading it stands beneath', () => {
    const hits = findRules(out, 'kasthög')
    expect(hits.map((h) => h.heading)).toEqual(['Kasthögen', 'Kasthögen'])
    expect(hits[0]?.text).toContain('Lägg i Kasthög.')
    // A list is one passage: the steps make no sense split apart.
    expect(hits[0]?.text).toContain('Dra ur Draghög.')
    expect(hits[1]?.text).toBe('Kasthög ligger öppen. Ingen får ta ur den.')
  })

  it('searches what the reader sees, so a name found is the name shown, not the id behind it', () => {
    expect(findRules(out, 'draghög')).toHaveLength(2)
    expect(findRules(out, 'discard')).toEqual([])
    expect(findRules(out, 'DRAGHÖG')).toHaveLength(2)
  })

  it('says nothing for an empty question, and nothing at all when no rule mentions it', () => {
    expect(findRules(out, '')).toEqual([])
    expect(findRules(out, '   ')).toEqual([])
    expect(findRules(out, 'tärning')).toEqual([])
  })

  it('gives each hit somewhere to jump to in the book', () => {
    const hits = findRules(out, 'poäng')
    expect(hits).toHaveLength(1)
    expect(hits[0]?.block).toBe('t1')
  })
})
