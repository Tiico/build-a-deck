import { describe, expect, it } from 'vitest'
import { CARD_STANDARD_63x88 } from '@byd/engine'
import { compileCard, type Template } from '@byd/template'
import { ProjectDoc, deckFromProject } from '../src/projects.js'
import { twoSeatSetup } from './fixture.js'

// What a deck carries beyond its cards (E1, E4): the departure each card asks of the template's
// measure, and what the game's meanings are painted in. Both belong to the deck rather than to the
// file or to the library — a picture's bytes may sit in ten other people's decks, and a colour is
// this game's word for a meaning — so both live in the document and reach every compile.
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

// The one file both cards use: 200 × 100 pixels with an 80 × 80 drawing in the middle of it.
const motif = { w: 200, h: 100, trim: { left: 60, top: 10, right: 60, bottom: 10 } }

describe('a project’s framing and palette', () => {
  it('survives the schema, which is the only thing that decides what a document may hold', () => {
    const doc = ProjectDoc.parse({ ...base(), palette: { fara: '#8f2d20' }, framing: { 'dragon/art': { zoom: 1.4, dy: -0.1 } } })

    expect(doc.palette).toEqual({ fara: '#8f2d20' })
    expect(doc.framing).toEqual({ 'dragon/art': { zoom: 1.4, dy: -0.1 } })
  })

  it('refuses a departure that cannot be one, because a stored one crops that card on every render', () => {
    const bad = (framing: unknown) => () => ProjectDoc.parse({ ...base(), framing })

    expect(bad({ 'dragon/art': { zoom: 0 } })).toThrow()
    expect(bad({ 'dragon/art': { zoom: -1 } })).toThrow()
    expect(bad({ 'dragon/art': { dx: 4 } })).toThrow()
    // A key that names no card and no column is a departure nothing will ever apply.
    expect(bad({ dragon: { zoom: 2 } })).toThrow()
  })

  it('hands the deck each card’s own departure, keyed by the card it belongs to', () => {
    const deck = deckFromProject({ ...base(), palette: { fara: '#8f2d20' }, framing: { 'dragon/art': { zoom: 2 } } })

    expect(deck.palette).toEqual({ fara: '#8f2d20' })
    expect(deck.framing).toEqual({ dragon: { art: { zoom: 2 } } })
  })

  it('frames the card that asked differently from the card that did not, out of the same file', () => {
    const deck = deckFromProject({ ...base(), framing: { 'dragon/art': { zoom: 2 } } })
    const drawn = (cardRef: string) => {
      const row = deck.rows[cardRef]!
      const css = compileCard({ template: deck.template, type: CARD_STANDARD_63x88, row, icons: deck.icons, motifs: { 'a.png': motif }, ...(deck.framing?.[cardRef] ? { framing: deck.framing[cardRef] } : {}) })['front']!.css
      return /\[data-element="art"\] \.byd-art\{[^}]*width:([\d.]+)mm/.exec(css)?.[1]
    }

    // Twice as close is half the window, so the file is laid out twice as large.
    expect(drawn('knight')).toBe('60')
    expect(drawn('dragon')).toBe('120')
  })

  it('paints the meaning the palette names, on every card that says it', () => {
    const deck = deckFromProject({ ...base(), palette: { fara: '#8f2d20' } })
    const html = compileCard({ template: deck.template, type: CARD_STANDARD_63x88, row: deck.rows['dragon']!, icons: deck.icons, ...(deck.palette ? { palette: deck.palette } : {}) })['front']!.html

    expect(html).toContain('background:#8f2d20')
  })
})
