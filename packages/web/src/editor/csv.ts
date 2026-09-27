import type { ProjectDoc, ProjectRow } from '@byd/server'
import { copiesOf, fieldsOf } from './fields.js'
import { translate, type T } from '../i18n/index.js'

// Without a catalogue of its own this module speaks Swedish, exactly as a surface mounted
// without a language provider does: the table hands over its own `t` (A4).
const swedish: T = (key, params) => translate('sv', key, params)

export type ParsedCsv = { headers: string[]; rows: Record<string, string>[] }

// CSV as spreadsheets export it: a header line, then rows; commas, semicolons or tabs; RFC-style
// quotes with doubled quotes inside; CRLF tolerated. Values stay strings until the editor types
// them. The separator is read off the header line, where the columns' names stand and no value can
// carry one of its own: Swedish Excel writes `;` (#479), and a file that had an id column was told
// it needed one.
export function parseCsv(text: string): ParsedCsv {
  const separator = separatorOf(text)
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
//
// The header row is the columns' own keys, and since #384 those keys are what the designer renames
// (L44): a column renamed in Data is a column whose CSV header changes with it, so a deck exported
// before the rename has a different header row from the same deck exported after. That follows
// from the name *being* the key — there is no separate label to change instead — and it is the
// price the decision names out loud: a spreadsheet or an import the designer keeps outside the
// tool stops matching on the old header until she renames it there too.
export function exportCardsCsv(doc: ProjectDoc): string {
  const fields = fieldsOf(doc)
  const records = [
    ['id', ...fields],
    ...doc.rows.map((row) => [row.id, ...fields.map((field) => row.fields[field] ?? '')]),
  ]
  return records.map((record) => record.map(csvCell).join(',')).join('\r\n')
}

// `known` is the columns the deck already has. A header that differs from one of them, or from `id`
// or `antal`, only in its capitals is that column (#479): `Title` from a spreadsheet stood as a new
// column beside `title`.
export function importCardsCsv(text: string, t: T = swedish, known: readonly string[] = []): ProjectRow[] {
  const raw = parseCsv(text)
  const names = ['id', 'antal', ...known]
  const paired = (header: string) => names.find((name) => name !== header && name.toLowerCase() === header.toLowerCase()) ?? header
  const parsed = { headers: raw.headers.map(paired), rows: raw.rows.map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [paired(k), v]))) }
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

// A card with no count, or a count that is not one, is one copy: the import cannot ask, and one is
// what a card with no `antal` is everywhere else. The rule for what is one is the cell's (#479).
function count(value: string | undefined): number {
  return copiesOf(value ?? '') ?? 1
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

// The separator the header line uses most, outside quotes; a comma when it uses none.
function separatorOf(text: string): string {
  const head = text.split(/\r?\n/, 1)[0] ?? ''
  const unquoted = head.replace(/"[^"]*"/g, '')
  const counts = ['\t', ';', ','].map((sep) => ({ sep, n: unquoted.split(sep).length - 1 }))
  const best = counts.reduce((a, b) => (b.n > a.n ? b : a))
  return best.n > 0 ? best.sep : ','
}
