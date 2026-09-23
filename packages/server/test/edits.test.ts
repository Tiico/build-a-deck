import { describe, expect, it } from 'vitest'
import { applyEdit, columnsOf, drawnBy, type EditIntent } from '../src/edits.js'
import { openingSetup } from '../src/recipe.js'
import { template } from './deck.js'
import { twoSeatSetup } from './fixture.js'
import type { ProjectDoc } from '../src/projects.js'
import type { Element } from '@byd/template'

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
    // And a patch that lands on the value the element already had goes through like any other: a
    // drag that ends where it started, a colour set to the colour it has. What is refused is an id
    // the face does not have (#41), never a change that changes nothing — the same call with one
    // letter different in the id is the whole of the difference. `title` really is at x 5, so the
    // patch below really is one that changes nothing.
    expect(base().template.faces['front']?.base.find((e) => e.id === 'title')).toMatchObject({ x: 5 })
    expect(() => applyEdit(base(), { v: 'patchElement', face: 'front', id: 'title', patch: { x: 5 } })).not.toThrow()
    expect(() => applyEdit(base(), { v: 'patchElement', face: 'front', id: 'titel', patch: { x: 5 } })).toThrow(/titel/)

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
    const three = applyEdit(base(), { v: 'setRecipe', recipe: { players: 3, counters: [] } })
    expect(three.setup.seats).toEqual(['A', 'B', 'C'])
    expect(three.setup.zones.find((z) => z.id === 'discard')?.name).toBe('Kasthög')
    // A seat that arrives brings zones, and they are named in the language the designer is
    // building the game in (A4): the words come with the edit, so the actor writes exactly what
    // the editor showed.
    const english = { floor: 'Table', draw: 'Draw pile', drawShortcut: 'Put underneath', drawShuffle: 'Shuffle', discard: 'Discard pile', discardShortcut: 'Discard', mine: 'In front of {seat}', mineShortcut: 'In front of me', counters: 'Counters {seat}', hand: 'Hand' }
    const counters = [{ name: 'Score', start: 0 }]
    const opened = { ...base(), setup: openingSetup({ players: 2, counters }, english) }
    const third = applyEdit(opened, { v: 'setRecipe', recipe: { players: 3, counters }, words: english })
    expect(third.setup.zones.find((z) => z.id === 'mine:C')?.name).toBe('In front of C')
    expect(third.setup.zones.find((z) => z.id === 'mine:C')?.shortcut?.label).toBe('In front of me')
    expect(third.setup.zones.find((z) => z.id === 'counters:C')?.name).toBe('Counters C')
    // Och zonerna som redan stod där behåller sina namn: att döpa om är designerns.
    expect(third.setup.zones.find((z) => z.id === 'mine:A')?.name).toBe('In front of A')

    const withZone = applyEdit(three, { v: 'addZone', id: 'altar', kind: 'area', name: 'Altaret' })
    expect(withZone.setup.zones.at(-1)).toMatchObject({ id: 'altar', kind: 'area', name: 'Altaret', visibility: 'all' })
    const named = applyEdit(withZone, { v: 'patchZone', id: 'altar', patch: { name: 'Helgedomen', owner: 'B' } })
    expect(named.setup.zones.find((z) => z.id === 'altar')).toMatchObject({ name: 'Helgedomen', owner: 'B' })
    expect(applyEdit(named, { v: 'removeZone', id: 'altar' }).setup.zones.some((z) => z.id === 'altar')).toBe(false)
    // The floor and the deck pile are not the designer's to remove.
    expect(() => applyEdit(named, { v: 'removeZone', id: 'table' })).toThrow()
  })

  // Bordet är designerns (B5, reviderat): varje zon och hög går att ta bort, receptets egna
  // inräknade. Kvar står de tre bordet inte kan vara utan — filten, platsernas händer och den
  // hög leken ligger i.
  it('lets the designer take away the recipe\'s own zones, and keeps the three the table cannot be without', () => {
    const doc = { ...base(), setup: openingSetup({ players: 2, counters: [{ name: 'Poäng', start: 0 }] }) }
    const without = after(doc, { v: 'removeZone', id: 'discard' }, { v: 'removeZone', id: 'mine:A' }, { v: 'removeZone', id: 'counters:B' })
    expect(without.setup.zones.map((z) => z.id)).toEqual(['table', 'draw', 'mine:B', 'counters:A', 'hand:A', 'hand:B'])
    expect(() => applyEdit(without, { v: 'removeZone', id: 'table' })).toThrow(/table/)
    // En plats är en hand (C3): handen går med platsen och inte för sig.
    expect(() => applyEdit(without, { v: 'removeZone', id: 'hand:A' })).toThrow(/hand:A/)
    expect(() => applyEdit(without, { v: 'removeZone', id: 'draw' })).toThrow(/draw/)
  })

  // Leken är en roll och inte en zon (B5, reviderat): den ligger i en hög, vilken som helst, och
  // att flytta rollen är vägen till att bli av med draghögen.
  // Borttagningens motsats (B5, reviderat): en zon per plats är en sak designern gjorde, så den
  // är en enda edit och ett enda steg tillbaka (B4) — inte åtta.
  it('gives every seat an area in front, or a counters zone, again in one edit', () => {
    const doc = { ...base(), setup: openingSetup({ players: 2, counters: [{ name: 'Poäng', start: 0 }] }) }
    const stripped = after(doc, { v: 'removeZone', id: 'mine:A' }, { v: 'removeZone', id: 'mine:B' })
    const back = applyEdit(stripped, { v: 'addSeatZone', role: 'mine', name: 'Inför {seat}', shortcut: { label: 'Framför mig', at: 'top' } })
    expect(back.setup.zones.filter((z) => z.id.startsWith('mine:')).map((z) => [z.id, z.name, z.owner, z.visibility])).toEqual([
      ['mine:A', 'Inför A', 'A', 'owner'],
      ['mine:B', 'Inför B', 'B', 'owner'],
    ])
    expect(back.setup.zones.find((z) => z.id === 'mine:A')?.geometry).toEqual(back.setup.zones.find((z) => z.id === 'mine:A')?.geometry)
    // En plats som redan har sin behåller den, namn och allt.
    const again = applyEdit(back, { v: 'addSeatZone', role: 'mine', name: 'Nytt {seat}' })
    expect(again.setup.zones.find((z) => z.id === 'mine:A')?.name).toBe('Inför A')
    const counted = applyEdit(after(stripped, { v: 'removeZone', id: 'counters:A' }, { v: 'removeZone', id: 'counters:B' }), { v: 'addSeatZone', role: 'counters', name: 'Räknare {seat}' })
    expect(counted.setup.zones.filter((z) => z.id.startsWith('counters:')).map((z) => [z.id, z.visibility, z.owner])).toEqual([
      ['counters:A', 'all', 'A'],
      ['counters:B', 'all', 'B'],
    ])
  })

  it('moves the deck to another pile, and the hands return there instead', () => {
    const doc = after(base(), { v: 'addZone', id: 'hog-1', kind: 'pile', name: 'Leken' }, { v: 'setDeck', id: 'hog-1' })
    expect(doc.setup.deckZone).toBe('hog-1')
    expect(doc.setup.zones.filter((z) => z.kind === 'hand').map((z) => z.returnTo)).toEqual(['hog-1', 'hog-1'])
    // Och nu går den gamla draghögen att ta bort.
    expect(applyEdit(doc, { v: 'removeZone', id: 'draw' }).setup.zones.some((z) => z.id === 'draw')).toBe(false)
    // Leken ligger i en hög. En yta är ingen hög, och en zon som inte finns är ingenting.
    expect(() => applyEdit(doc, { v: 'setDeck', id: 'table' })).toThrow(/table/)
    expect(() => applyEdit(doc, { v: 'setDeck', id: 'ingen' })).toThrow(/ingen/)
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

  // Where a column stands in the table (#46). Until now the order was purely derived — what the
  // template draws, in the template's order, then whatever else the cards carry — and nothing a
  // designer did could change it. A move is therefore a change to the document and not a view of
  // it: the order is what everyone with the project open sees, what the CSV export writes, and
  // what a step back has to be able to undo. So it lands in the log like every other edit.
  //
  // What is written down is an order and not a list of columns: which columns exist is still
  // derived, deliberately — a column is either drawn or written in, and both are visible without
  // being listed. The order is read over that derivation: the columns it names, in the order it
  // names them, then everything it does not mention where the derivation put it.
  it("moves a column, and the order it leaves is the document's", () => {
    const doc = after(base(), { v: 'addField', field: 'styrka' }, { v: 'addField', field: 'kostnad' })
    expect(columnsOf(doc)).toEqual(['title', 'antal', 'styrka', 'kostnad'])

    // Moved to stand before another column, which is the whole of what a drag says.
    const moved = applyEdit(doc, { v: 'moveField', field: 'kostnad', before: 'title' })
    expect(columnsOf(moved)).toEqual(['kostnad', 'title', 'antal', 'styrka'])
    // And the document it was given is untouched, as every edit leaves it.
    expect(columnsOf(doc)).toEqual(['title', 'antal', 'styrka', 'kostnad'])

    // Nothing before it is last, which is the far end of the same gesture.
    expect(columnsOf(applyEdit(moved, { v: 'moveField', field: 'title', before: null }))).toEqual(['kostnad', 'antal', 'styrka', 'title'])

    // A column nobody has moved keeps the place the derivation gave it: an order is not a list of
    // which columns there are, so a column made after the move stands where a new column stands.
    const later = applyEdit(moved, { v: 'addField', field: 'sällsynt' })
    expect(columnsOf(later)).toEqual(['kostnad', 'title', 'antal', 'styrka', 'sällsynt'])

    // And a column that goes takes its place in the order with it, rather than leaving a name
    // behind that nothing answers to.
    const gone = applyEdit(later, { v: 'removeField', field: 'kostnad' })
    expect(columnsOf(gone)).toEqual(['title', 'antal', 'styrka', 'sällsynt'])
    expect(gone.columns ?? []).not.toContain('kostnad')

    // What it refuses: a column the deck does not have, and standing before one it does not have
    // either. Both would write an order about something that is not there.
    expect(() => applyEdit(doc, { v: 'moveField', field: 'ingen', before: 'title' })).toThrow(/ingen/)
    expect(() => applyEdit(doc, { v: 'moveField', field: 'title', before: 'ingen' })).toThrow(/ingen/)
    // `antal` is the deck's own count and stands last wherever the table shows it (L4), so moving
    // it is a move nobody could see happen.
    expect(() => applyEdit(doc, { v: 'moveField', field: 'antal', before: 'title' })).toThrow(/antal/)
    // And standing before itself, which is a move that says nothing.
    expect(() => applyEdit(doc, { v: 'moveField', field: 'title', before: 'title' })).toThrow(/title/)
  })

  // The canvas door (#32): a designer goes to say which column an element shows, finds the column
  // missing, and makes it there. That is one thing she did, so it is one intent — two would be two
  // versions and two steps back, and the first step back would leave the new column standing with
  // the element bound to the field it had before, which is a state nobody asked for.
  it('makes a column and binds an element to it in the same edit', () => {
    const doc = applyEdit(base(), { v: 'addField', field: 'styrka', bind: { face: 'front', id: 'title' } })
    expect(doc.rows.map((r) => r.fields['styrka'])).toEqual(['', ''])
    expect(doc.template.faces['front']?.base.find((e) => e.id === 'title')).toMatchObject({ bind: { field: 'styrka' } })

    // With a group open it is that group's override that binds, exactly as `patchElement` alone
    // would have written it, and the base keeps the column it had (#13).
    const grouped = after(base(), { v: 'setGroupColumn', column: 'typ' }, { v: 'addField', field: 'styrka', bind: { face: 'front', id: 'title', group: 'fälla' } })
    expect(grouped.template.faces['front']?.variants['fälla']?.override?.[0]).toMatchObject({ id: 'title', bind: { field: 'styrka' } })
    expect(grouped.template.faces['front']?.base.find((e) => e.id === 'title')).toMatchObject({ bind: { field: 'title' } })

    // And the whole edit is refused together: an element the face does not have takes the column
    // with it rather than leaving a column behind that nothing asked for.
    expect(() => applyEdit(base(), { v: 'addField', field: 'styrka', bind: { face: 'front', id: 'ingen' } })).toThrow()
  })

  // `drawnBy` is the sentence the × puts in front of the designer before it takes a column, so it
  // is the B4 guarantee in the only form she ever sees it: what she is told is about to happen.
  // It and `removeField` describe the same operation and must say the same number, whatever the
  // template is shaped like — which is worth pinning now rather than the day the canvas grows an
  // `if` tool and a promise of one element quietly takes four.
  it('counts exactly the elements a column takes with it, condition and contents alike', () => {
    // Three ways an element can point at `styrka`: bound to it directly, bound to it inside a
    // group that stays, and guarded by a condition on it — and that condition is guarding two
    // elements that name nothing at all, which go with it because children shown only sometimes
    // must not become children shown always.
    const withIf = (): ProjectDoc => {
      const doc = base()
      const front = doc.template.faces['front']!
      return {
        ...doc,
        template: {
          ...doc.template,
          faces: {
            ...doc.template.faces,
            front: {
              ...front,
              base: [
                ...front.base,
                { kind: 'text', id: 'styrka', x: 5, y: 60, w: 20, h: 8, bind: { field: 'styrka' }, font: { family: 'sans-serif', sizePt: 10 }, color: '#111' },
                {
                  kind: 'if',
                  id: 'stark',
                  when: { field: 'styrka', nonEmpty: true },
                  children: [
                    { kind: 'shape', id: 'glow', x: 0, y: 0, w: 10, h: 10, shape: 'circle', fill: '#fd0' },
                    { kind: 'group', id: 'märke', x: 0, y: 0, children: [{ kind: 'shape', id: 'ring', x: 1, y: 1, w: 4, h: 4, shape: 'circle', fill: '#000' }] },
                  ],
                },
                { kind: 'group', id: 'fot', x: 0, y: 70, children: [{ kind: 'text', id: 'fotnot', x: 0, y: 0, w: 20, h: 5, bind: { field: 'styrka' }, font: { family: 'sans-serif', sizePt: 6 }, color: '#333' }] },
              ],
            },
          },
        },
      }
    }

    const doc = withIf()
    const size = (els: readonly Element[]): number => els.reduce((n, el) => n + 1 + ('children' in el ? size(el.children) : 0), 0)
    const elements = (d: ProjectDoc) => Object.values(d.template.faces).reduce((n, f) => n + size(f.base), 0)

    // The promise and what is kept, measured against each other rather than against a number
    // written twice. Six elements go: the one bound to it, the condition with its shape, its
    // group and the shape inside that, and the one bound to it down in `fot`.
    const gone = elements(doc) - elements(applyEdit(doc, { v: 'removeField', field: 'styrka' }))
    expect(gone).toBe(6)
    expect(drawnBy(doc, 'styrka')).toBe(gone)

    // And the group itself stays, since nothing about it named the column: a designer told that
    // six elements go should not find her footer gone too.
    const after = applyEdit(doc, { v: 'removeField', field: 'styrka' }).template.faces['front']!
    expect(after.base.map((e) => e.id)).toEqual(['paper', 'frame', 'title', 'fot'])
  })

  it('refuses an edit that names something the project does not have, rather than writing nonsense', () => {
    expect(() => applyEdit(base(), { v: 'setCell', cardRef: 'ingen', field: 'title', value: 'x' })).toThrow(/ingen/)
    expect(() => applyEdit(base(), { v: 'addRow', cardRef: 'dragon', fields: {} })).toThrow(/dragon/)
    expect(() => applyEdit(base(), { v: 'patchZone', id: 'ingen', patch: { name: 'x' } })).toThrow(/ingen/)
    expect(() => applyEdit(base(), { v: 'renameIcon', from: 'ingen', to: 'x' })).toThrow(/ingen/)
    expect(() => applyEdit(base(), { v: 'moveElement', face: 'front', id: 'ingen', to: 0 })).toThrow(/ingen/)
    expect(() => applyEdit(base(), { v: 'patchElement', face: 'baksidan', id: 'title', patch: {} })).toThrow(/baksidan/)
    expect(() => applyEdit(base(), { v: 'patchElement', face: 'front', id: 'ingen', patch: { x: 1 } })).toThrow(/ingen/)
  })
})

