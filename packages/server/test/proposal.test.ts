import { describe, expect, it } from 'vitest'
import type { Template } from '@byd/template'
import { applyEdit, type EditIntent } from '../src/edits.js'
import { Proposal, proposalSchema, translateProposal } from '../src/proposal.js'
import { twoSeatSetup } from './fixture.js'
import type { ProjectDoc } from '../src/projects.js'

// The proposal model (#1002, PRD module 4): what the model may answer — in this slice, new cards
// with their field values — and the translator from a proposal to the editor's own edits. The
// translator tries the edits on a copy of the game with the real `applyEdit`, and refuses, in words
// the panel can say, a proposal that names what the game does not have, writes what a card cannot
// say, or leaves a card short of what its template draws.
const template = (): Template => ({
  faces: {
    front: {
      base: [
        { kind: 'text', id: 'title', x: 5, y: 5, w: 53, h: 10, bind: { field: 'title' }, font: { family: 'sans-serif', sizePt: 14 }, color: '#111' },
        { kind: 'text', id: 'body', x: 5, y: 30, w: 53, h: 30, bind: { field: 'body' }, font: { family: 'sans-serif', sizePt: 9 }, color: '#222' },
        { kind: 'image', id: 'art', x: 5, y: 16, w: 53, h: 12, bind: { field: 'bild' } },
        // A text only some cards draw: the faction, when one is written.
        { kind: 'if', id: 'has-faction', when: { field: 'fraktion', nonEmpty: true }, children: [{ kind: 'text', id: 'faction', x: 5, y: 80, w: 53, h: 5, bind: { field: 'fraktion' }, font: { family: 'sans-serif', sizePt: 7 }, color: '#222' }] },
      ],
      variantBy: 'typ',
      // A shop card draws its price; no other card does.
      variants: { butik: { override: [{ kind: 'text', id: 'price', x: 40, y: 70, w: 18, h: 8, bind: { field: 'pris' }, font: { family: 'sans-serif', sizePt: 10 }, color: '#111' }] } },
    },
    back: { base: [{ kind: 'shape', id: 'bg', x: 0, y: 0, w: 63, h: 88, shape: 'rect', fill: '#2f4068' }], variants: {} },
  },
})
const doc = (): ProjectDoc => {
  const { zones, seats, floor } = twoSeatSetup()
  return {
    name: 'Skogens herrar',
    template: template(),
    rows: [
      { id: 'kort-1', fields: { title: 'Drake', body: 'Flyger. {mynt}', typ: 'monster', fraktion: '', pris: '', bild: '', antal: 2 } },
      { id: 'kort-2', fields: { title: 'Bod', body: 'Säljer.', typ: 'butik', fraktion: 'Skogen', pris: 3, bild: '', antal: 1 } },
    ],
    icons: { mynt: 'asset:mynt', svärd: 'asset:svärd' },
    palette: { kostnad: '#c33' },
    setup: { zones, seats, floor, deckZone: 'draw' },
  }
}
const card = (fields: Record<string, string | number | boolean>) => ({ fields: Object.entries(fields).map(([field, value]) => ({ field, value })) })

describe('a proposal of new cards becomes the edits that add them', () => {
  it('adds each card at the end of the deck under the next free ids, with its values and its count', () => {
    const translated = translateProposal(doc(), {
      cards: [card({ title: 'Varg', body: 'Biter. {svärd|kostnad} {2}', typ: 'monster', antal: 3 }), card({ title: 'Marknad', body: '**Köp** ett kort.', typ: 'butik', pris: 2, fraktion: 'Staden', antal: '1' })],
    })
    expect(translated).toEqual({
      ok: true,
      edits: [
        { v: 'addRow', cardRef: 'kort-3', fields: { title: 'Varg', body: 'Biter. {svärd|kostnad} {2}', typ: 'monster', antal: 3 } },
        { v: 'addRow', cardRef: 'kort-4', fields: { title: 'Marknad', body: '**Köp** ett kort.', typ: 'butik', pris: 2, fraktion: 'Staden', antal: 1 } },
      ],
    })
    // And they are edits the real document takes.
    const after = (translated.ok ? translated.edits : []).reduce((d: ProjectDoc, e: EditIntent) => applyEdit(d, e), doc())
    expect(after.rows.map((r) => r.id)).toEqual(['kort-1', 'kort-2', 'kort-3', 'kort-4'])
  })

  it('takes the ids the deck has not used, wherever the gaps are', () => {
    const gappy = { ...doc(), rows: [...doc().rows, { id: 'kort-3', fields: { title: 'X', body: 'Y', antal: 1 } }].filter((r) => r.id !== 'kort-1') }
    const translated = translateProposal(gappy, { cards: [card({ title: 'Varg', body: 'Biter.', antal: 1 }), card({ title: 'Räv', body: 'Smyger.', antal: 1 })] })
    expect(translated.ok && translated.edits.map((e) => (e.v === 'addRow' ? e.cardRef : ''))).toEqual(['kort-4', 'kort-5'])
  })
})

