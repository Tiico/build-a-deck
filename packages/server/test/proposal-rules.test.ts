import { describe, expect, it } from 'vitest'
import { applyEdit } from '../src/edits.js'
import { translateProposal } from '../src/proposal.js'
import type { ProjectDoc } from '../src/projects.js'
import { twoSeatSetup } from './fixture.js'

// Rule text as a proposal (#1006, B7, E4): blocks in the rulebook's own kinds, placed by the ids of
// the blocks they stand at, with what a rule names written `[[zon:id]]`, `[[kort:id]]` and
// `[[räknare:id]]` as the book stores it. The translator turns each entry into one `spliceRules`,
// tried on a copy of the game — and refuses, with the reason and without touching the game, a
// reference to something the game does not have, a block of a kind the book does not have, a
// reference or text the inline syntax cannot read, and a place in the book that is not there.
const doc = (): ProjectDoc => {
  const { zones, seats, floor } = twoSeatSetup()
  return {
    name: 'Skogens herrar',
    template: { faces: {} },
    rows: [{ id: 'kort-1', fields: { title: 'Drake', antal: 1 } }],
    icons: { mynt: 'asset:mynt' },
    palette: { guld: '#c9a227' },
    setup: { zones, seats, floor, deckZone: 'draw', counters: [{ id: 'guld', name: 'Guld', start: 0 }] },
    rules: {
      title: 'Skogens herrar',
      blocks: [
        { kind: 'heading', id: 'b1', level: 1, text: 'Översikt' },
        { kind: 'text', id: 'b2', text: 'Ett spel om skogen.' },
        { kind: 'heading', id: 'b3', level: 1, text: 'Uppställning' },
        { kind: 'setup', id: 'b4', caption: 'Bordet.' },
        { kind: 'heading', id: 'b5', level: 1, text: 'En tur' },
        { kind: 'text', id: 'b6', text: 'Dra ett kort.' },
      ],
    },
  }
}
type Block = { kind: 'heading'; level: 1 | 2; text: string } | { kind: 'text'; text: string } | { kind: 'list'; ordered: boolean; items: string[] }
const rules = (...entries: { replace?: string[]; after?: string | null; blocks: Block[] }[]) => ({
  cards: [],
  changes: [],
  template: null,
  rules: entries.map((e) => ({ replace: e.replace ?? [], after: e.after ?? null, blocks: [...e.blocks] })),
})
const section: Block[] = [
  { kind: 'heading', level: 1, text: 'Att dra kort' },
  { kind: 'text', text: 'Dra ett kort från [[zon:draw]]. Den som har [[kort:kort-1]] får ett {mynt} och räknar [[räknare:guld]].' },
  { kind: 'list', ordered: true, items: ['Dra.', 'Spela **ett** kort.'] },
]
const refused = (answer: unknown) => {
  const read = translateProposal(doc(), answer)
  if (read.ok) throw new Error('was not refused')
  return read.problem
}

