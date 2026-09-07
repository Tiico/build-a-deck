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

// A group is a rule on a column (#13): `variantBy` names the column and the variant's key is the
// value. Both faces are ruled by it, each with overrides of its own, and a card that matches the
// rule gets the group's look on both sides without being named anywhere.
describe('a group rules both faces (#13, L3 + L7)', () => {
  const grouped: Template = {
    faces: {
      front: {
        variantBy: 'typ',
        base: template.faces['front']!.base,
        variants: { fälla: { override: [{ kind: 'text', id: 'title', x: 5, y: 5, w: 53, h: 10, bind: { field: 'title' }, font: { family: 'Inter', sizePt: 14, weight: 700 }, color: '#e74c3c' }] } },
      },
      back: {
        variantBy: 'typ',
        base: template.faces['back']!.base,
        variants: { fälla: { override: [{ kind: 'shape', id: 'bg', x: 0, y: 0, w: 63, h: 88, shape: 'rect', fill: '#3a1c1c' }] } },
      },
    },
  }

  it('gives a matching row the group look on the front and the back, and leaves the rest at the base', () => {
    const trap = compileCard({ template: grouped, type: CARD_STANDARD_63x88, row: { typ: 'fälla', title: 'Fallgrop' }, icons: {} })
    const creature = compileCard({ template: grouped, type: CARD_STANDARD_63x88, row: { typ: 'varelse', title: 'Drake' }, icons: {} })
    expect(trap.front?.css).toContain('#e74c3c')
    expect(trap.back?.css).toContain('#3a1c1c')
    expect(creature.front?.css).toContain('#111')
    expect(creature.back?.css).toContain('#2f4068')
  })

  it('is a rule, not a list: a row nobody has heard of matches on its column value alone', () => {
    const fresh = compileCard({ template: grouped, type: CARD_STANDARD_63x88, row: { typ: 'fälla', title: 'Snara' }, icons: {} })
    expect(fresh.front?.css).toContain('#e74c3c')
    expect(fresh.back?.css).toContain('#3a1c1c')
  })

  it('lets one face be grouped while the other is the same for every card', () => {
    const onlyFront: Template = { faces: { front: grouped.faces['front']!, back: template.faces['back']! } }
    const trap = compileCard({ template: onlyFront, type: CARD_STANDARD_63x88, row: { typ: 'fälla', title: 'Fallgrop' }, icons: {} })
    const creature = compileCard({ template: onlyFront, type: CARD_STANDARD_63x88, row: { typ: 'varelse', title: 'Drake' }, icons: {} })
    expect(trap.front?.css).not.toEqual(creature.front?.css)
    expect(trap.back).toEqual(creature.back)
  })
})