// Choosing a ready-made back (L17) is one thing the designer did, so it is one edit — the same
// reason `replaceRows` exists rather than a remove and an add per card. Sent as a removal per
// layer and an addition per layer it would be a dozen versions and a dozen steps back (B4), and
// every step between them would be a half-built back nobody asked for.
describe('a whole face at once (L17)', () => {
  it('replaces the base of one face and leaves the other, and the variants, alone', () => {
    const doc = base()
    const back: Element[] = [
      { kind: 'shape', id: 'botten', x: -3, y: -3, w: 69, h: 94, shape: 'rect', fill: '#2f4068', pattern: { kind: 'diamonds', color: '#3a4d7a', scaleMm: 7 } },
      { kind: 'shape', id: 'kant', x: 4, y: 4, w: 55, h: 80, shape: 'rect', radiusMm: 3, stroke: '#8ea2cc', strokeMm: 0.6 },
    ]
    const next = applyEdit(doc, { v: 'replaceFace', face: 'back', base: back })
    expect(next.template.faces['back']?.base.map((e) => e.id)).toEqual(['botten', 'kant'])
    expect(next.template.faces['front']).toBe(doc.template.faces['front'])
    expect(next.template.faces['back']?.variants).toEqual(doc.template.faces['back']?.variants)
    // The document it was given is untouched, as every edit leaves it.
    expect(doc.template.faces['back']?.base.map((e) => e.id)).not.toEqual(['botten', 'kant'])
  })

  it('makes the face when the template has none: an empty back is a back that can be started', () => {
    const doc = base()
    const bare: ProjectDoc = { ...doc, template: { faces: { front: doc.template.faces['front']! } } }
    const next = applyEdit(bare, { v: 'replaceFace', face: 'back', base: [] })
    expect(next.template.faces['back']).toEqual({ base: [], variants: {} })
  })
})

