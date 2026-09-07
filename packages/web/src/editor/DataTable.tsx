import { useEffect, useRef, useState } from 'react'
import type { ProjectDoc, ProjectRow } from './types.js'
import { fieldsOf } from './fields.js'
import type { Cell } from './ProjectClient.js'
import { exportCardsCsv, importCardsCsv } from './csv.js'
import { keepOrder, nextSort, sortRows, type SortState } from './sorting.js'
import { countLabel, discreteColumns, filterRows, isFiltering, noFilter, toggleValue, type FilterState } from './filtering.js'
import { duplicateRows, keepRows, markRows, noSelection, removeRows, selectionLabel, setColumn, toggleRow, type Selection } from './selection.js'
import { groupColumn, groupOfRow, ruleLabel } from './groups.js'
import { Question } from './Question.js'

export type DataTableProps = {
  doc: ProjectDoc
  selectedRow: string | null
  onSelectRow(cardRef: string): void
  onCell(cardRef: string, field: string, value: Cell): void
  onAddRow(cardRef: string): void
  onRemoveRow(cardRef: string): void
  // The whole list of rows at once: a CSV import, and every change the selection makes (#17).
  // One call is one change to the project, so a bulk edit is saved and undone as one.
  onReplaceRows(rows: ProjectRow[]): void
}

