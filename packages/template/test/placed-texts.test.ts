import { describe, expect, it } from 'vitest'
import { placedTexts, type FaceTemplate } from '../src/index.js'

// Where each text this row prints stands on the card (#741): the elements `compile` draws — the
// same variant, the same conditions — with a group's offset added, in the template's order. The
// theme proof centres its crop on the prose box it finds here, so it may not find a box the card
// does not draw, nor put one where the card does not.
const font = { family: 'Inter', sizePt: 9 }
const text = (id: string, field: string, x = 0, y = 0) => ({ kind: 'text' as const, id, x, y, w: 50, h: 10, bind: { field }, font, color: '#111' })
const face = (base: FaceTemplate['base'], variants: FaceTemplate['variants'] = {}, variantBy?: string): FaceTemplate => ({ base, variants, ...(variantBy ? { variantBy } : {}) })
const ids = (f: FaceTemplate, row: Record<string, string>) => placedTexts(f, row).map((p) => [p.el.id, p.x, p.y])

describe('placedTexts (#741)', () => {
  it('is every text the row draws, where it is drawn, a group’s offset added', () => {
    const f = face([text('title', 'title', 5, 4), { kind: 'group', id: 'g', x: 3, y: 20, children: [text('rules', 'body', 2, 1)] }])
    expect(ids(f, { title: 'Duel', body: 'Text' })).toEqual([
      ['title', 5, 4],
      ['rules', 5, 21],
    ])
  })

  it('leaves out a text whose condition fails, and takes the variant’s own', () => {
    const f = face([text('rules', 'body'), { kind: 'if', id: 'maybe', when: { field: 'flavour', nonEmpty: true }, children: [text('flav', 'flavour', 0, 40)] }], { Trap: { override: [text('rules', 'trap', 7, 9)] } }, 'typ')
    expect(ids(f, { body: 'x', flavour: '' })).toEqual([['rules', 0, 0]])
    expect(ids(f, { body: 'x', typ: 'Trap', flavour: 'Doft' })).toEqual([
      ['rules', 7, 9],
      ['flav', 0, 40],
    ])
  })
})
