import { describe, expect, it } from 'vitest'
import { FaceTemplate, type Template } from '@byd/template'
import { applyEdit } from '../src/edits.js'
import { translateProposal } from '../src/proposal.js'
import { twoSeatSetup } from './fixture.js'
import type { ProjectDoc } from '../src/projects.js'

// A template proposal (#1005, E4, L1): a face in the template's own element model, with its groups
// chosen by a column (L3) and the new fields it needs, with values for the cards that need them. The
// model never writes HTML or CSS; it writes elements, and the translator turns them into the
// editor's own template and deck edits, tried on a copy of the game — and refuses, with the reason,
// an element kind the model does not have, a field neither the game has nor the proposal brings, an
// element outside the card, a typeface, colour role or icon the game does not have, and anything the
// template model itself will not take.
const template = (): Template => ({
  faces: {
    front: {
      base: [
        { kind: 'shape', id: 'paper', x: -3, y: -3, w: 69, h: 94, shape: 'rect', fill: '#f4ead8' },
        { kind: 'text', id: 'title', x: 5, y: 5, w: 53, h: 10, bind: { field: 'title' }, font: { family: 'Alegreya', sizePt: 14 }, color: '#111' },
        { kind: 'text', id: 'body', x: 5, y: 30, w: 53, h: 30, bind: { field: 'body' }, font: { family: 'Alegreya', sizePt: 9 }, color: '#222' },
      ],
      variants: {},
    },
    back: { base: [{ kind: 'shape', id: 'bg', x: -3, y: -3, w: 69, h: 94, shape: 'rect', fill: '#2f4068' }], variants: {} },
  },
})
const doc = (): ProjectDoc => {
  const { zones, seats, floor } = twoSeatSetup()
  return {
    name: 'Skogens herrar',
    template: template(),
    rows: [
      { id: 'kort-1', fields: { title: 'Drake', body: 'Flyger.', typ: 'monster', antal: 2 } },
      { id: 'kort-2', fields: { title: 'Bod', body: 'Säljer.', typ: 'butik', antal: 1 } },
      { id: 'kort-3', fields: { title: 'Torg', body: 'Byter.', typ: 'butik', antal: 1 } },
    ],
    icons: { mynt: 'asset:mynt' },
    palette: { guld: '#c9a227' },
    fonts: { Alegreya: { stack: '"Alegreya", serif', asset: `asset:${'a'.repeat(64)}` } },
    setup: { zones, seats, floor, deckZone: 'draw' },
  }
}

// An element as the model writes it: every property said, the ones it has nothing for as null, and
// its place in a group or a condition said by `parent` rather than by nesting (see `proposal.ts`).
const text = (id: string, field: string, at: { x: number; y: number; w: number; h: number }, more: Record<string, unknown> = {}) => ({
  kind: 'text',
  id,
  parent: null,
  name: null,
  ...at,
  bind: { field },
  font: { family: 'Alegreya', sizePt: 10, weight: null, align: null, lineHeight: null, letterSpacing: null },
  color: '#111111',
  fit: null,
  valign: null,
  ...more,
})
const shape = (id: string, at: { x: number; y: number; w: number; h: number }, more: Record<string, unknown> = {}) => ({
  kind: 'shape',
  id,
  parent: null,
  name: null,
  ...at,
  shape: 'rect',
  fill: '#f4ead8',
  stroke: null,
  strokeMm: null,
  radiusMm: null,
  corners: null,
  innerRatio: null,
  rotationDeg: null,
  opacity: null,
  pattern: null,
  shadow: null,
  ...more,
})
const proposed = (over: Record<string, unknown> = {}) => ({
  cards: [],
  changes: [],
  template: {
    face: 'front',
    variantBy: 'typ',
    elements: [shape('paper', { x: -3, y: -3, w: 69, h: 94 }), text('title', 'title', { x: 14, y: 5, w: 44, h: 10 }), text('body', 'body', { x: 5, y: 50, w: 53, h: 30 })],
    variants: [
      {
        name: 'butik',
        elements: [shape('coin', { x: 4, y: 4, w: 9, h: 9 }, { shape: 'circle', fill: 'guld' }), text('cost', 'kostnad', { x: 4, y: 6, w: 9, h: 5 }, { font: { family: 'Alegreya', sizePt: 9, weight: 700, align: 'center', lineHeight: null, letterSpacing: null } })],
        remove: [],
      },
    ],
    fields: [
      {
        field: 'kostnad',
        values: [
          { card: 'kort-2', value: 3 },
          { card: 'kort-3', value: 2 },
        ],
      },
    ],
    ...over,
  },
})

