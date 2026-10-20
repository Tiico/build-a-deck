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
    expect(translated).toMatchObject({
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

const change = (cardRef: string, fields: Record<string, string | number | boolean>) => ({ card: cardRef, fields: Object.entries(fields).map(([field, value]) => ({ field, value })) })

describe('a proposal of changed cards becomes the edits that change them (#1003)', () => {
  it('writes each changed cell with an ordinary setCell, and says what each cell was and becomes', () => {
    const translated = translateProposal(doc(), { cards: [], changes: [change('kort-2', { pris: 2, body: 'Säljer billigt.' }), change('kort-1', { antal: 3 })] })
    expect(translated).toMatchObject({
      ok: true,
      edits: [
        { v: 'setCell', cardRef: 'kort-2', field: 'pris', value: 2 },
        { v: 'setCell', cardRef: 'kort-2', field: 'body', value: 'Säljer billigt.' },
        { v: 'setCell', cardRef: 'kort-1', field: 'antal', value: 3 },
      ],
    })
    expect(translated.ok && translated.parts).toEqual([
      { kind: 'change', key: 'change:kort-2', cardRef: 'kort-2', cells: [{ field: 'pris', from: 3, to: 2 }, { field: 'body', from: 'Säljer.', to: 'Säljer billigt.' }], edits: [{ v: 'setCell', cardRef: 'kort-2', field: 'pris', value: 2 }, { v: 'setCell', cardRef: 'kort-2', field: 'body', value: 'Säljer billigt.' }] },
      { kind: 'change', key: 'change:kort-1', cardRef: 'kort-1', cells: [{ field: 'antal', from: 2, to: 3 }], edits: [{ v: 'setCell', cardRef: 'kort-1', field: 'antal', value: 3 }] },
    ])
  })

  it('leaves out a cell that would be written with the value it already has, and a change that changes nothing', () => {
    const translated = translateProposal(doc(), { cards: [], changes: [change('kort-2', { pris: 3, body: 'Säljer mer.' }), change('kort-1', { title: 'Drake' })] })
    expect(translated.ok && translated.edits).toEqual([{ v: 'setCell', cardRef: 'kort-2', field: 'body', value: 'Säljer mer.' }])
    expect(translateProposal(doc(), { cards: [], changes: [change('kort-1', { title: 'Drake' })] })).toEqual({ ok: false, problem: { kind: 'empty' } })
  })

  it('holds new and changed cards side by side, each a part of its own', () => {
    const translated = translateProposal(doc(), { cards: [card({ title: 'Varg', body: 'Biter.', antal: 1 })], changes: [change('kort-1', { body: 'Flyger högt.' })] })
    expect(translated.ok && translated.parts.map((p) => [p.kind, p.key])).toEqual([
      ['card', 'card:1'],
      ['change', 'change:kort-1'],
    ])
    expect(translated.ok && translated.parts[0]).toMatchObject({ kind: 'card', cardRef: 'kort-3', fields: { title: 'Varg', body: 'Biter.', antal: 1 } })
  })

  it('still reads a proposal of new cards alone, as #1002 wrote it', () => {
    expect(translateProposal(doc(), { cards: [card({ title: 'Varg', body: 'Biter.', antal: 1 })] }).ok).toBe(true)
  })
})

describe('a chosen part of a proposal is exactly those parts (#1003, «Välj delar…»)', () => {
  const proposal = () => ({
    cards: [card({ title: 'Varg', body: 'Biter.', antal: 1 }), card({ title: 'Räv', body: 'Smyger.', antal: 1 }), card({ title: 'Lo', body: 'Väntar.', antal: 2 })],
    changes: [change('kort-1', { body: 'Flyger högt.' }), change('kort-2', { pris: 2 })],
  })

  it('leaves out the parts left out, and gives the new cards it keeps the next free ids in order', () => {
    const translated = translateProposal(doc(), proposal(), new Set(['card:1', 'change:kort-2']))
    expect(translated.ok && translated.edits).toEqual([
      { v: 'addRow', cardRef: 'kort-3', fields: { title: 'Räv', body: 'Smyger.', antal: 1 } },
      { v: 'addRow', cardRef: 'kort-4', fields: { title: 'Lo', body: 'Väntar.', antal: 2 } },
      { v: 'setCell', cardRef: 'kort-1', field: 'body', value: 'Flyger högt.' },
    ])
    expect(translated.ok && translated.parts.map((p) => p.key)).toEqual(['card:2', 'card:3', 'change:kort-1'])
  })

  it('applied as one composite edit, gives the deck exactly the chosen parts', () => {
    const translated = translateProposal(doc(), proposal(), new Set(['card:3', 'change:kort-1']))
    if (!translated.ok) throw new Error('refused')
    const after = applyEdit(doc(), { v: 'compound', edits: translated.edits })
    expect(after.rows.map((r) => [r.id, r.fields['title'], r.fields['body'], r.fields['pris']])).toEqual([
      ['kort-1', 'Drake', 'Flyger. {mynt}', ''],
      ['kort-2', 'Bod', 'Säljer.', 2],
      ['kort-3', 'Varg', 'Biter.', undefined],
      ['kort-4', 'Räv', 'Smyger.', undefined],
    ])
  })

  it('still refuses the whole proposal when a part left out could not be used', () => {
    const bad = { ...proposal(), changes: [change('kort-9', { body: 'Ny.' })] }
    expect(translateProposal(doc(), bad, new Set(['change:kort-9']))).toMatchObject({ ok: false, problem: { kind: 'unknown-card', changed: 'kort-9' } })
  })
})

describe('a changed card that cannot be used is refused, and says why (#1003)', () => {
  const refused = (changes: ReturnType<typeof change>[]) => {
    const translated = translateProposal(doc(), { cards: [], changes })
    if (translated.ok) throw new Error('the proposal was taken')
    return translated.problem
  }

  it('refuses a card the game does not have, and the same card changed twice', () => {
    expect(refused([change('kort-9', { body: 'Ny.' })])).toEqual({ kind: 'unknown-card', changed: 'kort-9' })
    expect(refused([change('kort-1', { body: 'Ny.' }), change('kort-1', { title: 'Lindorm' })])).toEqual({ kind: 'repeated-card', changed: 'kort-1', title: 'Drake' })
  })

  it('refuses a field the game does not have, its key, a picture, and a field written twice', () => {
    expect(refused([change('kort-1', { trolldom: 3 })])).toEqual({ kind: 'unknown-field', changed: 'kort-1', title: 'Drake', field: 'trolldom' })
    expect(refused([change('kort-1', { id: 'drake' })])).toMatchObject({ kind: 'unknown-field', field: 'id' })
    expect(refused([change('kort-1', { bild: 'drake.png' })])).toEqual({ kind: 'picture-field', changed: 'kort-1', title: 'Drake', field: 'bild' })
    expect(refused([{ card: 'kort-1', fields: [{ field: 'body', value: 'A.' }, { field: 'body', value: 'B.' }] }])).toEqual({ kind: 'repeated-field', changed: 'kort-1', title: 'Drake', field: 'body' })
  })

  it('refuses text outside the card text syntax (L2), and a symbol or meaning the game does not have', () => {
    expect(refused([change('kort-1', { body: '<b>Flyger</b>' })])).toEqual({ kind: 'bad-syntax', changed: 'kort-1', title: 'Drake', field: 'body' })
    expect(refused([change('kort-1', { body: 'Kostar {guld}.' })])).toEqual({ kind: 'unknown-icon', changed: 'kort-1', title: 'Drake', field: 'body', icon: 'guld' })
    expect(refused([change('kort-1', { body: 'Kostar {mynt|vinst}.' })])).toEqual({ kind: 'unknown-role', changed: 'kort-1', title: 'Drake', field: 'body', role: 'vinst' })
  })

  it('refuses a value that breaks its column: a word in a column of numbers', () => {
    expect(refused([change('kort-2', { pris: 'billig' })])).toEqual({ kind: 'wrong-kind', changed: 'kort-2', title: 'Bod', field: 'pris', column: 'number' })
    // A number written as text is still a number.
    expect(translateProposal(doc(), { cards: [], changes: [change('kort-2', { pris: '4' })] }).ok).toBe(true)
  })

  it('refuses a count that is not a whole number from nought', () => {
    for (const antal of ['två', -1, 1.5, '']) expect(refused([change('kort-1', { antal })]), String(antal)).toEqual({ kind: 'bad-count', changed: 'kort-1', title: 'Drake' })
  })

  it('refuses emptying a field the template draws on that card', () => {
    expect(refused([change('kort-2', { pris: '' })])).toEqual({ kind: 'empty-field', changed: 'kort-2', title: 'Bod', field: 'pris' })
    // A monster draws no price, so emptying it is nothing the card shows.
    expect(translateProposal(doc(), { cards: [], changes: [change('kort-1', { fraktion: 'Bergen' })] }).ok).toBe(true)
  })
})

describe('the schema the provider is held to', () => {
  it('is the same zod schema the answer is read with, written as strict JSON Schema', () => {
    const schema = proposalSchema()
    expect(schema).not.toHaveProperty('$schema')
    expect(schema).toMatchObject({ type: 'object', additionalProperties: false, required: ['cards', 'changes', 'template', 'rules'] })
    // Strict modes read no defaults; a part the model has nothing for is an empty list it writes.
    expect(JSON.stringify(schema)).not.toContain('"default"')
    const changes = (schema as { properties: { changes: { items: { additionalProperties: boolean; required: string[] } } } }).properties.changes
    expect(changes.items).toMatchObject({ additionalProperties: false, required: ['card', 'fields'] })
    const cards = (schema as { properties: { cards: { items: { additionalProperties: boolean; required: string[] } } } }).properties.cards
    expect(cards.items).toMatchObject({ additionalProperties: false, required: ['fields'] })
    // Rule text (#1006): an entry says where it stands and the blocks it brings, every property said.
    const rules = (schema as { properties: { rules: { items: { additionalProperties: boolean; required: string[] } } } }).properties.rules
    expect(rules.items).toMatchObject({ additionalProperties: false, required: ['replace', 'after', 'blocks'] })
    for (const kind of ['heading', 'text', 'list']) expect(JSON.stringify(rules)).toContain(`"kind":{"type":"string","const":"${kind}"}`)
    // A value of several types is said as `anyOf`, which both providers' strict modes read, and
    // never as a list of types, which only some of them do.
    expect(JSON.stringify(schema)).not.toMatch(/"type":\[/)
    expect(JSON.stringify(schema)).toContain('"anyOf":[{"type":"string"},{"type":"number"},{"type":"boolean"}]')
    // Whatever the schema lets through is what the zod schema reads.
    expect(Proposal.safeParse({ cards: [card({ title: 'Varg', antal: 1, kraftig: true })] }).success).toBe(true)
  })

  // A template is a tree (#1005), and Anthropic's strict mode reads no recursive schema; written flat,
  // with `parent`, it needs no reference at all. And neither strict mode reads `oneOf` or a bound —
  // a length, a least or a most — so the schema says none, and the template model judges the bounds.
  it('says a template without recursion, references, `oneOf` or bounds, every object strict', () => {
    const schema = proposalSchema()
    const said = JSON.stringify(schema)
    expect(said).not.toMatch(/"\$ref"|"\$defs"|"oneOf"|"allOf"/)
    const objects: Record<string, unknown>[] = []
    // The keywords the schema says, which a property's own name — `pattern`, say — is not.
    const keywords = new Set<string>()
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) return node.forEach(walk)
      if (node === null || typeof node !== 'object') return
      const o = node as Record<string, unknown>
      if (o['type'] === 'object') objects.push(o)
      for (const [key, value] of Object.entries(o)) {
        keywords.add(key)
        walk(key === 'properties' ? Object.values(value as object) : value)
      }
    }
    walk(schema)
    for (const bound of ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength', 'minItems', 'maxItems', 'pattern', 'format']) expect(keywords).not.toContain(bound)
    expect(objects.length).toBeGreaterThan(10)
    for (const o of objects) {
      expect(o['additionalProperties']).toBe(false)
      expect([...(o['required'] as string[])].sort()).toEqual(Object.keys(o['properties'] as object).sort())
    }
    // The element kinds are the template's own six, and a template part is in the schema as an object or null.
    expect(said).toContain('"anyOf":[{"type":"object","properties":{"face"')
    for (const kind of ['text', 'image', 'icons', 'shape', 'group', 'if']) expect(said).toContain(`"kind":{"type":"string","const":"${kind}"}`)
  })
})