describe('rule text proposed for the rulebook (#1006)', () => {
  it('becomes one splice of the book per entry, the new blocks under ids of their own, the references kept as ids', () => {
    const read = translateProposal(doc(), rules({ after: 'b6', blocks: section }))
    if (!read.ok) throw new Error(JSON.stringify(read.problem))
    expect(read.parts).toHaveLength(1)
    expect(read.parts[0]).toMatchObject({ kind: 'rules', key: 'rules:1', replaced: [] })
    expect(read.edits).toEqual([
      {
        v: 'spliceRules',
        replace: [],
        after: 'b6',
        blocks: [
          { kind: 'heading', id: 'b7', level: 1, text: 'Att dra kort' },
          { kind: 'text', id: 'b8', text: section[1]!.kind === 'text' ? section[1]!.text : '' },
          { kind: 'list', id: 'b9', ordered: true, items: ['Dra.', 'Spela **ett** kort.'] },
        ],
      },
    ])
    const after = read.edits.reduce(applyEdit, doc())
    expect(after.rules!.blocks.map((b) => b.id)).toEqual(['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9'])
  })

  it('rewrites blocks in their place, and says which blocks it replaces', () => {
    const read = translateProposal(doc(), rules({ replace: ['b6'], blocks: [{ kind: 'text', text: 'Dra två kort från [[zon:draw]].' }] }))
    if (!read.ok) throw new Error(JSON.stringify(read.problem))
    expect(read.parts[0]).toMatchObject({ kind: 'rules', key: 'rules:1', replaced: ['b6'] })
    const after = read.edits.reduce(applyEdit, doc())
    expect(after.rules!.blocks.at(-1)).toEqual({ kind: 'text', id: 'b7', text: 'Dra två kort från [[zon:draw]].' })
  })

  it('starts a book for a game that has none, named as the game is', () => {
    const read = translateProposal({ ...doc(), rules: undefined }, rules({ blocks: section }))
    if (!read.ok) throw new Error(JSON.stringify(read.problem))
    const after = read.edits.reduce(applyEdit, { ...doc(), rules: undefined })
    expect(after.rules!.title).toBe('Skogens herrar')
    expect(after.rules!.blocks.map((b) => b.id)).toEqual(['b1', 'b2', 'b3'])
  })

  it('refuses a reference to a zone, card or counter the game does not have, naming it', () => {
    expect(refused(rules({ after: 'b6', blocks: [{ kind: 'text', text: 'Lägg den i [[zon:hemlig]].' }] }))).toEqual({ kind: 'rules', section: 1, fault: { kind: 'unknown-ref', ref: 'zon:hemlig' } })
    expect(refused(rules({ after: 'b6', blocks: [{ kind: 'list', ordered: false, items: ['Visa [[kort:kort-9]].'] }] }))).toMatchObject({ fault: { kind: 'unknown-ref', ref: 'kort:kort-9' } })
    expect(refused(rules({ after: 'b6', blocks: [{ kind: 'heading', level: 2, text: 'Om [[räknare:silver]]' }] }))).toMatchObject({ fault: { kind: 'unknown-ref', ref: 'räknare:silver' } })
  })

  it('refuses a reference the book cannot read, and text past the inline syntax', () => {
    // A name in brackets is how a file names a thing (#708), and not what a proposal writes.
    expect(refused(rules({ after: 'b6', blocks: [{ kind: 'text', text: 'Dra från [[Kortlek]].' }] }))).toMatchObject({ fault: { kind: 'bad-ref', written: '[[Kortlek]]' } })
    expect(refused(rules({ after: 'b6', blocks: [{ kind: 'text', text: 'Dra från [[hög:draw]].' }] }))).toMatchObject({ fault: { kind: 'bad-ref', written: '[[hög:draw]]' } })
    expect(refused(rules({ after: 'b6', blocks: [{ kind: 'text', text: 'Dra från [[zon:draw].' }] }))).toMatchObject({ fault: { kind: 'bad-ref' } })
    expect(refused(rules({ after: 'b6', blocks: [{ kind: 'text', text: '## En rubrik i ett stycke' }] }))).toMatchObject({ fault: { kind: 'bad-syntax' } })
    expect(refused(rules({ after: 'b6', blocks: [{ kind: 'text', text: 'Se <b>här</b>.' }] }))).toMatchObject({ fault: { kind: 'bad-syntax' } })
    expect(refused(rules({ after: 'b6', blocks: [{ kind: 'text', text: 'Få ett {silver}.' }] }))).toMatchObject({ fault: { kind: 'unknown-icon', icon: 'silver' } })
    expect(refused(rules({ after: 'b6', blocks: [{ kind: 'heading', level: 1, text: '  ' }] }))).toMatchObject({ fault: { kind: 'empty' } })
  })

  it('refuses a block of a kind the book does not have, naming the kind', () => {
    const answer = rules({ after: 'b6', blocks: section })
    ;(answer.rules[0]!.blocks as unknown[]).push({ kind: 'table', rows: [] })
    expect(refused(answer)).toEqual({ kind: 'rules', section: 1, title: 'Att dra kort', fault: { kind: 'unknown-kind', type: 'table' } })
  })

  // Anthropic's tool is not strict (#1088), and a long answer has come back with a list under the
  // kind «ordered_placeholder_removed_marker_do_not_use» (#1183). The kinds share no field but
  // `text`, so the fields say which block was meant whatever the kind word says.
  it('reads a block under a kind word the book does not have as the one kind its fields fit', () => {
    const marker = 'ordered_placeholder_removed_marker_do_not_use'
    const read = translateProposal(
      doc(),
      rules({
        after: 'b6',
        blocks: [
          { kind: marker, level: 2, text: 'Varje tur' },
          { kind: marker, text: 'Gör så här.' },
          { kind: marker, ordered: true, items: ['Dra.', 'Spela.'] },
        ] as unknown as Block[],
      }),
    )
    if (!read.ok) throw new Error(JSON.stringify(read.problem))
    expect(read.edits[0]).toMatchObject({
      blocks: [
        { kind: 'heading', id: 'b7', level: 2, text: 'Varje tur' },
        { kind: 'text', id: 'b8', text: 'Gör så här.' },
        { kind: 'list', id: 'b9', ordered: true, items: ['Dra.', 'Spela.'] },
      ],
    })
  })

  it('still refuses a strange kind whose fields fit none of the book’s, or more than its own', () => {
    expect(refused(rules({ after: 'b6', blocks: [{ kind: 'quote', text: 'Ja.', by: 'Någon' }] as unknown as Block[] }))).toMatchObject({ fault: { kind: 'unknown-kind', type: 'quote' } })
    expect(refused(rules({ after: 'b6', blocks: [{ kind: 'x', ordered: true }] as unknown as Block[] }))).toMatchObject({ fault: { kind: 'unknown-kind', type: 'x' } })
  })

  it('refuses a place in the book that is not there, and the same block replaced twice', () => {
    expect(refused(rules({ after: 'b9', blocks: section }))).toMatchObject({ fault: { kind: 'unknown-block', block: 'b9' } })
    expect(refused(rules({ replace: ['b9'], blocks: section }))).toMatchObject({ fault: { kind: 'unknown-block', block: 'b9' } })
    expect(refused(rules({ replace: ['b6'], blocks: section }, { replace: ['b6', 'b2'], blocks: section }))).toMatchObject({ section: 2, fault: { kind: 'repeated-block', block: 'b6' } })
    // Placed after a block another entry replaces: that place is gone when the other lands.
    expect(refused(rules({ replace: ['b6'], blocks: section }, { after: 'b6', blocks: section }))).toMatchObject({ section: 2, fault: { kind: 'repeated-block', block: 'b6' } })
  })

  it('never replaces the setup or a picture, which are the game’s own', () => {
    expect(refused(rules({ replace: ['b3', 'b4'], blocks: section }))).toMatchObject({ section: 1, fault: { kind: 'keeps', block: 'b4', what: 'setup' } })
  })

  it('makes a paragraph written with points into the paragraphs and lists it was written as, as the book does on closing a block (L68)', () => {
    const read = translateProposal(doc(), rules({ after: 'b6', blocks: [{ kind: 'text', text: 'Varje tur:\n- Dra.\n- Spela.' }] }))
    if (!read.ok) throw new Error(JSON.stringify(read.problem))
    expect(read.edits[0]).toMatchObject({ blocks: [{ kind: 'text', id: 'b7', text: 'Varje tur:' }, { kind: 'list', id: 'b8', ordered: false, items: ['Dra.', 'Spela.'] }] })
  })

  it('takes or leaves each entry as a part, and two entries after the same block stand in the order written', () => {
    const two = rules({ after: 'b2', blocks: [{ kind: 'text', text: 'Först.' }] }, { after: 'b2', blocks: [{ kind: 'text', text: 'Sedan.' }] })
    const both = translateProposal(doc(), two)
    if (!both.ok) throw new Error(JSON.stringify(both.problem))
    expect(both.parts.map((p) => p.key)).toEqual(['rules:1', 'rules:2'])
    const texts = (d: ProjectDoc) => d.rules!.blocks.map((b) => (b.kind === 'text' ? b.text : b.id))
    expect(texts(both.edits.reduce(applyEdit, doc()))).toEqual(['b1', 'Ett spel om skogen.', 'Först.', 'Sedan.', 'b3', 'b4', 'b5', 'Dra ett kort.'])
    const second = translateProposal(doc(), two, new Set(['rules:1']))
    if (!second.ok) throw new Error(JSON.stringify(second.problem))
    expect(second.parts.map((p) => p.key)).toEqual(['rules:2'])
    expect(texts(second.edits.reduce(applyEdit, doc()))).toEqual(['b1', 'Ett spel om skogen.', 'Sedan.', 'b3', 'b4', 'b5', 'Dra ett kort.'])
  })

  it('reads an answer written before rule text was proposed as one that proposes none', () => {
    const read = translateProposal(doc(), { cards: [{ fields: [{ field: 'title', value: 'Varg' }, { field: 'antal', value: 1 }] }], changes: [], template: null })
    expect(read.ok).toBe(true)
  })
})
