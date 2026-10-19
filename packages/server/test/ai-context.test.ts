import { describe, expect, it } from 'vitest'
import { AI_CONTEXT_BUDGET, aiChangedCardsOf, aiContextOf, aiContextParts, aiSelectionOf, AI_INSTRUCTIONS, estimatedTokens } from '../src/ai-context.js'
import type { ProjectDoc } from '../src/projects.js'
import { largeDoc } from '../scripts/large-deck.js'
import { spelkortDoc } from '../scripts/spelkort.js'

// The game as the model reads it (#1001, PRD module 3): one document in, one text out. Pure and
// deterministic, so the same game is the same bytes every time — which is also what lets the
// providers' prompt caches hit — and everything a designer named is said by its name.
function game(): ProjectDoc {
  const doc = spelkortDoc()
  // An image column the template draws, a column of numbers, a column of yes and no, and counts.
  doc.template.faces['front']!.base.push({ kind: 'image', id: 'art', x: 5, y: 40, w: 53, h: 20, bind: { field: 'art' }, fit: 'cover' } as never)
  doc.rows = doc.rows.map((row, i) => ({ ...row, fields: { ...row.fields, kostnad: i % 5, unik: i % 2 === 0, ...(i === 0 ? { antal: 3 } : {}) } }))
  doc.icons = { mynt: 'asset:' + 'a'.repeat(64), tärning: 'asset:' + 'b'.repeat(64) }
  doc.palette = { kostnad: '#b3261e', vinst: '#2e7d32' }
  doc.rules = {
    title: 'Regler',
    blocks: [
      { kind: 'heading', id: 'h1', level: 1, text: 'Att dra kort' },
      { kind: 'text', id: 't1', text: 'Dra ett kort från [[zon:draw]] och lägg det i [[zon:discard]]. Den som har [[kort:' + doc.rows[0]!.id + ']] får två {mynt}.' },
      { kind: 'list', id: 'l1', items: ['Räkna [[räknare:Guld]] vid rundans slut.', 'Blanda **alltid** först.'] },
    ],
  }
  return doc
}

