import { describe, expect, it } from 'vitest'
import { CATEGORIES, LIBRARY, freeIconName, searchSymbols, svgBytes } from '../src/editor/symbols.js'

describe('the symbol library (E4): curated, freely licensed, searchable', () => {
  it('carries a licence and an attribution on every symbol, and covers the categories it offers', () => {
    expect(LIBRARY.length).toBeGreaterThan(15)
    for (const s of LIBRARY) {
      expect(s.licence, s.id).toMatch(/^CC0-1\.0$|^CC-BY-4\.0$/)
      expect(s.by.length, s.id).toBeGreaterThan(0)
      expect(s.svg.startsWith('<svg'), s.id).toBe(true)
      expect(CATEGORIES).toContain(s.category)
    }
    // Ids and names are unique: a name becomes a key in the project's icon set.
    expect(new Set(LIBRARY.map((s) => s.id)).size).toBe(LIBRARY.length)
    expect(new Set(LIBRARY.map((s) => s.name)).size).toBe(LIBRARY.length)
    // Placeholder frames and colour blocks are part of the library, not a separate thing (E4).
    expect(LIBRARY.some((s) => s.category === 'Platshållare')).toBe(true)
  })

  it('finds a symbol by name, by what it is for, and by category, and narrows to one category', () => {
    expect(searchSymbols('sköld', null).map((s) => s.id)).toEqual(['skold'])
    expect(searchSymbols('försvar', null).map((s) => s.id)).toEqual(['skold'])
    expect(searchSymbols('SKÖL', null).map((s) => s.id)).toEqual(['skold'])
    expect(searchSymbols('', 'Platshållare').every((s) => s.category === 'Platshållare')).toBe(true)
    expect(searchSymbols('sköld', 'Platshållare')).toEqual([])
    expect(searchSymbols('', null)).toHaveLength(LIBRARY.length)
    expect(searchSymbols('ingenting alls', null)).toEqual([])
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
