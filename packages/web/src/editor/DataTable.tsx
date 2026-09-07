import { useState } from 'react'
import type { ProjectDoc, ProjectRow } from './types.js'
import { fieldsOf } from './fields.js'
import type { Cell } from './ProjectClient.js'
import { exportCardsCsv, importCardsCsv } from './csv.js'

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
  const fields = fieldsOf(doc)
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
      <table className="byd-data">
        <thead>
          <tr>
            <th>id</th>
            {fields.map((f) => (
              <th key={f}>{f}</th>
            ))}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {doc.rows.map(({ id: cardRef, fields: row }) => (
            <tr key={cardRef} data-card-ref={cardRef} aria-selected={selectedRow === cardRef ? 'true' : 'false'} onClick={() => onSelectRow(cardRef)}>
              <td className="byd-data-id">{cardRef}</td>
              {fields.map((f) => (
                <td key={f}>
                  <input
                    type={f === 'antal' ? 'number' : 'text'}
                    min={f === 'antal' ? 0 : undefined}
                    value={row[f] === undefined || row[f] === null ? (f === 'antal' ? '1' : '') : String(row[f])}
                    onChange={(e) => onCell(cardRef, f, f === 'antal' ? Number(e.target.value) : e.target.value)}
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