describe('a template proposal becomes the edits that make it', () => {
  it('is one part — the face, its groups and column, and the new field with its values — that the game takes in one go', () => {
    const translated = translateProposal(doc(), proposed())
    if (!translated.ok) throw new Error(`refused: ${JSON.stringify(translated.problem)}`)
    expect(translated.parts).toHaveLength(1)
    expect(translated.parts[0]).toMatchObject({ kind: 'template', key: 'template:front', face: 'front', fields: ['kostnad'] })
    const after = applyEdit(doc(), { v: 'compound', edits: translated.edits })
    const front = after.template.faces['front']!
    expect(FaceTemplate.safeParse(front).success).toBe(true)
    expect(front.base.map((e) => e.id)).toEqual(['paper', 'title', 'body'])
    expect(front.variantBy).toBe('typ')
    // A colour role is written as its colour: the template holds colours, and the role is the name
    // the model knew it by.
    expect(front.variants['butik']?.override).toEqual([
      { kind: 'shape', id: 'coin', x: 4, y: 4, w: 9, h: 9, shape: 'circle', fill: '#c9a227' },
      { kind: 'text', id: 'cost', x: 4, y: 6, w: 9, h: 5, bind: { field: 'kostnad' }, font: { family: 'Alegreya', sizePt: 9, weight: 700, align: 'center' }, color: '#111111' },
    ])
    expect(after.rows.map((r) => r.fields['kostnad'])).toEqual(['', 3, 2])
    // The back is not the proposal's, and keeps its elements; the column is the whole deck's (L3).
    expect(after.template.faces['back']).toEqual({ ...doc().template.faces['back'], variantBy: 'typ' })
  })
})

describe('a template proposal raises its tree out of the flat list it is written in', () => {
  it('puts each element under the group or condition its parent names, in the list’s order, with the group’s offset kept', () => {
    const translated = translateProposal(
      doc(),
      proposed({
        variants: [],
        fields: [],
        elements: [
          { kind: 'group', id: 'head', parent: null, name: 'Huvud', x: 4, y: 4 },
          text('title', 'title', { x: 0, y: 0, w: 50, h: 9 }, { parent: 'head' }),
          { kind: 'if', id: 'when-shop', parent: 'head', name: null, field: 'typ', equals: 'butik' },
          shape('mark', { x: 50, y: 0, w: 4, h: 4 }, { parent: 'when-shop' }),
          text('body', 'body', { x: 5, y: 50, w: 53, h: 30 }),
        ],
      }),
    )
    if (!translated.ok) throw new Error(`refused: ${JSON.stringify(translated.problem)}`)
    const front = applyEdit(doc(), { v: 'compound', edits: translated.edits }).template.faces['front']!
    expect(front.base).toMatchObject([
      { kind: 'group', id: 'head', name: 'Huvud', x: 4, y: 4, children: [{ id: 'title' }, { kind: 'if', id: 'when-shop', when: { field: 'typ', equals: 'butik' }, children: [{ id: 'mark' }] }] },
      { id: 'body' },
    ])
  })

  it('keeps what the proposal cannot say about an element it keeps: an outline of the designer’s own, and a lock', () => {
    const faces = template().faces
    const own: ProjectDoc = { ...doc(), template: { faces: { ...faces, front: { ...faces['front']!, base: [{ kind: 'shape', id: 'paper', x: -3, y: -3, w: 69, h: 94, shape: 'rect', points: [{ x: 0, y: 0 }, { x: 69, y: 0 }, { x: 35, y: 94 }], locked: true }] } } } }
    const translated = translateProposal(own, proposed({ variants: [], fields: [] }))
    if (!translated.ok) throw new Error(`refused: ${JSON.stringify(translated.problem)}`)
    const paper = applyEdit(own, { v: 'compound', edits: translated.edits }).template.faces['front']!.base[0]
    expect(paper).toMatchObject({ id: 'paper', locked: true, points: [{ x: 0, y: 0 }, { x: 69, y: 0 }, { x: 35, y: 94 }] })
  })

  // A picture's rounded corners (#1224) are not something the model writes, so a proposal that moves
  // the picture keeps them: classic's picture would otherwise come back square over the frame's curve.
  it('keeps the rounded corners of a picture it keeps', () => {
    const faces = template().faces
    const art = { kind: 'image' as const, id: 'art', x: 4, y: 4, w: 55, h: 36, bind: { field: 'typ' }, fit: 'cover' as const, radiusMm: 2.3 }
    const own: ProjectDoc = { ...doc(), template: { faces: { ...faces, front: { ...faces['front']!, base: [...faces['front']!.base, art] } } } }
    const picture = { kind: 'image', id: 'art', parent: null, name: null, x: 5, y: 5, w: 53, h: 34, bind: { field: 'typ' }, fit: null }
    const translated = translateProposal(own, proposed({ variants: [], fields: [], elements: [...proposed().template.elements, picture] }))
    if (!translated.ok) throw new Error(`refused: ${JSON.stringify(translated.problem)}`)
    const kept = applyEdit(own, { v: 'compound', edits: translated.edits }).template.faces['front']!.base.find((e) => e.kind === 'image')
    expect(kept).toMatchObject({ id: 'art', x: 5, y: 5, radiusMm: 2.3 })
  })
})

