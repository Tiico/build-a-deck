import { describe, expect, it } from 'vitest'
import { exportCardsCsv, importCardsCsv } from '../src/editor/csv.js'
import { projectDoc } from './project-doc.js'

describe('editor card CSV', () => {
  it('round-trips card order, ids, counts, commas, newlines, and quotes', () => {
    const doc = projectDoc()
    doc.rows[0]!.fields['body'] = 'Flyg,\nslå "nu".'

    const csv = exportCardsCsv(doc)
    expect(csv).toContain('id,title,body,antal')
    expect(csv).toContain('"Flyg,\nslå ""nu""."')

    expect(importCardsCsv(csv)).toEqual(doc.rows)
  })

  // The body's marking is Markdown living in an ordinary text cell (#308), so it has to survive
  // a round trip through a spreadsheet character for character: a star that came back as two, or
  // a blank line that came back as one, is a card that renders differently after an export it was
  // never meant to change.
  it('brings the body’s marking back exactly as it was written', () => {
    const doc = projectDoc()
    const written = 'Gör **{eld} skada**.\n\nVälj sedan en:\n- *dra* ett kort\n- lägg **två** i högen\n\nInte <b>fet</b>.'
    doc.rows[0]!.fields['body'] = written

    const back = importCardsCsv(exportCardsCsv(doc))

    expect(back[0]!.fields['body']).toBe(written)
    expect(back).toEqual(doc.rows)
  })

  // A header that differs from a column only in its capitals is that column (#479), but a header
  // that *is* a column is that one. A deck that got `typ` and `TYP` before the doors refused it
  // (#694) has both, and exporting it and reading the file back folded the two into one.
  it('keeps two columns that differ only in their capitals apart, when the deck already has both (#694)', () => {
    const doc = projectDoc()
    doc.rows = doc.rows.map((r, i) => ({ ...r, fields: { ...r.fields, typ: `liten${i}`, TYP: `STOR${i}` } }))

    const back = importCardsCsv(exportCardsCsv(doc), undefined, ['title', 'body', 'typ', 'TYP', 'antal'])

    expect(back).toEqual(doc.rows)
    // And a header in other capitals is still paired with the column the deck has.
    expect(importCardsCsv('ID,Body\nx,y', undefined, ['title', 'body', 'antal'])).toEqual([{ id: 'x', fields: { body: 'y' } }])
  })

  // The import is a door into new columns as well, and asks what the table's door asks (#694):
  // two new headers in one file that differ only in their capitals would make the twins the
  // other doors refuse, so the file is refused with a sentence, as a file without ids is.
  it('refuses a file whose new headers differ from each other only in their capitals (#694)', () => {
    expect(() => importCardsCsv('id,typ,TYP\nx,a,b', undefined, ['title', 'antal'])).toThrow('CSV-filen har både typ och TYP, och kolumnernas namn får inte skilja sig bara i versaler')
    // And one of them a column the deck already has is no different: both would be read into it.
    expect(() => importCardsCsv('id,Typ,TYP\nx,a,b', undefined, ['title', 'typ', 'antal'])).toThrow('CSV-filen har både Typ och TYP')
  })
})
