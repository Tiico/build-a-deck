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
})
