import { describe, expect, it } from 'vitest'
import { applyEdit, type EditIntent } from '../src/edits.js'
import { template } from './deck.js'
import { twoSeatSetup } from './fixture.js'
import type { ProjectDoc } from '../src/projects.js'

const base = (): ProjectDoc => {
  const { zones, seats, floor } = twoSeatSetup()
  return {
    name: 'Skogens herrar',
    template,
    rows: [
      { id: 'dragon', fields: { title: 'Drake', antal: 2 } },
      { id: 'knight', fields: { title: 'Riddare', antal: 1 } },
    ],
    icons: {},
    setup: { zones, seats, floor, deckZone: 'draw' },
  }
}
const after = (doc: ProjectDoc, ...edits: EditIntent[]): ProjectDoc => edits.reduce(applyEdit, doc)

describe('an edit is a thing that happened to the project (D3)', () => {
  it('leaves the document it was given alone: an edit makes a new one', () => {
    const before = base()
    const next = applyEdit(before, { v: 'rename', name: 'Skogens andar' })
    expect(before.name).toBe('Skogens herrar')
    expect(next.name).toBe('Skogens andar')
    expect(next.rows).toBe(before.rows)
  })

  it('writes the deck: a cell, a card added, a card taken away, the whole table at once', () => {
    const doc = after(
      base(),
      { v: 'setCell', cardRef: 'dragon', field: 'title', value: 'Drakhona' },
      { v: 'addRow', cardRef: 'troll', fields: { title: 'Troll', antal: 1 } },
      { v: 'removeRow', cardRef: 'knight' },
    )
    expect(doc.rows.map((r) => r.id)).toEqual(['dragon', 'troll'])
    expect(doc.rows[0]?.fields['title']).toBe('Drakhona')
    const replaced = applyEdit(doc, { v: 'replaceRows', rows: [{ id: 'ny', fields: { title: 'Ny' } }] })
    expect(replaced.rows.map((r) => r.id)).toEqual(['ny'])
  })

  it('writes the template: an element patched, added, moved and taken away, in the base or in a group', () => {
    const moved = applyEdit(base(), { v: 'patchElement', face: 'front', id: 'title', patch: { x: 9 } })
    expect(moved.template.faces['front']?.base.find((e) => e.id === 'title')).toMatchObject({ x: 9 })

    const added = applyEdit(base(), { v: 'addElement', face: 'front', element: { kind: 'shape', id: 'ny', x: 5, y: 5, w: 10, h: 10, shape: 'rect', fill: '#fff' } })
    expect(added.template.faces['front']?.base.at(-1)?.id).toBe('ny')
    expect(() => applyEdit(added, { v: 'addElement', face: 'front', element: { kind: 'shape', id: 'ny', x: 0, y: 0, w: 1, h: 1, shape: 'rect' } })).toThrow(/ny/)

    const reordered = applyEdit(added, { v: 'moveElement', face: 'front', id: 'ny', to: 0 })
    expect(reordered.template.faces['front']?.base[0]?.id).toBe('ny')
    expect(applyEdit(reordered, { v: 'removeElement', face: 'front', id: 'ny' }).template.faces['front']?.base.some((e) => e.id === 'ny')).toBe(false)

    // With a group open the change is that group's alone, and the base stays as it was (#13).
    const grouped = after(base(), { v: 'setGroupColumn', column: 'typ' }, { v: 'patchElement', face: 'front', id: 'title', patch: { x: 20 }, group: 'fälla' })
    expect(grouped.template.faces['front']?.variants['fälla']?.override?.[0]).toMatchObject({ id: 'title', x: 20 })
    expect(grouped.template.faces['front']?.base.find((e) => e.id === 'title')).toMatchObject({ x: 5 })
    expect(applyEdit(grouped, { v: 'resetElement', face: 'front', id: 'title', group: 'fälla' }).template.faces['front']?.variants['fälla']?.override).toEqual([])
    expect(applyEdit(grouped, { v: 'setGroupColumn', column: null }).template.faces['front']?.variantBy).toBeUndefined()
  })

  it('writes the table: the recipe, a zone of one\'s own, and what a zone is called', () => {
    const three = applyEdit(base(), { v: 'setRecipe', recipe: { players: 3, mine: true, discard: true, market: false, counters: [] } })
    expect(three.setup.seats).toEqual(['A', 'B', 'C'])
    expect(three.setup.zones.find((z) => z.id === 'discard')?.name).toBe('Kasthög')
    // A zone the recipe makes is named in the language the designer is building the game in
    // (A4): the words come with the edit, so the actor writes exactly what the editor showed.
    const english = applyEdit(base(), {
      v: 'setRecipe',
      recipe: { players: 2, mine: true, discard: true, market: true, counters: [{ name: 'Score', start: 0 }] },
      words: { floor: 'Table', draw: 'Draw pile', drawShortcut: 'Put underneath', discard: 'Discard pile', discardShortcut: 'Discard', market: 'Market', marketShortcut: 'To the market', mine: 'In front of {seat}', mineShortcut: 'In front of me', counters: 'Counters {seat}', hand: 'Hand' },
    })
    expect(english.setup.zones.find((z) => z.id === 'market')?.name).toBe('Market')
    expect(english.setup.zones.find((z) => z.id === 'market')?.shortcut?.label).toBe('To the market')
    expect(english.setup.zones.find((z) => z.id === 'counters:A')?.name).toBe('Counters A')
    // A zone that was already there keeps the name it was given: renaming is the designer's.
    expect(english.setup.zones.find((z) => z.id === 'discard')?.name).toBe('Kasthög')

    const withZone = applyEdit(three, { v: 'addZone', id: 'altar', kind: 'area', name: 'Altaret' })
    expect(withZone.setup.zones.at(-1)).toMatchObject({ id: 'altar', kind: 'area', name: 'Altaret', visibility: 'all' })
    const named = applyEdit(withZone, { v: 'patchZone', id: 'altar', patch: { name: 'Helgedomen', owner: 'B' } })
    expect(named.setup.zones.find((z) => z.id === 'altar')).toMatchObject({ name: 'Helgedomen', owner: 'B' })
    expect(applyEdit(named, { v: 'removeZone', id: 'altar' }).setup.zones.some((z) => z.id === 'altar')).toBe(false)
    // The floor and the deck pile are not the designer's to remove.
    expect(() => applyEdit(named, { v: 'removeZone', id: 'table' })).toThrow()
  })

  it('writes the symbols and the rules, which travel with the document', () => {
    const doc = after(
      base(),
      { v: 'setIcon', name: 'sköld', url: 'asset:abc', credit: { licence: 'CC0-1.0', by: 'build-your-deck', source: 'skold' } },
      { v: 'renameIcon', from: 'sköld', to: 'försvar' },
      { v: 'setRules', rules: { title: 'Reglerna', blocks: [{ kind: 'text', id: 't1', text: 'Dra ett kort.' }] } },
    )
    expect(doc.icons).toEqual({ 'försvar': 'asset:abc' })
    expect(doc.credits?.['försvar']?.source).toBe('skold')
    expect(doc.rules?.blocks).toHaveLength(1)
    expect(applyEdit(doc, { v: 'removeIcon', name: 'försvar' }).icons).toEqual({})
  })

  it('pins the type the game is set in, licence and all, and lets one go again (B3)', () => {
    const doc = after(
      base(),
      { v: 'setFont', family: 'Rubrik', font: { stack: '"Rubrik", Georgia, serif', asset: 'asset:abc', licence: { licence: 'OFL-1.1', by: 'Typverket', source: 'rubrik.woff2' } } },
      { v: 'setFont', family: 'Brödtext', font: { stack: 'Georgia, serif' } },
    )
    expect(doc.fonts?.['Rubrik']?.asset).toBe('asset:abc')
    expect(doc.fonts?.['Rubrik']?.licence?.licence).toBe('OFL-1.1')
    // Naming the same family again replaces it: a file swapped for a better one is one entry.
    const swapped = applyEdit(doc, { v: 'setFont', family: 'Rubrik', font: { stack: '"Rubrik", Georgia, serif', asset: 'asset:def' } })
    expect(swapped.fonts?.['Rubrik']).toEqual({ stack: '"Rubrik", Georgia, serif', asset: 'asset:def' })
    expect(Object.keys(applyEdit(doc, { v: 'removeFont', family: 'Rubrik' }).fonts ?? {})).toEqual(['Brödtext'])
  })

  // A column of the deck (#32). It is one edit and not a rewritten table, because that is what
  // makes it one version and one step back (B4) — and because a log entry for a new empty column
  // should not carry five hundred cards.
  it('makes a column and takes one away, values, elements and grouping together', () => {
    const doc = applyEdit(base(), { v: 'addField', field: 'styrka' })
    expect(doc.rows.map((r) => r.fields['styrka'])).toEqual(['', ''])
    // A name the deck already answers to is a collision, not a second column.
    expect(() => applyEdit(doc, { v: 'addField', field: 'styrka' })).toThrow(/styrka/)
    expect(() => applyEdit(doc, { v: 'addField', field: 'title' })).toThrow(/title/)
    expect(() => applyEdit(doc, { v: 'addField', field: 'antal' })).toThrow(/antal/)

    // Taking a column away takes everything that pointed at it: the value on every card, the
    // elements on the template that drew it, and the grouping if it was grouped by it (#13).
    const grouped = after(base(), { v: 'setGroupColumn', column: 'title' })
    const gone = applyEdit(grouped, { v: 'removeField', field: 'title' })
    expect(gone.rows.every((r) => !('title' in r.fields))).toBe(true)
    expect(gone.template.faces['front']?.base.map((e) => e.id)).toEqual(['paper', 'frame'])
    expect(gone.template.faces['front']?.variantBy).toBeUndefined()
    // The card's copies are the engine's column and cannot be taken away (L4).
    expect(() => applyEdit(base(), { v: 'removeField', field: 'antal' })).toThrow(/antal/)
  })

  it('refuses an edit that names something the project does not have, rather than writing nonsense', () => {
    expect(() => applyEdit(base(), { v: 'setCell', cardRef: 'ingen', field: 'title', value: 'x' })).toThrow(/ingen/)
    expect(() => applyEdit(base(), { v: 'addRow', cardRef: 'dragon', fields: {} })).toThrow(/dragon/)
    expect(() => applyEdit(base(), { v: 'patchZone', id: 'ingen', patch: { name: 'x' } })).toThrow(/ingen/)
    expect(() => applyEdit(base(), { v: 'renameIcon', from: 'ingen', to: 'x' })).toThrow(/ingen/)
    expect(() => applyEdit(base(), { v: 'moveElement', face: 'front', id: 'ingen', to: 0 })).toThrow(/ingen/)
    expect(() => applyEdit(base(), { v: 'patchElement', face: 'baksidan', id: 'title', patch: {} })).toThrow(/baksidan/)
  })
})
