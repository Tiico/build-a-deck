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
})