describe('a template proposal that cannot be used is refused, and says why', () => {
  const problem = (over: Record<string, unknown>) => {
    const translated = translateProposal(doc(), proposed(over))
    if (translated.ok) throw new Error('the proposal was taken')
    return translated.problem
  }
  const fault = (element: string | undefined, f: Record<string, unknown>) => ({ kind: 'template', face: 'front', ...(element ? { element } : {}), fault: f })

  it('refuses an element of a kind the template model does not have', () => {
    expect(problem({ elements: [{ kind: 'video', id: 'film', parent: null, x: 0, y: 0, w: 10, h: 10 }] })).toEqual(fault('film', { kind: 'unknown-element', type: 'video' }))
  })

  it('refuses a field the game does not have and the proposal does not bring — in a binding, a condition, a fill or the column', () => {
    expect(problem({ fields: [] })).toEqual(fault('cost', { kind: 'unknown-field', field: 'kostnad' }))
    expect(problem({ elements: [{ kind: 'if', id: 'rare', parent: null, name: null, field: 'raritet', equals: null }] })).toEqual(fault('rare', { kind: 'unknown-field', field: 'raritet' }))
    expect(problem({ elements: [shape('paper', { x: 0, y: 0, w: 63, h: 88 }, { fill: { field: 'fraktion', map: [], else: null } })] })).toEqual(fault('paper', { kind: 'unknown-field', field: 'fraktion' }))
    expect(problem({ variantBy: 'sort' })).toEqual(fault(undefined, { kind: 'unknown-field', field: 'sort' }))
  })

  it('refuses an element outside the card — past the bleed, with the group it stands in counted', () => {
    expect(problem({ elements: [text('title', 'title', { x: 40, y: 5, w: 40, h: 10 })] })).toEqual(fault('title', { kind: 'outside-card' }))
    expect(problem({ elements: [{ kind: 'group', id: 'foot', parent: null, name: null, x: 0, y: 80 }, text('body', 'body', { x: 5, y: 5, w: 53, h: 10 }, { parent: 'foot' })] })).toEqual(fault('body', { kind: 'outside-card' }))
    // The bleed is the card's: a background drawn to it is where every background belongs.
    expect(translateProposal(doc(), proposed()).ok).toBe(true)
  })

  it('refuses a typeface, a colour role and an icon the game does not have, and text past the card text syntax', () => {
    const font = { family: 'Comic Sans', sizePt: 10, weight: null, align: null, lineHeight: null, letterSpacing: null }
    expect(problem({ elements: [text('title', 'title', { x: 5, y: 5, w: 53, h: 10 }, { font })] })).toEqual(fault('title', { kind: 'unknown-font', font: 'Comic Sans' }))
    expect(problem({ elements: [shape('paper', { x: 0, y: 0, w: 63, h: 88 }, { fill: 'silver' })] })).toEqual(fault('paper', { kind: 'unknown-role', role: 'silver' }))
    expect(problem({ elements: [{ kind: 'icons', id: 'pips', parent: null, name: null, x: 5, y: 70, w: 30, h: 6, bind: { literal: 'mynt svärd' }, iconMm: 5, gapMm: null }] })).toEqual(fault('pips', { kind: 'unknown-icon', icon: 'svärd' }))
    expect(problem({ elements: [text('rule', 'x', { x: 5, y: 70, w: 30, h: 6 }, { bind: { literal: 'Betala {mynt|silver}' } })] })).toEqual(fault('rule', { kind: 'unknown-role', role: 'silver' }))
    expect(problem({ elements: [text('rule', 'x', { x: 5, y: 70, w: 30, h: 6 }, { bind: { literal: '<b>Betala</b>' } })] })).toEqual(fault('rule', { kind: 'bad-syntax' }))
  })

  it('refuses whatever the template model will not take, at the element it will not take', () => {
    expect(problem({ elements: [shape('paper', { x: 0, y: 0, w: -5, h: 88 })] })).toEqual(fault('paper', { kind: 'bad-template' }))
    expect(problem({ elements: [shape('star', { x: 0, y: 0, w: 10, h: 10 }, { shape: 'star', corners: 2 })] })).toEqual(fault('star', { kind: 'bad-template' }))
    // Two elements of one id, a parent that is no group, and an element that holds itself.
    expect(problem({ elements: [shape('a', { x: 0, y: 0, w: 5, h: 5 }), shape('a', { x: 0, y: 0, w: 5, h: 5 })] })).toEqual(fault('a', { kind: 'bad-template' }))
    expect(problem({ elements: [shape('a', { x: 0, y: 0, w: 5, h: 5 }), shape('b', { x: 0, y: 0, w: 5, h: 5 }, { parent: 'a' })] })).toEqual(fault('b', { kind: 'bad-template' }))
    expect(problem({ elements: [{ kind: 'group', id: 'g', parent: 'g', name: null, x: 0, y: 0 }] })).toEqual(fault('g', { kind: 'bad-template' }))
    // A group may only leave out what the base has.
    expect(problem({ variants: [{ name: 'butik', elements: [], remove: ['ingen'] }] })).toEqual(fault('ingen', { kind: 'bad-template' }))
  })

  it('refuses groups with no column to choose them by', () => {
    expect(problem({ variantBy: null })).toEqual(fault(undefined, { kind: 'no-variant-column' }))
  })

  it('refuses a new field the game already has, in any spelling', () => {
    expect(problem({ fields: [{ field: 'Body', values: [] }] })).toEqual(fault(undefined, { kind: 'field-exists', field: 'Body' }))
    expect(problem({ fields: [{ field: 'antal', values: [] }] })).toEqual(fault(undefined, { kind: 'field-exists', field: 'antal' }))
  })

  it('refuses a value for a card the game does not have, or one its column cannot hold', () => {
    expect(problem({ fields: [{ field: 'kostnad', values: [{ card: 'kort-9', value: 2 }] }] })).toEqual({ kind: 'unknown-card', changed: 'kort-9' })
    expect(problem({ fields: [{ field: 'kostnad', values: [{ card: 'kort-2', value: '{guld}' }] }] })).toEqual({ kind: 'unknown-icon', changed: 'kort-2', title: 'Bod', field: 'kostnad', icon: 'guld' })
    // A new field the template draws as a picture is the designer's to fill (E4).
    const picture = { kind: 'image', id: 'art', parent: null, name: null, x: 5, y: 16, w: 53, h: 30, bind: { field: 'kostnad' }, fit: null }
    expect(problem({ variants: [{ name: 'butik', elements: [picture], remove: [] }], fields: [{ field: 'kostnad', values: [{ card: 'kort-2', value: 'drake.png' }] }] })).toEqual({ kind: 'picture-field', changed: 'kort-2', title: 'Bod', field: 'kostnad' })
  })
})

