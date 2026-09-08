import { describe, expect, it } from 'vitest'
import { CATEGORIES, LIBRARY, freeIconName, searchSymbols, svgBytes, symbolName } from '../src/editor/symbols.js'
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