describe('a proposal that cannot be used is refused, and says why', () => {
  const refused = (cards: ReturnType<typeof card>[]) => {
    const translated = translateProposal(doc(), { cards })
    if (translated.ok) throw new Error('the proposal was taken')
    return translated.problem
  }

  it('refuses a field the game does not have', () => {
    expect(refused([card({ title: 'Varg', body: 'Biter.', antal: 1 }), card({ title: 'Räv', body: 'Smyger.', trolldom: 3, antal: 1 })])).toEqual({ kind: 'unknown-field', card: 2, title: 'Räv', field: 'trolldom' })
    // The card's key is the deck's to give, never the answer's.
    expect(refused([card({ id: 'drake-2', title: 'Varg', body: 'Biter.', antal: 1 })])).toMatchObject({ kind: 'unknown-field', field: 'id' })
  })

  it('refuses a picture written by the model, which only the designer can put on a card (E4)', () => {
    expect(refused([card({ title: 'Varg', body: 'Biter.', bild: 'varg.png', antal: 1 })])).toEqual({ kind: 'picture-field', card: 1, title: 'Varg', field: 'bild' })
  })

  it('refuses an icon the game does not have, and a meaning it has not named', () => {
    expect(refused([card({ title: 'Varg', body: 'Kostar {guld}.', antal: 1 })])).toEqual({ kind: 'unknown-icon', card: 1, title: 'Varg', field: 'body', icon: 'guld' })
    expect(refused([card({ title: 'Varg', body: 'Kostar {mynt|vinst}.', antal: 1 })])).toEqual({ kind: 'unknown-role', card: 1, title: 'Varg', field: 'body', role: 'vinst' })
  })

  it('refuses text written in anything but the card text syntax (L2)', () => {
    for (const body of ['<b>Biter</b>.', '**Biter.', 'Kostar {mynt.', '# Varg', 'Se [regeln](http://x).', 'Biter `alltid`.', 'Biter *hårt.']) {
      expect(refused([card({ title: 'Varg', body, antal: 1 })]), body).toEqual({ kind: 'bad-syntax', card: 1, title: 'Varg', field: 'body' })
    }
  })

  it('refuses a card without its count', () => {
    expect(refused([card({ title: 'Varg', body: 'Biter.' })])).toEqual({ kind: 'no-count', card: 1, title: 'Varg' })
    expect(refused([card({ title: 'Varg', body: 'Biter.', antal: 'två' })])).toEqual({ kind: 'no-count', card: 1, title: 'Varg' })
    expect(refused([card({ title: 'Varg', body: 'Biter.', antal: 1.5 })])).toEqual({ kind: 'no-count', card: 1, title: 'Varg' })
  })

  it('refuses a card that leaves empty a field its template draws — on that card, in its variant', () => {
    expect(refused([card({ title: 'Varg', body: '', antal: 1 })])).toEqual({ kind: 'empty-field', card: 1, title: 'Varg', field: 'body' })
    // A shop card draws its price, and a monster does not.
    expect(refused([card({ title: 'Marknad', body: 'Köp.', typ: 'butik', antal: 1 })])).toEqual({ kind: 'empty-field', card: 1, title: 'Marknad', field: 'pris' })
    expect(translateProposal(doc(), { cards: [card({ title: 'Varg', body: 'Biter.', typ: 'monster', antal: 1 })] }).ok).toBe(true)
  })

  it('refuses the same field written twice on one card', () => {
    expect(refused([card({ title: 'Varg', body: 'Biter.', antal: 1 }), { fields: [...card({ title: 'Räv', body: 'Smyger.', antal: 1 }).fields, { field: 'title', value: 'Lo' }] }])).toEqual({ kind: 'repeated-field', card: 2, title: 'Räv', field: 'title' })
  })

  it('refuses an answer that is not a proposal at all, and a proposal with no cards in it', () => {
    expect(translateProposal(doc(), { cards: [{ fält: [] }] })).toEqual({ ok: false, problem: { kind: 'shape' } })
    expect(translateProposal(doc(), 'tio kort')).toEqual({ ok: false, problem: { kind: 'shape' } })
    expect(translateProposal(doc(), { cards: [] })).toEqual({ ok: false, problem: { kind: 'empty' } })
  })
})

describe('the schema the provider is held to', () => {
  it('is the same zod schema the answer is read with, written as strict JSON Schema', () => {
    const schema = proposalSchema()
    expect(schema).not.toHaveProperty('$schema')
    expect(schema).toMatchObject({ type: 'object', additionalProperties: false, required: ['cards'] })
    const cards = (schema as { properties: { cards: { items: { additionalProperties: boolean; required: string[] } } } }).properties.cards
    expect(cards.items).toMatchObject({ additionalProperties: false, required: ['fields'] })
    // A value of several types is said as `anyOf`, which both providers' strict modes read, and
    // never as a list of types, which only some of them do.
    expect(JSON.stringify(schema)).not.toMatch(/"type":\[/)
    expect(JSON.stringify(schema)).toContain('"anyOf":[{"type":"string"},{"type":"number"},{"type":"boolean"}]')
    // Whatever the schema lets through is what the zod schema reads.
    expect(Proposal.safeParse({ cards: [card({ title: 'Varg', antal: 1, kraftig: true })] }).success).toBe(true)
  })
})
