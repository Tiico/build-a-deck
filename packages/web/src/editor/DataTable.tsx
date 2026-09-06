import type { ProjectDoc } from './types.js'
import { fieldsOf } from './fields.js'
import type { Cell } from './ProjectClient.js'

export type DataTableProps = {
  doc: ProjectDoc
  selectedRow: string | null
  onSelectRow(cardRef: string): void
  onCell(cardRef: string, field: string, value: Cell): void
  onAddRow(cardRef: string): void
  onRemoveRow(cardRef: string): void
}

// The table (B as a tab): one row per card, the template's fields as columns, `antal` last (L4).
// This is where the designer already lives; a change here reaches every copy of the card.
export function DataTable({ doc, selectedRow, onSelectRow, onCell, onAddRow, onRemoveRow }: DataTableProps) {
  const fields = fieldsOf(doc)
  const nextRef = () => {
    let n = Object.keys(doc.rows).length + 1
    while (doc.rows[`kort-${n}`]) n++
    return `kort-${n}`
  }
  return (
    <div className="byd-table-wrap">
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
          {Object.entries(doc.rows).map(([cardRef, row]) => (
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