// The game's meanings and their colours (E4), and what each card asks of its template's measure
// (E1). Both are edits like every other, so both are one version and one step back (B4).
describe('the palette and the framing', () => {
  const withArt = (): ProjectDoc => ({
    ...base(),
    rows: [
      { id: 'dragon', fields: { title: 'Drake', art: 'asset:a', antal: 2 } },
      { id: 'knight', fields: { title: 'Riddare', art: 'asset:b', antal: 1 } },
    ],
  })

  it('names a meaning, repaints it, and takes it away again', () => {
    const named = after(base(), { v: 'setRole', role: 'fara', colour: '#8f2d20' }, { v: 'setRole', role: 'vinst', colour: '#2f6136' })
    expect(named.palette).toEqual({ fara: '#8f2d20', vinst: '#2f6136' })

    expect(after(named, { v: 'setRole', role: 'fara', colour: '#a8410c' }).palette).toEqual({ fara: '#a8410c', vinst: '#2f6136' })
    expect(after(named, { v: 'removeRole', role: 'fara' }).palette).toEqual({ vinst: '#2f6136' })
  })

  it('renames a meaning on every card that says it, since the cards write the name and not the colour', () => {
    const doc = after(
      { ...base(), rows: [{ id: 'dragon', fields: { title: 'Drake', body: 'Skada {svard|fara} 2 och {mynt|fara}.', antal: 1 } }] },
      { v: 'setRole', role: 'fara', colour: '#8f2d20' },
      { v: 'renameRole', from: 'fara', to: 'hot' },
    )

    expect(doc.palette).toEqual({ hot: '#8f2d20' })
    expect(doc.rows[0]?.fields['body']).toBe('Skada {svard|hot} 2 och {mynt|hot}.')
  })

  it('keeps one card’s departure from the measure under the card and column it belongs to', () => {
    const doc = after(withArt(), { v: 'setFraming', cardRef: 'dragon', field: 'art', framing: { zoom: 1.5 } })

    expect(doc.framing).toEqual({ 'dragon/art': { zoom: 1.5 } })
    expect(after(doc, { v: 'setFraming', cardRef: 'dragon', field: 'art', framing: null }).framing).toEqual({})
  })

  it('drops a departure when the picture it was made for leaves the cell', () => {
    // A kept adjustment of a picture that is no longer there is a crop written by mistake: it
    // would frame a stranger's art by numbers chosen for someone else's.
    const framed = after(withArt(), { v: 'setFraming', cardRef: 'dragon', field: 'art', framing: { zoom: 1.5 } })

    expect(after(framed, { v: 'setCell', cardRef: 'dragon', field: 'art', value: 'asset:c' }).framing).toEqual({})
    // Another column on the same card is not that picture and leaves it alone.
    expect(after(framed, { v: 'setCell', cardRef: 'dragon', field: 'title', value: 'Drakhona' }).framing).toEqual({ 'dragon/art': { zoom: 1.5 } })
  })

  it('drops a departure when the card itself goes', () => {
    const framed = after(withArt(), { v: 'setFraming', cardRef: 'dragon', field: 'art', framing: { zoom: 1.5 } })

    expect(after(framed, { v: 'removeRow', cardRef: 'dragon' }).framing).toEqual({})
    expect(after(framed, { v: 'removeRow', cardRef: 'knight' }).framing).toEqual({ 'dragon/art': { zoom: 1.5 } })
  })
})