describe('a template is one part of a proposal (#1003, «Välj delar…»)', () => {
  const market = (more: Record<string, string | number>) => ({ fields: Object.entries({ title: 'Marknad', body: 'Säljer allt.', typ: 'butik', ...more, antal: 1 }).map(([field, value]) => ({ field, value })) })

  it('judges the cards beside it against the game as the template draws it: they may write its new field, and must fill what it draws', () => {
    const translated = translateProposal(doc(), { ...proposed(), cards: [market({ kostnad: 4 })] })
    expect(translated.ok && translated.parts.map((p) => p.key)).toEqual(['template:front', 'card:1'])
    expect(translateProposal(doc(), { ...proposed(), cards: [market({})] })).toMatchObject({ ok: false, problem: { kind: 'empty-field', card: 1, field: 'kostnad' } })
  })

  it('left out, takes nothing of the template — and a card that writes its field still carries the cell it wrote', () => {
    const translated = translateProposal(doc(), { ...proposed(), cards: [market({ kostnad: 4 })] }, new Set(['template:front']))
    if (!translated.ok) throw new Error('refused')
    expect(translated.edits).toEqual([{ v: 'addRow', cardRef: 'kort-4', fields: { title: 'Marknad', body: 'Säljer allt.', typ: 'butik', kostnad: 4, antal: 1 } }])
    expect(applyEdit(doc(), { v: 'compound', edits: translated.edits }).template).toEqual(doc().template)
  })

  it('names the fields it brings and how many cards it fills them on', () => {
    expect(translateProposal(doc(), proposed())).toMatchObject({ ok: true, parts: [{ kind: 'template', fields: ['kostnad'], filled: 2 }] })
  })
})