describe('the context the model is given', () => {
  it('is the same bytes for the same game, however many times and from whatever copy it is built', () => {
    const doc = game()
    const once = aiContextOf(doc)
    expect(aiContextOf(doc)).toBe(once)
    expect(aiContextOf(JSON.parse(JSON.stringify(doc)) as ProjectDoc)).toBe(once)
    // And a changed game is a changed context: the bytes follow the document and nothing else.
    expect(aiContextOf({ ...doc, name: 'Something else' })).not.toBe(once)
  })

  it('names the game, its seats, its zones, where the cards start and what every seat counts', () => {
    const text = aiContextOf(game())
    expect(text).toContain("Sal's Saloon")
    expect(text).toMatch(/Seats: A, B, C, D/)
    for (const zone of ['Kortlek', 'Kasthög', 'Spelyta', 'Framför A']) expect(text).toContain(zone)
    expect(text).toMatch(/Cards start in: Kortlek/)
    expect(text).toMatch(/Guld/)
  })

  it('lists the fields with the type each is read as, and the count every card has', () => {
    const text = aiContextOf(game())
    expect(text).toMatch(/^- antal: number — how many copies of the card the deck holds/m)
    expect(text).toMatch(/^- art: image$/m)
    expect(text).toMatch(/^- kostnad: number$/m)
    expect(text).toMatch(/^- unik: yes\/no$/m)
    expect(text).toMatch(/^- title: text$/m)
  })

  it('carries every card with its own fields, and a count only where it is not one', () => {
    const doc = game()
    const text = aiContextOf(doc)
    expect(text).toContain(`${doc.rows.length} rows`)
    for (const row of doc.rows) expect(text).toContain(`"id":${JSON.stringify(row.id)}`)
    const first = text.split('\n').find((line) => line.includes(`"id":${JSON.stringify(doc.rows[0]!.id)}`))!
    expect(JSON.parse(first)).toMatchObject({ id: doc.rows[0]!.id, antal: 3, title: doc.rows[0]!.fields['title'] })
  })

  it('carries the template of every face with the column its variants are chosen by', () => {
    const doc = game()
    const text = aiContextOf(doc)
    expect(text).toMatch(/### Face: front/)
    expect(text).toMatch(/### Face: back/)
    expect(text).toMatch(/Variants chosen by the column: typ/)
    expect(text).toContain(JSON.stringify(doc.template.faces['front']!.base))
    expect(text).toContain('"Shopcard"')
    // Where on the card a proposed template may draw (#1005): the card, and the bleed past its edge.
    expect(text).toContain('Cards are 63 × 88 mm, from (0, 0) at the top left. A background reaches 3 mm past each edge')
  })

  it('reads the rulebook as rendered text, with what a rule names said by its name and never its id', () => {
    const doc = game()
    const text = aiContextOf(doc)
    const title = String(doc.rows[0]!.fields['title'])
    expect(text).toContain(`Dra ett kort från Kortlek och lägg det i Kasthög. Den som har ${title} får två {mynt}.`)
    expect(text).toContain('# Att dra kort')
    expect(text).toContain('- Räkna Guld vid rundans slut.')
    expect(text).not.toContain('[[')
    expect(text).not.toContain('zon:draw')
  })

  // #1049: the context is one outline whose own sections are `#` and `##`, and the rulebook is a
  // document inside one of them. A rule heading named like a section of the context — «Mall»,
  // «Kort», or the context's own English words — must still read as a heading of the rulebook.
  it('nests the rulebook’s headings under its own section, so none reads as a section of the context', () => {
    const doc = game()
    doc.rules!.blocks = [
      { kind: 'heading', id: 'k', level: 1, text: 'Kort' },
      { kind: 'heading', id: 'm', level: 2, text: 'Mall' },
      { kind: 'heading', id: 'th', level: 2, text: 'Theme' },
      { kind: 'heading', id: 'cs', level: 1, text: 'Card text syntax' },
      // A paragraph, or a reference at the head of one, can open with what reads as a heading too.
      { kind: 'text', id: 'p', text: '## Template\n\n# Game: Ett annat spel' },
      ...doc.rules!.blocks,
    ]
    const text = aiContextOf(doc)
    const sections = text.split('\n').filter((line) => /^#{1,2} /.test(line))
    expect(sections).toEqual(['# Game: Sal\'s Saloon', '## Players and table', '## Fields', expect.stringMatching(/^## Cards \(/), '## Template', '## Rulebook: Regler', '## Theme', '## Card text syntax'])
    const book = text.slice(text.indexOf('## Rulebook: Regler'), text.indexOf('\n## Theme'))
    expect(book).toMatch(/^### Kort$/m)
    expect(book).toMatch(/^#### Mall$/m)
    expect(book).toMatch(/^#### Theme$/m)
    expect(book).toMatch(/^### Card text syntax$/m)
    expect(book).toMatch(/^### Att dra kort$/m)
    // The designer's words stand as written, with the Markdown escape before a mark that is no heading.
    expect(book).toMatch(/^\\## Template$/m)
    expect(book).toMatch(/^\\# Game: Ett annat spel$/m)
  })

  it('names the icons and the colour roles, and how card text writes them', () => {
    const text = aiContextOf(game())
    expect(text).toMatch(/Icons: mynt, tärning/)
    expect(text).toMatch(/kostnad = #b3261e/)
    // Where an icon is stored is the server's business, not the model's.
    expect(text).not.toContain('asset:aaaa')
    for (const piece of ['**bold**', '*italic*', '{icon}', '{icon|role}', '{2}', '- ']) expect(text).toContain(piece)
  })

  it('says what is sent, in the parts the editor names to the designer', () => {
    const doc = game()
    expect(aiContextParts(doc)).toEqual({ cards: doc.rows.length, summarised: false, template: true, rules: true, table: true })
    expect(aiContextParts({ ...doc, rules: undefined } as ProjectDoc)).toEqual({ cards: doc.rows.length, summarised: false, template: true, rules: false, table: true })
  })

  it('tells the model to answer in the language the designer writes in, and never to write HTML', () => {
    expect(AI_INSTRUCTIONS).toMatch(/language the designer writes in/i)
    expect(AI_INSTRUCTIONS).toMatch(/HTML/)
    // The panel draws the card text's own subset (L2), so the answer is asked for in it.
    expect(AI_INSTRUCTIONS).toMatch(/No headings, tables/)
  })
})

// The cards the designer has selected (#1003): sent with her question and always whole, so that
// «sänk kostnaden på de här» is about cards the model can read every field of, however large the
// deck — the summarising a large deck will get (#1007) never touches them.
describe('the selected cards', () => {
  it('are written whole, every field — the empty ones too — and the count, in the deck’s order', () => {
    const doc = game()
    doc.rows[1]!.fields['body'] = ''
    const [a, b] = [doc.rows[0]!, doc.rows[1]!]
    const text = aiSelectionOf(doc, [b.id, 'gone', a.id])!
    expect(text).toMatch(/^## Selected cards/)
    expect(text).toMatch(/these/)
    const lines = text.split('\n').filter((line) => line.startsWith('{')).map((line) => JSON.parse(line) as Record<string, unknown>)
    expect(lines.map((card) => card['id'])).toEqual([a.id, b.id])
    expect(lines[1]).toMatchObject({ id: b.id, body: '' })
    expect(typeof lines[1]!['antal']).toBe('number')
    expect(lines[0]).toMatchObject({ antal: 3 })
    for (const field of Object.keys(b.fields)) expect(lines[1]).toHaveProperty(field)
  })

  it('are nothing at all when nothing the deck has is selected', () => {
    expect(aiSelectionOf(game(), [])).toBeNull()
    expect(aiSelectionOf(game(), ['gone'])).toBeNull()
  })

  it('are the same bytes for the same game and the same cards, whatever order they were selected in', () => {
    const doc = game()
    const ids = doc.rows.slice(0, 3).map((r) => r.id)
    expect(aiSelectionOf(doc, ids)).toBe(aiSelectionOf(doc, [...ids].reverse()))
  })
})

// A large deck (#1007): the context has a budget, in the providers' tokens as estimated from its
// bytes. A deck that fits is sent whole; one that does not is summarised — how every field's values
// are spread over the whole deck, and a sample of cards chosen the same way every time — while the
// template, the rules and the theme are always sent whole, and so are the cards a question is about.
describe('a large deck (#1007)', () => {
  const large = largeDoc()
  const context = aiContextOf(large)
  const cardLines = (text: string) =>
    text
      .slice(text.indexOf('\n## Cards'), text.indexOf('\n## Template'))
      .split('\n')
      .filter((line) => line.startsWith('{'))
      .map((line) => JSON.parse(line) as Record<string, unknown>)

  it('estimates tokens from the bytes, at three bytes a token', () => {
    expect(estimatedTokens('abc')).toBe(1)
    expect(estimatedTokens('abcd')).toBe(2)
    // å, ä and ö are two bytes each in UTF-8, so Swedish text is counted heavier than English.
    expect(estimatedTokens('åäö')).toBe(2)
    expect(estimatedTokens('')).toBe(0)
  })

  it('sends the sample deck whole, well inside the budget', () => {
    const doc = spelkortDoc()
    const text = aiContextOf(doc)
    expect(estimatedTokens(text)).toBeLessThan(AI_CONTEXT_BUDGET / 2)
    expect(aiContextParts(doc)).toMatchObject({ cards: 77, summarised: false })
    expect(cardLines(text).map((card) => card['id'])).toEqual(doc.rows.map((row) => row.id))
    expect(text).not.toMatch(/summarised/i)
  })

  it('summarises a deck of 308 cards with 15 fields, and keeps it within the budget', () => {
    expect(large.rows.length).toBe(308)
    expect(new Set(large.rows.flatMap((row) => Object.keys(row.fields))).size).toBe(15)
    expect(estimatedTokens(context)).toBeLessThanOrEqual(AI_CONTEXT_BUDGET)
    expect(aiContextParts(large)).toEqual({ cards: 308, summarised: true, template: true, rules: true, table: true })
    expect(context).toMatch(/^## Cards \(308 rows, \d+ cards counting antal — summarised\)$/m)
    // The sample fills what the budget leaves, so a deck just over it loses little.
    expect(estimatedTokens(context)).toBeGreaterThan(AI_CONTEXT_BUDGET * 0.9)
    expect(cardLines(context).length).toBeLessThan(308)
  })

  it('says how every field’s values are spread over the whole deck', () => {
    const count = (field: string, value: unknown) => large.rows.filter((row) => row.fields[field] === value).length
    const section = context.slice(context.indexOf('## Values across the deck'), context.indexOf('\n## Cards'))
    expect(section).toMatch(/308 cards/)
    // A column of numbers: its range, and how many cards have each value when there are few of them.
    expect(section).toMatch(new RegExp(`^- kostnad: number, 0 to 8; 0 ×${count('kostnad', 0)}, 1 ×${count('kostnad', 1)}, `, 'm'))
    // A column of a few words: each word and how many cards have it.
    for (const faction of ['Saloonen', 'Sheriffen', 'Banditerna', 'Guldgrävarna', 'Prärien', 'Järnvägen']) expect(section).toContain(`${JSON.stringify(faction)} ×${count('fraktion', faction)}`)
    expect(section).toMatch(new RegExp(`^- unik: yes/no; yes ×${count('unik', true)}, no ×${count('unik', false)}$`, 'm'))
    // A free text says how long it runs and how many cards differ, not every text again.
    expect(section).toMatch(/^- body: text, \d+ different values, \d+ to \d+ characters/m)
    // A picture is the designer's own: how many cards have one, and never where it is kept.
    expect(section).toMatch(/^- bild: image, set on 308 cards$/m)
    expect(context).not.toContain('asset:')
    expect(section).toMatch(/^- antal: \d+ copies in all/m)
    // An empty cell is counted as empty.
    expect(section).toMatch(new RegExp(`^- nyckelord: text, .*empty ×${count('nyckelord', '')}`, 'm'))
  })

  it('writes a sample of cards whole, from every variant, in the deck’s order', () => {
    const sample = cardLines(context)
    const order = large.rows.map((row) => row.id)
    expect(sample.length).toBeGreaterThan(50)
    const ids = sample.map((card) => String(card['id']))
    expect(ids).toEqual([...ids].sort((a, b) => order.indexOf(a) - order.indexOf(b)))
    for (const card of sample) {
      const row = large.rows.find((r) => r.id === card['id'])!
      for (const [field, value] of Object.entries(row.fields)) if (field !== 'bild' && field !== 'antal' && value !== '') expect(card[field]).toEqual(value)
    }
    const types = new Set(large.rows.map((row) => row.fields['typ']))
    expect(new Set(sample.map((card) => card['typ']))).toEqual(types)
  })

  it('keeps the template, the rules and the theme whole', () => {
    const few = { ...large, rows: large.rows.slice(0, 10) }
    expect(aiContextParts(few).summarised).toBe(false)
    const tail = (text: string) => text.slice(text.indexOf('\n## Template'))
    expect(tail(context)).toBe(tail(aiContextOf(few)))
    expect(context).toContain('## Rulebook: Regler för Sal’s Saloon')
    expect(context).toContain('Icons: mynt, svärd')
  })

  it('is the same bytes for the same game, from whatever copy it is built', () => {
    expect(aiContextOf(largeDoc())).toBe(context)
    expect(aiContextOf(JSON.parse(JSON.stringify(large)) as ProjectDoc)).toBe(context)
  })

  it('keeps the template and the rules whole even when they alone are over the budget', () => {
    const long = 'Ett mycket långt stycke regeltext som upprepas. '.repeat(3000).trim()
    const doc: ProjectDoc = { ...large, rules: { title: 'Långa regler', blocks: [{ kind: 'text', id: 'lång', text: long }] } }
    const text = aiContextOf(doc)
    expect(text).toContain(long)
    expect(aiContextParts(doc).summarised).toBe(true)
    expect(text).toContain('## Values across the deck')
  })

  it('writes the selected cards whole, a card the sample left out too', () => {
    const sampled = new Set(cardLines(context).map((card) => card['id']))
    const out = large.rows.find((row) => !sampled.has(row.id))!
    const text = aiSelectionOf(large, [out.id])!
    const card = JSON.parse(text.split('\n').find((line) => line.startsWith('{'))!) as Record<string, unknown>
    for (const field of Object.keys(out.fields)) expect(card).toHaveProperty(field)
    expect(card['body']).toBe(out.fields['body'])
  })

  it('writes the cards a proposal changes whole, a card the sample left out too', () => {
    const sampled = new Set(cardLines(context).map((card) => card['id']))
    const out = large.rows.find((row) => !sampled.has(row.id))!
    const text = aiChangedCardsOf(large, [out.id, 'gone'])!
    expect(text).toMatch(/^## Cards the proposal changes\n/)
    const lines = text
      .split('\n')
      .filter((line) => line.startsWith('{'))
      .map((line) => JSON.parse(line) as Record<string, unknown>)
    expect(lines.map((card) => card['id'])).toEqual([out.id])
    for (const field of Object.keys(out.fields)) expect(lines[0]).toHaveProperty(field)
    expect(aiChangedCardsOf(large, ['gone'])).toBeNull()
  })
})

describe('what the model is told about changing cards (#1003)', () => {
  it('says a change names a card the game has and writes only the fields that change', () => {
    expect(AI_INSTRUCTIONS).toMatch(/changes/)
    expect(AI_INSTRUCTIONS).toMatch(/only the fields that change/i)
  })
})