// The guard sits where the value enters and not only where the document is written: an intent
// comes from a browser and nothing between the two reads the schema.
describe('a departure that cannot be one', () => {
  it('is refused rather than stored, because a stored one crops that card on every render', () => {
    const doc: ProjectDoc = { ...base(), rows: [{ id: 'dragon', fields: { title: 'Drake', art: 'asset:a', antal: 1 } }] }
    const set = (framing: unknown) => () => applyEdit(doc, { v: 'setFraming', cardRef: 'dragon', field: 'art', framing } as EditIntent)

    expect(set({ zoom: 0 })).toThrow()
    expect(set({ dx: 3 })).toThrow()
    expect(set({ zoom: 1.5 })).not.toThrow()
  })

  it('is refused for a card the deck does not have', () => {
    expect(() => applyEdit(base(), { v: 'setFraming', cardRef: 'nobody', field: 'art', framing: { zoom: 2 } })).toThrow()
  })
})

// Högens bottenkort (K23, #331): en rad ur leken och sidan den ligger på, som en egenskap på
// högen. Bort igen betyder ingen egenskap alls, som varje annan egenskap en patch kan ta bort.
describe('högens bottenkort', () => {
  it('sätts, byter sida och tas bort med patchZone', () => {
    const set = applyEdit(base(), { v: 'patchZone', id: 'draw', patch: { bottom: { cardRef: 'knight', face: 'front' } } })
    expect(set.setup.zones.find((z) => z.id === 'draw')?.bottom).toEqual({ cardRef: 'knight', face: 'front' })
    const turned = applyEdit(set, { v: 'patchZone', id: 'draw', patch: { bottom: { cardRef: 'knight', face: 'back' } } })
    expect(turned.setup.zones.find((z) => z.id === 'draw')?.bottom).toEqual({ cardRef: 'knight', face: 'back' })
    const cleared = applyEdit(turned, { v: 'patchZone', id: 'draw', patch: { bottom: undefined } })
    expect(cleared.setup.zones.find((z) => z.id === 'draw')).not.toHaveProperty('bottom')
  })
})