// The table (B as a tab): one row per card, the template's fields as columns, `antal` last (L4).
// This is where the designer already lives; a change here reaches every copy of the card.
export function DataTable({ doc, selectedRow, onSelectRow, onCell, onAddRow, onRemoveRow, onReplaceRows }: DataTableProps) {
  const [importError, setImportError] = useState<string | null>(null)
  const [sort, setSort] = useState<SortState | null>(null)
  const [filter, setFilter] = useState<FilterState>(noFilter)
  const [selected, setSelected] = useState<Selection>(noSelection)
  // Deleting cards is the one action that cannot be looked at afterwards, so it is asked about
  // first — and the question says how many cards it is about.
  const [confirming, setConfirming] = useState(false)
  // The card a single row's × is asking about (#8). The little button at the end of a row used to
  // take a card out of the deck on the way past it; it asks the same question the action row
  // asks, and names the card, because one card is not "1 kort" to the person who drew it.
  const [removing, setRemoving] = useState<string | null>(null)
  // A question that takes the focus has to give it back: to the button that asked it, or — when
  // the cards it was about are gone with it — to the header's own checkbox above the rows.
  const [refocus, setRefocus] = useState<'remove' | 'all' | { cardRef: string } | null>(null)
  // What the action row writes: a column of the table and the value to give it. An empty value
  // is not a change worth pressing by mistake, so the button waits for one.
  const [bulkField, setBulkField] = useState<string | null>(null)
  const [bulkValue, setBulkValue] = useState('')
  const removeRef = useRef<HTMLButtonElement>(null)
  const allRef = useRef<HTMLInputElement>(null)
  // The × of every row on screen, so the question a row asks can hand the focus back to it.
  const rowRemoveRefs = useRef(new Map<string, HTMLButtonElement>())
  useEffect(() => {
    if (!refocus) return
    if (typeof refocus === 'object') rowRemoveRefs.current.get(refocus.cardRef)?.focus()
    else (refocus === 'remove' ? removeRef.current : allRef.current)?.focus()
    setRefocus(null)
  }, [refocus])
  // The card created by "Nytt kort" while a filter is on, kept on screen until the filter moves.
  const [pinned, setPinned] = useState<string | null>(null)
  // The order held while a cell is being edited, as the ids that were on screen when it was entered.
  const [held, setHeld] = useState<string[] | null>(null)
  const fields = fieldsOf(doc)
  // Which group a row falls into (#13, from variant C): read here, decided on the canvas. A deck
  // that is not grouped says nothing at all, rather than a column of the same word on every row.
  const grouping = groupColumn(doc)
  // What the table shows is a view of the project, never its order: the sort (#15) and the filter
  // (#16) decide the rows on screen and leave `doc.rows` alone. This one line is the whole view,
  // and it is the seam the selection (#17) slots into — "markera alla synliga" means `shown`.
  // While a cell is being typed in, the screen is frozen to the rows that were on it: neither the
  // order nor the filter may move or take away the row under the cursor before it is left.
  const columns = ['id', ...fields]
  const discrete = discreteColumns(doc.rows, columns)
  const shown = held
    ? keepOrder(doc.rows.filter((row) => held.includes(row.id)), held)
    : filterRows(sortRows(doc.rows, sort), columns, filter, pinned)
  // What an action is about is never more than what is on screen: a checkbox is a fact about a
  // row the designer can see, so the selection is read through `shown` (#17 on #16).
  const chosen = shown.filter((row) => selected.has(row.id))
  const chosenIds: Selection = new Set(chosen.map((row) => row.id))
  // The column the action row writes: the designer's choice, or the table's first column until
  // one is made.
  const field = bulkField ?? fields[0] ?? 'antal'
  // A question about cards that are no longer marked is not a question any more: unmarking them,
  // or filtering them away, takes it back. The same holds for the question one row asks (#8): a
  // filter that takes the card off the screen takes its question with it.
  useEffect(() => {
    if (chosen.length === 0) setConfirming(false)
  }, [chosen.length])
  const onScreen = removing !== null && shown.some((r) => r.id === removing)
  useEffect(() => {
    if (!onScreen) setRemoving(null)
  }, [onScreen])
  // Every way of changing the filter goes through here, so the pinned card is released exactly
  // when the designer asks a new question of the deck.
  const changeFilter = (next: FilterState) => {
    setFilter(next)
    setPinned(null)
    // The selection is measured against the screen (#17): what the new question takes away is let
    // go of, and stays let go of when the question is taken back.
    setSelected(keepRows(selected, filterRows(doc.rows, columns, next).map((row) => row.id)))
  }
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
        onReplaceRows(importCardsCsv(String(reader.result ?? '')))
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
      <div className="byd-data-filter">
        <input
          type="search"
          className="byd-data-search"
          aria-label="Sök i alla fält"
          placeholder="Sök i alla fält…"
          value={filter.query}
          onChange={(event) => changeFilter({ ...filter, query: event.target.value })}
        />
        {discrete.map(({ field, values }) => (
          <div key={field} className="byd-data-chips" role="group" aria-label={`Filtrera på ${field}`}>
            {values.map((value) => (
              <button
                key={value}
                type="button"
                className="byd-data-chip"
                aria-pressed={(filter.values[field] ?? []).includes(value)}
                onClick={() => changeFilter(toggleValue(filter, field, value))}
              >
                {value}
              </button>
            ))}
          </div>
        ))}
        <p className="byd-data-count" aria-live="polite">
          <span>{countLabel(shown.length, doc.rows.length)}</span>
          {chosen.length > 0 && (
            <>
              <span aria-hidden="true"> · </span>
              <span className="byd-data-chosen">{selectionLabel(chosen.length)}</span>
            </>
          )}
          {pinned !== null && (
            <>
              <span aria-hidden="true"> · </span>
              <span className="byd-data-pinned">nytt kort visas trots filtret</span>
            </>
          )}
        </p>
        {isFiltering(filter) && (
          <button type="button" className="byd-data-clear" onClick={() => changeFilter(noFilter)}>
            Rensa filter
          </button>
        )}
      </div>
      <p className="byd-data-sort" role="status">{sortLabel(sort)}</p>
      {chosen.length > 0 &&
        (confirming ? (
          <Question
            className="byd-data-bulk"
            label={removeLabel(chosen.length)}
            confirm="Ja, ta bort"
            onConfirm={() => {
              onReplaceRows(removeRows(doc.rows, chosenIds))
              setSelected(noSelection)
              setConfirming(false)
              setRefocus('all')
            }}
            onCancel={() => {
              setConfirming(false)
              setRefocus('remove')
            }}
          >
            {removeLabel(chosen.length)} ur leken?
          </Question>
        ) : (
          <div className="byd-data-bulk" role="toolbar" aria-label="Markerade kort">
            <label>
              Sätt
              <select aria-label="Kolumn" value={field} onChange={(event) => setBulkField(event.target.value)}>
                {fields.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </label>
            <input
              type={field === 'antal' ? 'number' : 'text'}
              min={field === 'antal' ? 0 : undefined}
              aria-label="Värde"
              value={bulkValue}
              onChange={(event) => setBulkValue(event.target.value)}
            />
            <button
              type="button"
              disabled={bulkValue === ''}
              onClick={() => {
                onReplaceRows(setColumn(doc.rows, chosenIds, field, field === 'antal' ? Number(bulkValue) : bulkValue))
                setBulkValue('')
              }}
            >
              Sätt {field} på {chosen.length} kort
            </button>
            <button type="button" onClick={() => onReplaceRows(duplicateRows(doc.rows, chosenIds))}>
              Duplicera {chosen.length} kort
            </button>
            <button type="button" data-kind="danger" ref={removeRef} onClick={() => setConfirming(true)}>
              {removeLabel(chosen.length)}
            </button>
            <button type="button" data-kind="quiet" onClick={() => setSelected(noSelection)}>
              Avmarkera alla
            </button>
          </div>
        ))}
      {removing !== null && (
        <Question
          className="byd-data-bulk"
          label={cardLabel(removing)}
          confirm="Ja, ta bort"
          onConfirm={() => {
            onRemoveRow(removing)
            setRemoving(null)
            setRefocus('all')
          }}
          onCancel={() => {
            setRemoving(null)
            setRefocus({ cardRef: removing })
          }}
        >
          {cardLabel(removing)} ur leken?
        </Question>
      )}
      {/* A wide table on a narrow screen has one honest answer: the table scrolls inside its own
          box, the page never scrolls sideways, and the column that removes a card is pinned to
          the right edge so it cannot be scrolled away — it is the thing that would be lost
          first. */}
      <div className="byd-data-scroll">
      <table className="byd-data">
        <thead>
          <tr>
            <th className="byd-data-check">
              <label className="byd-data-tick">
              <input
                type="checkbox"
                aria-label="Markera alla synliga"
                checked={chosen.length > 0 && chosen.length === shown.length}
                ref={(el) => {
                  allRef.current = el
                  // Some of the rows on screen, but not all: the header says so as a third state.
                  if (el) el.indeterminate = chosen.length > 0 && chosen.length < shown.length
                }}
                onChange={(event) => setSelected(markRows(selected, shown.map((row) => row.id), event.target.checked))}
              />
              </label>
            </th>
            <SortableHeader field="id" sort={sort} onSort={setSort} />
            {fields.map((f) => (
              <SortableHeader key={f} field={f} sort={sort} onSort={setSort} />
            ))}
            {grouping && <th>grupp</th>}
            <th className="byd-data-remove">
              <span className="byd-offscreen">Ta bort</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {shown.map(({ id: cardRef, fields: row }) => (
            <tr key={cardRef} data-card-ref={cardRef} aria-selected={selectedRow === cardRef ? 'true' : 'false'} onClick={() => onSelectRow(cardRef)}>
              {/* Two different meanings of "selected" meet in a row: the tick says the next bulk
                  change is about this card, the row itself says the card is the one being looked
                  at. A click on the checkbox is only ever the first of them. */}
              <td className="byd-data-check" onClick={(event) => event.stopPropagation()}>
                <label className="byd-data-tick">
                  <input
                    type="checkbox"
                    checked={selected.has(cardRef)}
                    onChange={() => setSelected(toggleRow(selected, cardRef))}
                    aria-label={`markera ${cardRef}`}
                  />
                </label>
              </td>
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
              {grouping && <GroupCell doc={doc} column={grouping} cardRef={cardRef} row={row} />}
              <td className="byd-data-remove">
                <button
                  type="button"
                  ref={(el) => {
                    if (el) rowRemoveRefs.current.set(cardRef, el)
                    else rowRemoveRefs.current.delete(cardRef)
                  }}
                  onClick={(event) => {
                    // Asking about a card is not looking at it: the click stops here, so the
                    // canvas keeps showing whatever card was being worked on.
                    event.stopPropagation()
                    setRemoving(cardRef)
                  }}
                  aria-label={`ta bort ${cardRef}`}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      {/* A deck with no cards at all is not a filter's doing: then the button below is the answer. */}
      {shown.length === 0 && isFiltering(filter) && <p className="byd-data-empty">Inga kort matchar filtret.</p>}
      <button type="button" className="byd-data-add" onClick={() => {
          const cardRef = nextRef()
          onAddRow(cardRef)
          setPinned(isFiltering(filter) ? cardRef : null)
        }}>
        + Nytt kort
      </button>
    </div>
  )
}

// Which group a row falls into (#13). A card whose column is empty takes the base look (L3), and
// the cell says exactly that rather than leaving the eye to guess at a blank.
function GroupCell({ doc, column, cardRef, row }: { doc: ProjectDoc; column: string; cardRef: string; row: ProjectRow['fields'] }) {
  const group = groupOfRow(doc, { id: cardRef, fields: row })
  return (
    <td className="byd-data-group" data-group-of={cardRef}>
      {group === null ? 'Bas' : ruleLabel(column, group)}
    </td>
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

// What a delete is about, in cards. The same words name the button and the question it opens, so
// pressing one and reading the other is the same sentence twice.
function removeLabel(count: number): string {
  return `Ta bort ${count} kort`
}

// What a single row's × is about, in the words a designer knows her cards by (#8): the card
// itself, not a count of one.
function cardLabel(cardRef: string): string {
  return `Ta bort kortet ${cardRef}`
}

function sortLabel(sort: SortState | null): string {
  if (!sort) return 'Osorterad: kortens ordning i projektet.'
  return `Sorterad på ${sort.field}, ${sort.dir === 'ascending' ? 'stigande' : 'fallande'}.`
}
