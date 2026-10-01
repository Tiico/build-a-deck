import { describe, expect, it } from 'vitest'
import { CARD_STANDARD_63x88 } from '@byd/engine'
import { compileCard, type Template } from '@byd/template'
import { ProjectDoc, deckFromProject } from '../src/projects.js'
import { twoSeatSetup } from './fixture.js'

// What a deck carries beyond its cards (E4): what the game's meanings are painted in. It belongs
// to the deck rather than to the library — a colour is this game's word for a meaning — so it
// lives in the document and reaches every compile.
const template: Template = {
  faces: {
    front: {
      base: [
        { kind: 'image', id: 'art', x: 5, y: 4, w: 40, h: 30, bind: { field: 'art' }, frame: { fill: 0.8 } },
        { kind: 'text', id: 'body', x: 5, y: 40, w: 53, h: 30, bind: { field: 'body' }, font: { family: 'sans-serif', sizePt: 9 }, color: '#111' },
      ],
      variants: {},
    },
    back: { base: [{ kind: 'shape', id: 'bg', x: 0, y: 0, w: 63, h: 88, shape: 'rect', fill: '#2f4068' }], variants: {} },
  },
}

const base = (): ProjectDoc => {
  const { zones, seats, floor } = twoSeatSetup()
  return {
    name: 'Skogens herrar',
    template,
    rows: [
      { id: 'dragon', fields: { title: 'Drake', body: 'Skada {svard|fara} 2.', art: 'a.png', antal: 1 } },
      { id: 'knight', fields: { title: 'Riddare', body: 'Skada {svard|fara} 1.', art: 'a.png', antal: 1 } },
    ],
    icons: { svard: 'svard.svg' },
    setup: { zones, seats, floor, deckZone: 'draw' },
  }
}

describe('a project’s palette', () => {
  it('survives the schema, which is the only thing that decides what a document may hold', () => {
    const doc = ProjectDoc.parse({ ...base(), palette: { fara: '#8f2d20' } })

    expect(doc.palette).toEqual({ fara: '#8f2d20' })
  })

  it('paints the meaning the palette names, on every card that says it', () => {
    const deck = deckFromProject({ ...base(), palette: { fara: '#8f2d20' } })
    const html = compileCard({ template: deck.template, type: CARD_STANDARD_63x88, row: deck.rows['dragon']!, icons: deck.icons, ...(deck.palette ? { palette: deck.palette } : {}) })['front']!.html

    expect(html).toContain('background:#8f2d20')
  })
})
