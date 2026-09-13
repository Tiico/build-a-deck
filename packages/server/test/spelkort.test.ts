import { describe, expect, it } from 'vitest'
import { CARD_STANDARD_63x88 } from '@byd/engine'
import { compileCard, elementsFor, type Element } from '@byd/template'
import { ProjectDoc, setupFromProject } from '../src/projects.js'
import { readSpelkort, spelkortDoc, spelkortRows } from '../scripts/spelkort.js'

// The seed game is the export of a game that has been played for real: the cards as its design
// sheet lists them, one line per physical card. The seed keeps every one of them.
const csv = readSpelkort()
const doc = spelkortDoc()

// Every element a face puts on a card for this row, groups and conditions opened up.
function flatten(els: Element[]): Element[] {
  return els.flatMap((el) => (el.kind === 'group' || el.kind === 'if' ? [el, ...flatten(el.children)] : [el]))
}
const boundTo = (els: Element[], field: string) => flatten(els).some((el) => 'bind' in el && 'field' in el.bind && el.bind.field === field)

describe('the seed game from the design sheet export', () => {
  it('keeps every physical card in the export, once', () => {
    expect(csv.length).toBe(146)
    const copies = doc.rows.reduce((n, row) => n + Number(row.fields['antal']), 0)
    expect(copies).toBe(csv.length)
    const setup = setupFromProject(doc)
    const cards = setup.components.filter((c) => c.type.id === CARD_STANDARD_63x88.id)
    expect(cards).toHaveLength(csv.length)
    expect(cards.every((c) => c.zone === doc.setup.deckZone && c.face === 'back')).toBe(true)
  })

  it('folds identical cards into one row with a count, and keeps different cards with the same title apart', () => {
    const duels = doc.rows.filter((row) => row.fields['title'] === 'Duel')
    expect(duels.map((row) => [row.id, row.fields['raritet'], row.fields['antal']])).toEqual([
      ['duel-koppar', 'Koppar', 4],
      ['duel-silver', 'Silver', 4],
      ['duel-guld', 'Guld', 2],
      ['duel-diamant', 'Diamant', 1],
    ])
    expect(doc.rows.find((row) => row.id === 'sals-saloon')?.fields['antal']).toBe(2)
    expect(doc.rows.find((row) => row.id === 'juice-em-up')?.fields['antal']).toBe(1)
    expect(doc.rows.find((row) => row.id === 'jagerbomb')?.fields['title']).toBe('Jägerbomb')
    expect(new Set(doc.rows.map((row) => row.id)).size).toBe(doc.rows.length)
  })

  it('carries the text as the sheet wrote it: line breaks and quotes included', () => {
    const casino = doc.rows.find((row) => row.id === 'dustydice-casino')
    expect(String(casino?.fields['body'])).toContain('Välkommen till kasinot!\n\nAlla annonserar')
    expect(doc.rows.find((row) => row.id === 'silver-bullet')?.fields['body']).toBe('"+1" i en duel')
    expect(doc.rows.map((row) => row.fields['typ'])).toEqual(expect.arrayContaining(['Playcard', 'Location', 'Effect', 'Event', 'Trap+', 'Trap-', 'Character', 'Shopcard']))
  })

  it('is a valid project whose every card compiles without a missing field or icon', () => {
    expect(() => ProjectDoc.parse(doc)).not.toThrow()
    for (const row of doc.rows) {
      const faces = compileCard({ template: doc.template, type: CARD_STANDARD_63x88, row: row.fields, icons: doc.icons })
      const warnings = Object.values(faces).flatMap((f) => f.warnings.filter((w) => w.code === 'unknown-field' || w.code === 'unknown-icon'))
      expect(warnings, row.id).toEqual([])
      expect(faces['front']?.html).toContain(String(row.fields['title']))
    }
  })

  it('shows the type on both faces, and the rarity on the back only where the sheet puts it', () => {
    const front = doc.template.faces['front']!
    const back = doc.template.faces['back']!
    for (const row of doc.rows) {
      expect(boundTo(elementsFor(front, row.fields), 'typ'), row.id).toBe(true)
      expect(boundTo(elementsFor(front, row.fields), 'raritet'), row.id).toBe(true)
      expect(boundTo(elementsFor(back, row.fields), 'typ'), row.id).toBe(true)
      const inSheet = csv.find((c) => c['card title'] === row.fields['title'] && c['rarity'] === row.fields['raritet'] && c['cardtype'] === row.fields['typ'])!
      expect(boundTo(elementsFor(back, row.fields), 'raritet'), row.id).toBe(inSheet['back rarity icon'] !== 'RarityIcon=NONE')
    }
  })

  it('lays the table out for the game: a saloon to shop in, a discard, gold to count and a place in front of every seat', () => {
    expect(doc.setup.seats).toHaveLength(4)
    const ids = doc.setup.zones.map((z) => z.id)
    expect(ids).toEqual(expect.arrayContaining(['table', 'draw', 'discard', 'market', 'hand:A', 'mine:A', 'counters:A', 'hand:D']))
    expect(doc.setup.zones.find((z) => z.id === 'market')?.name).toBe("Sal's Saloon")
    expect(doc.setup.counters).toEqual([{ name: 'Guld', start: 0 }])
    expect(spelkortDoc(6).setup.seats).toHaveLength(6)
  })

  it('reads the rows from any text in the sheet\'s shape', () => {
    const rows = spelkortRows('number,card title,description,cardtype,rarity,back rarity icon\n1,A,"x, ""y""",Playcard,Guld,RarityIcon=NONE\n2,A,"x, ""y""",Playcard,Guld,RarityIcon=NONE\n3,A,other,Playcard,Guld,RarityIcon=NONE\n')
    expect(rows).toEqual([
      { id: 'a-guld', fields: { title: 'A', typ: 'Playcard', raritet: 'Guld', body: 'x, "y"', antal: 2 } },
      { id: 'a-guld-2', fields: { title: 'A', typ: 'Playcard', raritet: 'Guld', body: 'other', antal: 1 } },
    ])
  })
})
