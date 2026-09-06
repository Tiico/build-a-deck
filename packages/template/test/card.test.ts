import { describe, expect, it } from 'vitest'
import { CARD_STANDARD_63x88 } from '@byd/engine'
import { compileCard, type Template } from '../src/index.js'

const template: Template = {
  faces: {
    front: {
      base: [
        { kind: 'text', id: 'title', x: 5, y: 5, w: 53, h: 10, bind: { field: 'title' }, font: { family: 'Inter', sizePt: 14, weight: 700 }, color: '#111' },
      ],
      variants: {},
    },
    back: {
      base: [{ kind: 'shape', id: 'bg', x: 0, y: 0, w: 63, h: 88, shape: 'rect', fill: '#2f4068' }],
      variants: {},
    },
  },
}

describe('compileCard (L7)', () => {
  it('compiles every face the type has, and a back without bindings comes out the same for every row', () => {
    const a = compileCard({ template, type: CARD_STANDARD_63x88, row: { title: 'Drake' }, icons: {} })
    const b = compileCard({ template, type: CARD_STANDARD_63x88, row: { title: 'Riddare' }, icons: {} })
    expect(Object.keys(a)).toEqual(['front', 'back'])
    expect(a.front?.html).toContain('Drake')
    expect(b.front?.html).toContain('Riddare')
    expect(a.back).toEqual(b.back)
    expect(a.back?.warnings).toEqual([])
  })

  it('refuses a template that lacks a face the type has', () => {
    const onlyFront: Template = { faces: { front: template.faces['front']! } }
    expect(() => compileCard({ template: onlyFront, type: CARD_STANDARD_63x88, row: {}, icons: {} })).toThrow(/back/)
  })
})