// En egen form är en punktlista (L26, #309), och galleriet är vägen tillbaka: att välja en
// entré ska lämna elementet som ett element som aldrig haft egna punkter. `undefined` överlever
// inte JSON, så listan tas bort genom `clear` precis som skuggan och mönstret.
describe('egna punkter på ett element', () => {
  const shaped = (): ProjectDoc => applyEdit(base(), { v: 'addElement', face: 'front', element: { kind: 'shape', id: 'band', x: 0, y: 0, w: 40, h: 20, shape: 'banner', fill: '#fff' } })
  const band = (doc: ProjectDoc): Element | undefined => doc.template.faces['front']?.base.find((e) => e.id === 'band')

  it('skrivs ut på elementet och tas bort igen när en galleriform väljs', () => {
    const own = applyEdit(shaped(), { v: 'patchElement', face: 'front', id: 'band', patch: { points: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 20, y: 20 }] } as Partial<Element> })
    expect(band(own)).toMatchObject({ points: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 20, y: 20 }] })
    const back = applyEdit(own, { v: 'patchElement', face: 'front', id: 'band', patch: { shape: 'polygon', corners: 6 } as Partial<Element>, clear: ['points'] })
    expect(band(back)).not.toHaveProperty('points')
  })
})

// Var en ny hög föds (#443, K2, B5). `addZone` la varje hög på konstanten `point(0, 150)`, så ett
// andra tryck på ＋ Hög la den nya högen på millimetern ovanpå den förra. Placeringen är nu ett
// svar ur uppställningen, och regeln — önskeplatsen om den är ledig, annars den lediga ruta som
// ligger närmast den — är samma som den delade ytans sedan #440.
//
// Mätt på kortryggen, för det är den en hög upptar på filten: i dokumentet är den en punkt utan
// area, och två punkter som inte är samma punkt säger ingenting om att korten inte täcker
// varandra.
describe('en ny hög föds på ledig filt (#443, K2)', () => {
  const CARD = { w: 63, h: 88 }
  const cardBack = (g: { x: number; y: number }) => ({ x: g.x - CARD.w / 2, y: g.y - CARD.h / 2, ...CARD })
  const shares = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean =>
    Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) && Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y)
  const table = (): ProjectDoc => ({ ...base(), setup: openingSetup({ players: 2, counters: [{ name: 'Poäng', start: 0 }] }) })
  const pile = (doc: ProjectDoc, id: string) => doc.setup.zones.find((z) => z.id === id)!.geometry

  it('lägger den första där den alltid har legat, och den andra på sin egen kortrygg', () => {
    const two = after(table(), { v: 'addZone', id: 'hog-1', kind: 'pile', name: 'Hög 1' }, { v: 'addZone', id: 'hog-2', kind: 'pile', name: 'Hög 2' })
    // Den första högen krockar med ingenting, så inget recepbord ritas om.
    expect(pile(two, 'hog-1')).toEqual({ x: 0, y: 150, w: 0, h: 0, rot: 0 })
    expect(shares(cardBack(pile(two, 'hog-1')), cardBack(pile(two, 'hog-2')))).toBe(false)
    // Och punkten är hela millimetrar, som allt annat bordet bär: kortryggen är 63 bred kring en
    // mittpunkt, så en ruta ur en sökning i hela millimetrar skulle annars ge en halv.
    const g = pile(two, 'hog-2')
    expect([Number.isInteger(g.x), Number.isInteger(g.y)]).toEqual([true, true])
  })

  it('säger nej när filten inte har någon ledig kortrygg, i stället för att stapla tyst', () => {
    const doc = table()
    const floor = doc.setup.zones.find((z) => z.id === doc.setup.floor)!.geometry
    const covered: ProjectDoc = { ...doc, setup: { ...doc.setup, zones: [...doc.setup.zones, { id: 'duk', kind: 'area', name: 'Duk', visibility: 'all', geometry: floor }] } }
    expect(() => applyEdit(covered, { v: 'addZone', id: 'hog-1', kind: 'pile', name: 'Hög 1' })).toThrow(/no free felt for a new pile/)
  })
})
