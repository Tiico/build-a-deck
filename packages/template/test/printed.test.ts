import { describe, expect, it } from 'vitest'
import { printedText, type FaceTemplate } from '../src/index.js'

// What a face says in words, apart from its title (#551, K27): the reading view reads it aloud.
// It is taken from the same elements the compiler draws, in the template's order.
const font = { family: 'Inter', sizePt: 9 }
const text = (id: string, field: string) => ({ kind: 'text' as const, id, x: 0, y: 0, w: 50, h: 10, bind: { field }, font, color: '#111' })
const face = (base: FaceTemplate['base'], variants: FaceTemplate['variants'] = {}, variantBy?: string): FaceTemplate => ({ base, variants, ...(variantBy ? { variantBy } : {}) })
const read = (f: FaceTemplate, row: Record<string, string>) => printedText({ face: f, row })

describe('printedText (#551)', () => {
  it('is every printed text but the title, in the template order', () => {
    const f = face([text('title', 'title'), text('kind', 'typ'), text('rules', 'body'), text('worth', 'valor')])
    expect(read(f, { title: 'Duel', typ: 'Playcard', body: 'Utmana en spelare på duell.', valor: 'Guld' })).toEqual(['Playcard', 'Utmana en spelare på duell.', 'Guld'])
  })

  it('reads a symbol by its name, a pip by its number, and drops the emphasis marks', () => {
    const f = face([text('rules', 'body')])
    expect(read(f, { body: 'Betala {coin} och **dra** {2} kort' })).toEqual(['Betala coin och dra 2 kort'])
    expect(read(f, { body: 'Ge {svard|fara}' })).toEqual(['Ge svard'])
  })

  it('reads an icon row as its symbols, one after the other', () => {
    const f = face([{ kind: 'icons', id: 'cost', x: 0, y: 0, w: 20, h: 5, bind: { field: 'cost' }, iconMm: 4 }])
    expect(read(f, { cost: 'Guld, Guld svard|fara' })).toEqual(['Guld, Guld, svard'])
  })

  it('gives each paragraph and each list item a line of its own', () => {
    const f = face([text('rules', 'body')])
    expect(read(f, { body: 'Först detta.\n\nSedan:\n- ett\n- två' })).toEqual(['Först detta.', 'Sedan:', 'ett', 'två'])
  })

  it('says only what this row prints: a condition that fails and an empty cell say nothing, a variant says its own', () => {
    const f = face(
      [text('rules', 'body'), { kind: 'if', id: 'maybe', when: { field: 'flavour', nonEmpty: true }, children: [text('flav', 'flavour')] }, text('empty', 'nothing')],
      { Trap: { override: [text('rules', 'trap')] } },
      'typ',
    )
    expect(read(f, { body: 'Vanlig', flavour: '' })).toEqual(['Vanlig'])
    expect(read(f, { body: 'Vanlig', trap: 'Fälla', typ: 'Trap', flavour: 'Doft' })).toEqual(['Fälla', 'Doft'])
  })

  it('prints a literal the template carries, and nothing for a picture or a shape', () => {
    const f = face([
      { kind: 'text', id: 'brand', x: 0, y: 0, w: 50, h: 10, bind: { literal: "Sal's Saloon" }, font, color: '#111' },
      { kind: 'image', id: 'art', x: 0, y: 0, w: 50, h: 10, bind: { field: 'art' } },
      { kind: 'shape', id: 'bg', x: 0, y: 0, w: 63, h: 88, shape: 'rect', fill: '#000' },
    ])
    expect(read(f, { art: '/a.png' })).toEqual(["Sal's Saloon"])
  })
})
