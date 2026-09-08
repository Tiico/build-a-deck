import type { ProjectDoc, ProjectRow } from '@byd/server'
import { fieldsOf } from './fields.js'
import { translate, type T } from '../i18n/index.js'

// Without a catalogue of its own this module speaks Swedish, exactly as a surface mounted
// without a language provider does: the table hands over its own `t` (A4).
const swedish: T = (key, params) => translate('sv', key, params)

export type ParsedCsv = { headers: string[]; rows: Record<string, string>[] }

// CSV as spreadsheets export it: a header line, then rows; commas or tabs; RFC-style quotes
// with doubled quotes inside; CRLF tolerated. Values stay strings until the editor types them.
export function parseCsv(text: string): ParsedCsv {
  const separator = text.includes('\t') ? '\t' : ','
  const records = splitCsv(text, separator).filter((record) => record.some((cell) => cell.trim().length > 0))
  const [head, ...rest] = records
  if (!head) return { headers: [], rows: [] }
  const headers = head.map((header) => header.trim())
  return {
    headers,
    rows: rest.map((cells) => Object.fromEntries(headers.map((header, index) => [header, (cells[index] ?? '').trim()]))),
  }
}

// CSV is an editor interchange format: the visible table order is preserved and id remains a
// first-class column. All ordinary cells are strings on import; `antal` keeps its numeric meaning.
export function exportCardsCsv(doc: ProjectDoc): string {
  const fields = fieldsOf(doc)
  const records = [
    ['id', ...fields],
    ...doc.rows.map((row) => [row.id, ...fields.map((field) => row.fields[field] ?? '')]),
  ]
  return records.map((record) => record.map(csvCell).join(',')).join('\r\n')
}

export function importCardsCsv(text: string, t: T = swedish): ProjectRow[] {
  const parsed = parseCsv(text)
  if (!parsed.headers.includes('id')) throw new Error(t('table.import.needsId'))
  const fields = parsed.headers.filter((header) => header !== 'id')
  const ids = new Set<string>()
  return parsed.rows.map((record) => {
    const id = record['id']?.trim() ?? ''
    if (!id) throw new Error(t('table.import.noId'))
    if (ids.has(id)) throw new Error(t('table.import.duplicateId', { id }))
    ids.add(id)
    return {
      id,
      fields: Object.fromEntries(fields.map((field) => [field, field === 'antal' ? count(record[field]) : (record[field] ?? '')])),
    }
  })
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function count(value: string | undefined): number {
  const number = Number(value ?? '')
  return Number.isFinite(number) && number >= 0 ? number : 1
}

function splitCsv(text: string, separator: string): string[][] {
  const records: string[][] = []
  let record: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < text.length; index++) {
    const character = text[index]
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          cell += '"'
          index++
        } else quoted = false
      } else cell += character
    } else if (character === '"') quoted = true
    else if (character === separator) {
      record.push(cell)
      cell = ''
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index++
      record.push(cell)
      records.push(record)
      record = []
      cell = ''
    } else cell += character
  }
  if (cell.length > 0 || record.length > 0) {
    record.push(cell)
    records.push(record)
  }
  return records
}
