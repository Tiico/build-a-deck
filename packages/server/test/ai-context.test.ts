import { describe, expect, it } from 'vitest'
import { aiContextOf, aiContextParts, AI_INSTRUCTIONS } from '../src/ai-context.js'
import type { ProjectDoc } from '../src/projects.js'
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
    expect(aiContextParts(doc)).toEqual({ cards: doc.rows.length, template: true, rules: true, table: true })
    expect(aiContextParts({ ...doc, rules: undefined } as ProjectDoc)).toEqual({ cards: doc.rows.length, template: true, rules: false, table: true })
  })

  it('tells the model to answer in the language the designer writes in, and never to write HTML', () => {
    expect(AI_INSTRUCTIONS).toMatch(/language the designer writes in/i)
    expect(AI_INSTRUCTIONS).toMatch(/HTML/)
  })
})
