import { describe, expect, it } from 'vitest'
import { CATEGORIES, INK, LIBRARY, freeIconName, searchSymbols, svgBytes, symbolName } from '../src/editor/symbols.js'
import { translate, type T } from '../src/i18n/index.js'

const english: T = (key, params) => translate('en', key, params)

describe('the symbol library (E4): curated, freely licensed, searchable', () => {
  it('carries a licence and an attribution on every symbol, and covers the categories it offers', () => {
    expect(LIBRARY.length).toBeGreaterThan(15)
    for (const s of LIBRARY) {
      expect(s.licence, s.id).toMatch(/^CC0-1\.0$|^CC-BY-4\.0$/)
      expect(s.by.length, s.id).toBeGreaterThan(0)
      expect(s.svg.startsWith('<svg'), s.id).toBe(true)
      expect(CATEGORIES).toContain(s.category)
    }
    // Ids and names are unique: a name becomes a key in the project's icon set, and it has to
    // stay unique in every language the library is read in.
    expect(new Set(LIBRARY.map((s) => s.id)).size).toBe(LIBRARY.length)
    expect(new Set(LIBRARY.map((s) => symbolName(s))).size).toBe(LIBRARY.length)
    expect(new Set(LIBRARY.map((s) => symbolName(s, english))).size).toBe(LIBRARY.length)
    // Placeholder frames and colour blocks are part of the library, not a separate thing (E4).
    expect(LIBRARY.some((s) => s.category === 'symbols.cat.placeholder')).toBe(true)
  })

  it('finds a symbol by name, by what it is for, and by category, and narrows to one category', () => {
    expect(searchSymbols('sköld', null).map((s) => s.id)).toEqual(['skold'])
    expect(searchSymbols('försvar', null).map((s) => s.id)).toEqual(['skold'])
    expect(searchSymbols('SKÖL', null).map((s) => s.id)).toEqual(['skold'])
    expect(searchSymbols('', 'symbols.cat.placeholder').every((s) => s.category === 'symbols.cat.placeholder')).toBe(true)
    expect(searchSymbols('sköld', 'symbols.cat.placeholder')).toEqual([])
    expect(searchSymbols('', null)).toHaveLength(LIBRARY.length)
    expect(searchSymbols('ingenting alls', null)).toEqual([])
  })

  it('is searched in the words the reader is reading it in (A4)', () => {
    // The library is the tool's, so it speaks the tool's language: an English designer looks for
    // a shield, and what they take in is called that in their game.
    expect(searchSymbols('shield', null, english).map((s) => s.id)).toEqual(['skold'])
    expect(searchSymbols('defence', null, english).map((s) => s.id)).toEqual(['skold'])
    expect(searchSymbols('sköld', null, english)).toEqual([])
    expect(symbolName(LIBRARY.find((s) => s.id === 'skold')!, english)).toBe('shield')
    expect(symbolName(LIBRARY.find((s) => s.id === 'skold')!)).toBe('sköld')
  })

  it('gives a symbol a name the project does not already use, and hands over its bytes for upload', () => {
    expect(freeIconName('sköld', {})).toBe('sköld')
    expect(freeIconName('sköld', { 'sköld': 'asset:x' })).toBe('sköld-2')
    expect(freeIconName('sköld', { 'sköld': 'a', 'sköld-2': 'b' })).toBe('sköld-3')
    const bytes = svgBytes(LIBRARY[0]!)
    expect(bytes.type).toBe('image/svg+xml')
    expect(new TextDecoder().decode(bytes.bytes)).toBe(LIBRARY[0]!.svg)
  })
})

// A symbol that can take a colour (E4). The colour reaches the card as paint behind the symbol's
// own shape, which only works if the shape is the whole of it: a hole punched in white is a hole
// only against a white chip, and it turns into white paint the moment the symbol is coloured or
// the card behind it is dark.
describe('the library is drawn so it can be painted', () => {
  it('carries no second colour: one shape, one fill, holes cut rather than covered', () => {
    for (const s of LIBRARY) {
      // A placeholder block is a block of colour and is the one thing here that is its colour.
      if (s.category === 'symbols.cat.placeholder') continue
      const colours = [...s.svg.matchAll(/(?:fill|stroke)="([^"]+)"/g)].map((m) => m[1]).filter((c) => c !== 'none')
      expect(new Set(colours), s.id).toEqual(new Set([INK]))
    }
  })

  it('cuts its holes with the winding rule, so the card shows through them', () => {
    // The three that had white middles: the coin, the die and the card being drawn.
    for (const id of ['mynt', 'tarning', 'dra']) {
      const found = LIBRARY.find((s) => s.id === id)
      expect(found?.svg, id).toContain('fill-rule="evenodd"')
    }
  })

  it('is one file per symbol however many colours a deck writes, since the colour is never in it', () => {
    // The same bytes serve red and blue: what a deck uploads does not grow with its palette.
    for (const s of LIBRARY) expect(svgBytes(s).type).toBe('image/svg+xml')
    expect(new Set(LIBRARY.map((s) => s.svg)).size).toBe(LIBRARY.length)
  })
})
