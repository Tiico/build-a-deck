import { describe, expect, it } from 'vitest'
import { twoSeatSetup } from './fixture.js'
import { projectDoc } from './project-doc.js'

// A fixture that carries traces of the test before it does not go red — it goes confusing.
// The suite passes one file at a time and fails in a full run, or the other way round, and
// the test that finally breaks is never the one that did the writing (#49).
describe('the fixtures the editor tests build on (#49)', () => {
  it('gives every caller ground of its own, so what one test writes the next never reads', () => {
    const mine = projectDoc()
    mine.template.faces['front']!.base.push({ kind: 'image', id: 'art', x: 4, y: 4, w: 55, h: 36, bind: { field: 'art' } })
    mine.template.faces['front']!.variantBy = 'typ'
    mine.template.faces['front']!.variants['fälla'] = { override: [] }
    mine.template.faces['back']!.base = []
    mine.rows.push({ id: 'troll', fields: { title: 'Troll', body: 'Stor.', antal: 1 } })
    mine.rows[0]!.fields['title'] = 'Drakhona'
    mine.icons['svärd'] = `asset:${'c'.repeat(64)}`
    mine.fonts!['sans-serif']!.stack = 'serif'
    mine.setup.seats.push('C')
    mine.setup.zones[0]!.name = 'Annan hög'

    const theirs = projectDoc()
    expect(theirs.template.faces['front']!.base.map((e) => e.id)).toEqual(['frame', 'title', 'body'])
    expect(theirs.template.faces['front']!.variantBy).toBeUndefined()
    expect(theirs.template.faces['front']!.variants).toEqual({})
    expect(theirs.template.faces['back']!.base.map((e) => e.id)).toEqual(['bg'])
    expect(theirs.rows.map((r) => r.id)).toEqual(['dragon', 'knight', 'wizard'])
    expect(theirs.rows[0]!.fields['title']).toBe('Drake')
    expect(theirs.icons).toEqual({})
    expect(theirs.fonts!['sans-serif']!.stack).toBe('sans-serif')
    expect(theirs.setup.seats).toEqual(['A', 'B'])
    expect(theirs.setup.zones[0]!.name).toBe('Draghög')
  })

  it('makes the setup fresh too, down to the type each component is of', () => {
    const mine = twoSeatSetup()
    mine.components[0]!.type.version = 2
    mine.zones[0]!.name = 'Annan hög'
    // Not even within the one setup: ten cards of a type is ten cards, not ten views of one
    // object that the first of them can rewrite for the rest.
    expect(mine.components[1]!.type.version).toBe(1)

    const theirs = twoSeatSetup()
    expect(theirs.components.map((c) => c.type.version)).toEqual(theirs.components.map(() => 1))
    expect(theirs.zones[0]!.name).toBe('Draghög')
  })
})
