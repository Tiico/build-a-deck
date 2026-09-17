import { describe, expect, it } from 'vitest'
import { changeOf, diffProjects } from '../src/diff.js'
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
    expect(diffProjects(base(), base())).toEqual({ rows: [], template: false, setup: false, icons: false, rules: false, reordered: false, columns: false })
  })

  // What this does not look at, written down (#177). `palette`, `framing` and `fonts` are parts of
  // the document like the rest, and none of them is compared here — a picture nudged in its frame
  // (E1) or a font swapped (B3) comes out as no change at all. A byte-identical document is refused
  // a version, so an empty change is reachable and never means "nothing happened": it is the whole
  // reason the history has a word for a save it cannot name.
  it('reports a change it does not look at as no change at all', () => {
    const diff = diffProjects(base(), { ...base(), framing: { 'dragon/title': { zoom: 1.4 } } })
    expect(diff.rows).toEqual([])
    expect(changeOf(2, diff)).toEqual({ rev: 2, added: 0, removed: 0, changed: 0, parts: [], reordered: false, columns: false })
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

  // The rulebook (B7) is a part of the document like the template and the setup, and a save that
  // only rewrote a rule is a save where something happened. It was the one part the diff could
  // not see, so the history read it as an empty save.
  it('says when the rulebook moved, and holds it apart from the other parts', () => {
    const withRules = { ...base(), rules: { title: 'Så spelas det', blocks: [{ kind: 'text' as const, id: 'dra', text: 'Dra ett kort.' }] } }
    expect(diffProjects(base(), withRules).rules).toBe(true)
    expect(diffProjects(base(), withRules).template).toBe(false)

    const rewritten = { ...withRules, rules: { ...withRules.rules, blocks: [{ kind: 'text' as const, id: 'dra', text: 'Dra två kort.' }] } }
    expect(diffProjects(withRules, rewritten).rules).toBe(true)
    expect(diffProjects(withRules, structuredClone(withRules)).rules).toBe(false)
  })
})

// What a whole history says about itself (#177). A row in the history has to say what its save
// changed, and fifteen full diffs of a 308-card deck is not something to send so a panel can
// print three numbers. So the diff is boiled down to the counts and the parts, which is all a
// row ever shows, and that is what travels.
describe('what one save changed, small enough for a whole history to travel (B4, #177)', () => {
  const change = (before: ProjectDoc, after: ProjectDoc, rev = 2) => changeOf(rev, diffProjects(before, after))

  it('counts the cards that came, went and moved, and names the parts that are not cards', () => {
    const after = base()
    after.rows.push({ id: 'wizard', fields: { title: 'Trollkarl', antal: 1 } })
    after.rows.push({ id: 'troll', fields: { title: 'Troll', antal: 1 } })
    after.rows[0]!.fields['cost'] = 4
    after.setup = { ...after.setup, seats: ['A', 'B', 'C'] }

    expect(change(base(), after)).toEqual({ rev: 2, added: 2, removed: 0, changed: 1, parts: ['setup'], reordered: false, columns: false })
  })

  // The parts are named in one fixed order wherever they are read, so a row of chips does not
  // reshuffle itself between two versions that happen to have touched the same things.
  it('names the four parts in one order, whichever of them moved', () => {
    const after = base()
    after.icons = { 'sköld': 'asset:abc' }
    after.rules = { title: 'Så spelas det', blocks: [] }
    after.template = { faces: {} }
    after.setup = { ...after.setup, seats: ['A'] }
    expect(change(base(), after).parts).toEqual(['template', 'setup', 'rules', 'icons'])
  })

  it('says a save that changed nothing at all changed nothing at all', () => {
    expect(change(base(), base())).toEqual({ rev: 2, added: 0, removed: 0, changed: 0, parts: [], reordered: false, columns: false })
  })

  it('carries the game’s new name, and the orders that belong to the document rather than a card', () => {
    const renamed = base()
    renamed.name = 'Skogens andar'
    renamed.rows.reverse()
    expect(change(base(), renamed)).toMatchObject({ renamed: 'Skogens andar', reordered: true })
  })
})
