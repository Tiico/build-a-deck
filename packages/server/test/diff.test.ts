import { describe, expect, it } from 'vitest'
import { diffProjects } from '../src/diff.js'
import { template } from './deck.js'
import { twoSeatSetup } from './fixture.js'
import type { ProjectDoc } from '../src/projects.js'

const base = (): ProjectDoc => {
  const { zones, seats, floor } = twoSeatSetup()
  return {
    name: 'Skogens herrar',
    template,
    rows: [
      { id: 'dragon', fields: { title: 'Drake', cost: 5, antal: 2 } },
      { id: 'knight', fields: { title: 'Riddare', cost: 3, antal: 1 } },
    ],
    icons: {},
    setup: { zones, seats, floor, deckZone: 'draw' },
  }
}

describe('what changed between two versions (B4): the diff the card table shows', () => {
  it('says nothing at all when nothing changed', () => {
    expect(diffProjects(base(), base())).toEqual({ rows: [], template: false, setup: false, icons: false, reordered: false, columns: false })
  })

  it('names the cards added, removed and changed, and which field moved from what to what', () => {
    const after = base()
    after.rows[0]!.fields['cost'] = 4
    after.rows[0]!.fields['body'] = 'Flygande.'
    after.rows.push({ id: 'wizard', fields: { title: 'Trollkarl', antal: 1 } })
    after.rows.splice(1, 1)

    const diff = diffProjects(base(), after)
    expect(diff.rows).toEqual([
      { kind: 'changed', cardRef: 'dragon', fields: [{ field: 'cost', from: 5, to: 4 }, { field: 'body', from: null, to: 'Flygande.' }] },
      { kind: 'removed', cardRef: 'knight' },
      { kind: 'added', cardRef: 'wizard' },
    ])
  })

  it('separates the order of the deck from the content of a card', () => {
    const after = base()
    after.rows.reverse()
    const diff = diffProjects(base(), after)
    expect(diff.rows).toEqual([])
    expect(diff.reordered).toBe(true)
  })

  // And the order of the columns from both of them (#46). It is a change to the document like
  // any other, so a version whose only change is a column moved must not read as a version where
  // nothing happened — which is what the history would have said before there was a word for it.
  it('separates the order of the columns from the order of the deck and from any card', () => {
    const before = base()
    const after = { ...base(), columns: ['antal', 'title'] }
    const diff = diffProjects(before, after)
    expect(diff.columns).toBe(true)
    expect(diff.rows).toEqual([])
    expect(diff.reordered).toBe(false)

    // An order written down that says exactly what the derivation already said is not a change
    // anybody made: the same columns in the same places.
    expect(diffProjects(before, { ...base(), columns: ['title', 'cost', 'antal'] }).columns).toBe(false)
  })

  it('says when the template, the setup or the symbols moved, without spelling out how', () => {
    const withName = { ...base(), name: 'Skogens andar' }
    expect(diffProjects(base(), withName)).toMatchObject({ name: { from: 'Skogens herrar', to: 'Skogens andar' } })

    const withIcon = { ...base(), icons: { 'sköld': 'asset:abc' } }
    expect(diffProjects(base(), withIcon).icons).toBe(true)

    const withSetup = base()
    withSetup.setup = { ...withSetup.setup, seats: ['A', 'B', 'C'] }
    expect(diffProjects(base(), withSetup).setup).toBe(true)

    const withTemplate = base()
    withTemplate.template = { faces: { ...template.faces, front: { ...template.faces['front']!, base: [] } } }
    expect(diffProjects(base(), withTemplate).template).toBe(true)
  })
})
