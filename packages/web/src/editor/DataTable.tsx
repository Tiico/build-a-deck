import { useState } from 'react'
import type { ProjectDoc, ProjectRow } from './types.js'
import { fieldsOf } from './fields.js'
import type { Cell } from './ProjectClient.js'
import { exportCardsCsv, importCardsCsv } from './csv.js'
import { keepOrder, nextSort, sortRows, type SortState } from './sorting.js'

export type DataTableProps = {
  doc: ProjectDoc
  selectedRow: string | null
  onSelectRow(cardRef: string): void
  onCell(cardRef: string, field: string, value: Cell): void
  onAddRow(cardRef: string): void
  onRemoveRow(cardRef: string): void
  onImportRows(rows: ProjectRow[]): void
}

// The table (B as a tab): one row per card, the template's fields as columns, `antal` last (L4).
// This is where the designer already lives; a change here reaches every copy of the card.
export function DataTable({ doc, selectedRow, onSelectRow, onCell, onAddRow, onRemoveRow, onImportRows }: DataTableProps) {
  const [importError, setImportError] = useState<string | null>(null)
  const [sort, setSort] = useState<SortState | null>(null)
  // The order held while a cell is being edited, as the ids that were on screen when it was entered.
  const [held, setHeld] = useState<string[] | null>(null)
  const fields = fieldsOf(doc)
  // What the table shows is a view of the project, never its order: sorting here, and later the
  // filter (#16) and the selection (#17), decide the rows on screen and leave `doc.rows` alone.
  const shown = held ? keepOrder(doc.rows, held) : sortRows(doc.rows, sort)
  const nextRef = () => {
    let n = doc.rows.length + 1
    while (doc.rows.some((r) => r.id === `kort-${n}`)) n++
    return `kort-${n}`
  }
  const importFile = (file: File | undefined) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        onImportRows(importCardsCsv(String(reader.result ?? '')))
        setImportError(null)
      } catch (err) {
        setImportError(err instanceof Error ? err.message : String(err))
      }
    }
    reader.readAsText(file)
  }
  const filename = `${doc.name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'spel'}-kort.csv`
  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent('\uFEFF' + exportCardsCsv(doc))}`
  return (
    <div className="byd-table-wrap">
      <div className="byd-data-tools">
        <label>Importera CSV<input type="file" accept=".csv,text/csv,text/tab-separated-values" aria-label="Importera CSV" onChange={(event) => importFile(event.target.files?.[0])} /></label>
        <a href={csvHref} download={filename}>Exportera CSV</a>
        <span>Import ersätter korten i tabellen. Spara när resultatet ser rätt ut.</span>
        {importError && <span role="alert">{importError}</span>}
      </div>
      <p className="byd-data-sort" role="status">{sortLabel(sort)}</p>
      <table className="byd-data">
        <thead>
          <tr>
            <SortableHeader field="id" sort={sort} onSort={setSort} />
            {fields.map((f) => (
              <SortableHeader key={f} field={f} sort={sort} onSort={setSort} />
            ))}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {shown.map(({ id: cardRef, fields: row }) => (
            <tr key={cardRef} data-card-ref={cardRef} aria-selected={selectedRow === cardRef ? 'true' : 'false'} onClick={() => onSelectRow(cardRef)}>
              <td className="byd-data-id">{cardRef}</td>
              {fields.map((f) => (
                <td key={f}>
                  <input
                    type={f === 'antal' ? 'number' : 'text'}
                    min={f === 'antal' ? 0 : undefined}
                    value={row[f] === undefined || row[f] === null ? (f === 'antal' ? '1' : '') : String(row[f])}
                    onChange={(e) => onCell(cardRef, f, f === 'antal' ? Number(e.target.value) : e.target.value)}
                    onFocus={() => setHeld(shown.map((r) => r.id))}
                    onBlur={() => setHeld(null)}
                    aria-label={`${cardRef} ${f}`}
                  />
                </td>
              ))}
              <td>
                <button type="button" onClick={() => onRemoveRow(cardRef)} aria-label={`ta bort ${cardRef}`}>
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="byd-data-add" onClick={() => onAddRow(nextRef())}>
        + Nytt kort
      </button>
    </div>
  )
}

// One header per column (variant A): a real button, so the tab order and Enter/Space come for
// free, and `aria-sort` on the `th` for the state. The arrow is the same fact for the eye.
function SortableHeader({ field, sort, onSort }: { field: string; sort: SortState | null; onSort(next: SortState | null): void }) {
  const active = sort?.field === field ? sort.dir : null
  return (
    <th aria-sort={active ?? 'none'}>
      <button type="button" data-active={active !== null} onClick={() => onSort(nextSort(sort, field))}>
        {field} <span aria-hidden="true">{active === 'ascending' ? '↑' : active === 'descending' ? '↓' : '↕'}</span>
      </button>
    </th>
  )
}

function sortLabel(sort: SortState | null): string {
  if (!sort) return 'Osorterad: kortens ordning i projektet.'
  return `Sorterad på ${sort.field}, ${sort.dir === 'ascending' ? 'stigande' : 'fallande'}.`
}
