import { useEffect, useRef, useState } from 'react'
import type { ProjectDoc, ProjectRow } from './types.js'
import { deckKeepsFields, fieldsOf, fieldLabel, takenNames } from './fields.js'
import { ANTAL, drawnBy } from '@byd/server/doc'
import { NewField } from './NewField.js'
import { ASSET_DRAG_TYPE, assetRef, assetUrl, assetsInUse, imageFieldsOf, isAssetRef, ASSET_PREFIX } from './assets.js'
import { searchSymbols, symbolName, symbolPreview, type GameSymbol } from './symbols.js'
import { diffProjects, type RowChange } from '@byd/server/doc'
import { Summary } from './HistoryPanel.js'
import type { Cell } from './ProjectClient.js'
import { exportCardsCsv, importCardsCsv } from './csv.js'
import { keepOrder, nextSort, sortRows, type SortState } from './sorting.js'
import { countLabel, discreteColumns, filterRows, isFiltering, noFilter, toggleValue, type FilterState } from './filtering.js'
import { duplicateRows, keepRows, markRows, noSelection, removeRows, selectionLabel, setColumn, toggleRow, type Selection } from './selection.js'
import { groupColumn, groupOfRow, ruleLabel } from './groups.js'
import { Question } from './Question.js'
import { useT, type T } from '../i18n/index.js'

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
  // A column of the deck (#32): made in the head where it will stand, taken away by the × on its
  // own heading. Each is one edit, so each is one version and one step back (B4).
  onAddField(field: string): void
  onRemoveField(field: string): void
  // The project's images (E1): where they are served from, and how a chosen file becomes one.
  // Without both, image fields are edited as text.
  assetBase?: string | undefined
  onUpload?: ((file: File) => Promise<string>) | undefined
  // Taking a symbol into the game from where it is written (E4): returns the name it got in the
  // project's icon set. Without it, a brace in a cell is just a brace.
  onSymbol?: ((symbol: GameSymbol) => Promise<string>) | undefined
  // An older version to hold the table against (B4): what moved is shown in the cells, and the
  // cards that came or went are shown as rows.
  compareWith?: { rev: number; label?: string | undefined; doc: ProjectDoc } | undefined
  onStopCompare?: (() => void) | undefined
}

// The table (B as a tab): one row per card, the template's fields as columns, `antal` last (L4).
// This is where the designer already lives; a change here reaches every copy of the card.
export function DataTable({ doc, selectedRow, onSelectRow, onCell, onAddRow, onRemoveRow, onReplaceRows, onAddField, onRemoveField, assetBase, onUpload, onSymbol, compareWith, onStopCompare }: DataTableProps) {
  const t = useT()
  const [importError, setImportError] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  // Which image cell a drag is over.
  const [over, setOver] = useState<string | null>(null)
  // The symbol picker (E4): which cell has an open brace before the cursor, what has been typed
  // since it, and which symbol is under the arrow keys.
  const [brace, setBrace] = useState<{ cardRef: string; field: string; at: number; query: string } | null>(null)
  const [choice, setChoice] = useState(0)
  const matches = brace ? searchSymbols(brace.query, null, t).slice(0, 8) : []
  const closeBrace = () => {
    setBrace(null)
    setChoice(0)
  }
  // What a cell shows now: the row's value, unless the picker is open on it, since the cell is
  // typed into before the project has the change.
  const typing = useRef<Record<string, string>>({})
  const openBrace = (cardRef: string, field: string, el: HTMLInputElement) => {
    const upto = el.value.slice(0, el.selectionStart ?? el.value.length)
    const at = upto.lastIndexOf('{')
    const word = at >= 0 ? upto.slice(at + 1) : ''
    // A closed brace is written, and a bare number in braces is a pip (L2): neither is a lookup.
    if (at < 0 || word.includes('}') || /^\d+$/.test(word)) return closeBrace()
    setBrace({ cardRef, field, at, query: word })
    setChoice(0)
  }
  const takeSymbol = (symbol: GameSymbol) => {
    const open = brace
    if (!open || !onSymbol) return
    const key = `${open.cardRef}:${open.field}`
    const current = typing.current[key] ?? String(doc.rows.find((r) => r.id === open.cardRef)?.fields[open.field] ?? '')
    closeBrace()
    void onSymbol(symbol).then((name) => onCell(open.cardRef, open.field, `${current.slice(0, open.at)}{${name}}${current.slice(open.at + 1 + open.query.length)}`))
  }
  // What moved since the version being compared with (B4), and the cards that are no longer
  // there — shown after the deck, since they have no place in it any more.
  const diff = compareWith ? diffProjects(compareWith.doc, doc) : null
  const changeOf = (cardRef: string) => diff?.rows.find((r) => r.cardRef === cardRef)
  const goneRows: ProjectRow[] = compareWith && diff ? compareWith.doc.rows.filter((r) => diff.rows.some((c) => c.kind === 'removed' && c.cardRef === r.id)) : []
  const wasCell = (cardRef: string, field: string) => compareWith?.doc.rows.find((r) => r.id === cardRef)?.fields[field]
  const imageFields = assetBase && onUpload ? imageFieldsOf(doc) : []
  const images = assetsInUse(doc)
  const upload = async (cardRef: string, field: string, file: File | undefined) => {
    if (!file || !onUpload) return
    try {
      onCell(cardRef, field, assetRef(await onUpload(file)))
      setUploadError(null)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err))
    }
  }
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
  // A column's × goes with the column, so the head's own button — the one thing there that was
  // not there before — is where the focus lands when a column has been taken away (#32).
  const [refocus, setRefocus] = useState<'remove' | 'all' | 'addField' | { cardRef: string } | { field: string } | null>(null)
  // What the action row writes: a column of the table and the value to give it. An empty value
  // is not a change worth pressing by mistake, so the button waits for one.
  const [bulkField, setBulkField] = useState<string | null>(null)
  const [bulkValue, setBulkValue] = useState('')
  // Whether the head's last cell is showing the form that makes a column, and which column has
  // been asked about taking away (#32).
  const [adding, setAdding] = useState(false)
  const [dropping, setDropping] = useState<string | null>(null)
  const removeRef = useRef<HTMLButtonElement>(null)
  const allRef = useRef<HTMLInputElement>(null)
  // The × of every row on screen, so the question a row asks can hand the focus back to it.
  const rowRemoveRefs = useRef(new Map<string, HTMLButtonElement>())
  // The same for every column's ×, and for the button that makes one.
  const dropRefs = useRef(new Map<string, HTMLButtonElement>())
  const addRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!refocus) return
    if (typeof refocus === 'object') {
      if ('cardRef' in refocus) rowRemoveRefs.current.get(refocus.cardRef)?.focus()
      else dropRefs.current.get(refocus.field)?.focus()
    } else if (refocus === 'addField') addRef.current?.focus()
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
        onReplaceRows(importCardsCsv(String(reader.result ?? ''), t))
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
        <label>{t('table.import')}<input type="file" accept=".csv,text/csv,text/tab-separated-values" aria-label={t('table.import')} onChange={(event) => importFile(event.target.files?.[0])} /></label>
        <a href={csvHref} download={filename}>{t('table.export')}</a>
        <span>{t('table.import.note')}</span>
        {importError && <span role="alert">{importError}</span>}
      </div>
      {imageFields.length > 0 && assetBase && (
        // The deck's images (E1), once each: drag one onto a card's cell to use it again.
        <div className="byd-data-images">
          <span>{t('table.images')}</span>
          {images.length === 0 ? (
            <em>{t('table.images.none')}</em>
          ) : (
            <ul aria-label={t('table.images')}>
              {images.map(({ hash, cards }) => (
                <li key={hash} data-asset={hash}>
                  <img src={assetUrl(assetBase, hash)} alt={t('table.image.alt', { cards: cards.join(', ') })} draggable onDragStart={(e) => e.dataTransfer.setData(ASSET_DRAG_TYPE, hash)} />
                  <small>{t(cards.length === 1 ? 'wall.cards.one' : 'wall.cards.other', { n: cards.length })}</small>
                </li>
              ))}
            </ul>
          )}
          {uploadError && <span role="alert">{uploadError}</span>}
        </div>
      )}
      {compareWith && diff && (
        <p className="byd-data-compare" role="status">
          {t('table.compare', { rev: compareWith.rev })}
          {compareWith.label ? ` · ${compareWith.label}` : ''}: <Summary diff={diff} />{' '}
          {onStopCompare && (
            <button type="button" onClick={onStopCompare}>
              {t('table.compare.stop')}
            </button>
          )}
        </p>
      )}
      <div className="byd-data-filter">
        <input
          type="search"
          className="byd-data-search"
          aria-label={t('table.search')}
          placeholder={t('table.search.placeholder')}
          value={filter.query}
          onChange={(event) => changeFilter({ ...filter, query: event.target.value })}
        />
        {discrete.map(({ field, values }) => (
          <div key={field} className="byd-data-chips" role="group" aria-label={t('table.filterOn', { field })}>
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
          <span>{countLabel(shown.length, doc.rows.length, t)}</span>
          {chosen.length > 0 && (
            <>
              <span aria-hidden="true"> · </span>
              <span className="byd-data-chosen">{selectionLabel(chosen.length, t)}</span>
            </>
          )}
          {pinned !== null && (
            <>
              <span aria-hidden="true"> · </span>
              <span className="byd-data-pinned">{t('table.pinned')}</span>
            </>
          )}
        </p>
        {isFiltering(filter) && (
          <button type="button" className="byd-data-clear" onClick={() => changeFilter(noFilter)}>
            {t('table.filter.clear')}
          </button>
        )}
      </div>
      <p className="byd-data-sort" role="status">{sortLabel(sort, t)}</p>
      {chosen.length > 0 &&
        (confirming ? (
          <Question
            className="byd-data-bulk"
            label={removeLabel(chosen.length, t)}
            confirm={t('table.remove.yes')}
            cancel={t('editor.cancel')}
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
            {t(chosen.length === 1 ? 'table.remove.question.one' : 'table.remove.question.other', { n: chosen.length })}
          </Question>
        ) : (
          <div className="byd-data-bulk" role="toolbar" aria-label={t('table.bulk')}>
            <label>
              {t('table.bulk.field')}
              <select aria-label={t('table.column')} value={field} onChange={(event) => setBulkField(event.target.value)}>
                {fields.map((f) => (
                  <option key={f} value={f}>
                    {fieldLabel(f, t)}
                  </option>
                ))}
              </select>
            </label>
            <input
              type={field === 'antal' ? 'number' : 'text'}
              min={field === 'antal' ? 0 : undefined}
              aria-label={t('table.value')}
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
              {t('table.bulk.set', { field, n: chosen.length })}
            </button>
            <button type="button" onClick={() => onReplaceRows(duplicateRows(doc.rows, chosenIds))}>
              {t(chosen.length === 1 ? 'table.bulk.duplicate.one' : 'table.bulk.duplicate.other', { n: chosen.length })}
            </button>
            <button type="button" data-kind="danger" ref={removeRef} onClick={() => setConfirming(true)}>
              {removeLabel(chosen.length, t)}
            </button>
            <button type="button" data-kind="quiet" onClick={() => setSelected(noSelection)}>
              {t('table.bulk.unmark')}
            </button>
          </div>
        ))}
      {dropping !== null && (
        <Question
          className="byd-data-bulk"
          label={dropLabel(doc, dropping, t)}
          confirm={t('table.remove.yes')}
          cancel={t('editor.cancel')}
          onConfirm={() => {
            onRemoveField(dropping)
            setDropping(null)
            setRefocus('addField')
          }}
          onCancel={() => {
            const field = dropping
            setDropping(null)
            setRefocus({ field })
          }}
        >
          {dropLabel(doc, dropping, t)}
        </Question>
      )}
      {removing !== null && (
        <Question
          className="byd-data-bulk"
          label={t('table.remove.card', { cardRef: removing })}
          confirm={t('table.remove.yes')}
          cancel={t('editor.cancel')}
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
          {t('table.remove.card.question', { cardRef: removing })}
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
                aria-label={t('table.selectAllShown')}
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
            <SortableHeader field="id" label="id" sort={sort} onSort={setSort} />
            {fields.map((f) => (
              <SortableHeader
                key={f}
                field={f}
                label={fieldLabel(f, t)}
                sort={sort}
                onSort={setSort}
                t={t}
                onRemove={f === ANTAL ? undefined : () => setDropping(f)}
                removeRef={(el) => {
                  if (el) dropRefs.current.set(f, el)
                  else dropRefs.current.delete(f)
                }}
              />
            ))}
            {grouping && <th>{t('table.group')}</th>}
            {/* Variant A (#32): the head's last named cell is the button, because the column
                grows in the place it will stand. The form it opens lies *over* the row —
                absolutely positioned in a cell that is already `sticky`, so the head keeps its
                height and no heading moves while the designer types. */}
            <th className="byd-data-newfield">
              <button type="button" ref={addRef} aria-expanded={adding} onClick={() => setAdding(!adding)}>
                {t('table.field.add')}
              </button>
              {adding && (
                <NewField
                  taken={takenNames(doc)}
                  keeps={deckKeepsFields(doc)}
                  // Yes and no leave by the same door, so they hand the focus back to the same
                  // place: the button the form was opened from, which is still there and is
                  // ready to make the next column. Without it the pressed button unmounts under
                  // the designer's finger and the focus falls to `<body>`.
                  onCreate={(field) => {
                    onAddField(field)
                    setAdding(false)
                    setRefocus('addField')
                  }}
                  onCancel={() => {
                    setAdding(false)
                    setRefocus('addField')
                  }}
                />
              )}
            </th>
            <th className="byd-data-remove">
              <span className="byd-offscreen">{t('table.remove.column')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {[...shown, ...goneRows].map(({ id: cardRef, fields: row }) => (
            <tr key={cardRef} data-card-ref={cardRef} data-change={changeOf(cardRef)?.kind} aria-selected={selectedRow === cardRef ? 'true' : 'false'} onClick={() => onSelectRow(cardRef)}>
              {/* Two different meanings of "selected" meet in a row: the tick says the next bulk
                  change is about this card, the row itself says the card is the one being looked
                  at. A click on the checkbox is only ever the first of them. */}
              <td className="byd-data-check" onClick={(event) => event.stopPropagation()}>
                <label className="byd-data-tick">
                  <input
                    type="checkbox"
                    checked={selected.has(cardRef)}
                    onChange={() => setSelected(toggleRow(selected, cardRef))}
                    aria-label={t('table.mark', { cardRef })}
                  />
                </label>
              </td>
              <td className="byd-data-id">{cardRef}</td>
              {fields.map((f) =>
                imageFields.includes(f) && assetBase ? (
                  <td key={f} className="byd-data-image">
                    <div
                      className="byd-data-drop"
                      role="group"
                      aria-label={t('table.imageFor', { cardRef })}
                      data-image-cell={cardRef}
                      data-over={over === `${cardRef}:${f}` ? 'true' : undefined}
                      onDragOver={(e) => {
                        e.preventDefault()
                        setOver(`${cardRef}:${f}`)
                      }}
                      onDragLeave={() => setOver(null)}
                      onDrop={(e) => {
                        e.preventDefault()
                        setOver(null)
                        const hash = e.dataTransfer.getData(ASSET_DRAG_TYPE)
                        if (hash) onCell(cardRef, f, assetRef(hash))
                        else void upload(cardRef, f, e.dataTransfer.files?.[0])
                      }}
                    >
                      {isAssetRef(row[f]) ? <img src={assetUrl(assetBase, String(row[f]).slice(ASSET_PREFIX.length))} alt={`${cardRef} ${f}`} /> : <span>{t('table.image.drop')}</span>}
                      <label className="byd-data-file">
                        {isAssetRef(row[f]) ? t('table.image.replace') : t('table.image.choose')}
                        <input type="file" accept="image/*" aria-label={t('table.image.chooseFor', { cardRef })} onChange={(e) => void upload(cardRef, f, e.target.files?.[0])} />
                      </label>
                      {isAssetRef(row[f]) && (
                        <button type="button" aria-label={t('table.image.removeFor', { cardRef })} onClick={() => onCell(cardRef, f, '')}>
                          ×
                        </button>
                      )}
                    </div>
                  </td>
                ) : (
                <td key={f} className={brace?.cardRef === cardRef && brace.field === f ? 'byd-data-picking' : undefined}>
                  {moved(changeOf(cardRef), f) && <s className="byd-data-was">{String(wasCell(cardRef, f) ?? '')}</s>}
                  <input
                    type={f === 'antal' ? 'number' : 'text'}
                    min={f === 'antal' ? 0 : undefined}
                    value={row[f] === undefined || row[f] === null ? (f === 'antal' ? '1' : '') : String(row[f])}
                    onChange={(e) => {
                      typing.current[`${cardRef}:${f}`] = e.target.value
                      onCell(cardRef, f, f === 'antal' ? Number(e.target.value) : e.target.value)
                      if (onSymbol && f !== 'antal') openBrace(cardRef, f, e.target)
                    }}
                    onKeyDown={(e) => {
                      if (!brace || brace.cardRef !== cardRef || brace.field !== f || matches.length === 0) return
                      if (e.key === 'ArrowDown') {
                        e.preventDefault()
                        setChoice((c) => Math.min(matches.length - 1, c + 1))
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault()
                        setChoice((c) => Math.max(0, c - 1))
                      } else if (e.key === 'Enter') {
                        const picked = matches[choice]
                        if (!picked) return
                        e.preventDefault()
                        takeSymbol(picked)
                      } else if (e.key === 'Escape') closeBrace()
                    }}
                    onFocus={() => setHeld(shown.map((r) => r.id))}
                    onBlur={() => setHeld(null)}
                    aria-label={`${cardRef} ${f}`}
                  />
                  {brace?.cardRef === cardRef && brace.field === f && matches.length > 0 && (
                    // The library where the cursor stands (E4): the same set the Symboler tab
                    // fills, reached without leaving the sentence being written.
                    <div className="byd-data-symbols" role="listbox" aria-label={t('table.symbols')}>
                      {matches.map((sym, i) => (
                        <button
                          key={sym.id}
                          type="button"
                          role="option"
                          data-symbol={symbolName(sym, t)}
                          aria-selected={i === choice}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => takeSymbol(sym)}
                        >
                          <img src={symbolPreview(sym)} alt="" />
                          <span>{symbolName(sym, t)}</span>
                          <small>{t(sym.category)}</small>
                        </button>
                      ))}
                    </div>
                  )}
                </td>
                ),
              )}
              {grouping && <GroupCell doc={doc} column={grouping} cardRef={cardRef} row={row} />}
              {/* The button that makes a column stands in a column of its own, so every row has
                  that column too — empty, because nothing about a card belongs under it. A row
                  one cell short of the head is still a legal table and the browser lays it out
                  without complaint: what the designer sees is the pinned × under the wrong
                  heading, at the wrong width, with a phantom column after it. */}
              <td className="byd-data-newfield" />
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
                  aria-label={t('table.removeRow', { cardRef })}
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
      {shown.length === 0 && isFiltering(filter) && <p className="byd-data-empty">{t('table.empty')}</p>}
      <button type="button" className="byd-data-add" onClick={() => {
          const cardRef = nextRef()
          onAddRow(cardRef)
          setPinned(isFiltering(filter) ? cardRef : null)
        }}>
        {t('table.addCard')}
      </button>
    </div>
  )
}

// Which group a row falls into (#13). A card whose column is empty takes the base look (L3), and
// the cell says exactly that rather than leaving the eye to guess at a blank.
function GroupCell({ doc, column, cardRef, row }: { doc: ProjectDoc; column: string; cardRef: string; row: ProjectRow['fields'] }) {
  const t = useT()
  const group = groupOfRow(doc, { id: cardRef, fields: row })
  return (
    <td className="byd-data-group" data-group-of={cardRef}>
      {group === null ? t('table.group.base') : ruleLabel(column, group)}
    </td>
  )
}

// One header per column (variant A): a real button, so the tab order and Enter/Space come for
// free, and `aria-sort` on the `th` for the state. The arrow is the same fact for the eye.
function SortableHeader({ field, label, sort, onSort, onRemove, removeRef, t }: { field: string; label: string; sort: SortState | null; onSort(next: SortState | null): void; onRemove?: (() => void) | undefined; removeRef?: ((el: HTMLButtonElement | null) => void) | undefined; t?: T | undefined }) {
  const active = sort?.field === field ? sort.dir : null
  return (
    <th aria-sort={active ?? 'none'}>
      <button type="button" data-active={active !== null} onClick={() => onSort(nextSort(sort, field))}>
        {label} <span aria-hidden="true">{active === 'ascending' ? '↑' : active === 'descending' ? '↓' : '↕'}</span>
      </button>
      {/* A column the designer made is a column she can take away again (#32). The two columns
          that are not hers — the card's id, and `antal`, which is the engine's (L4) — are given
          no ×, so the head says which are hers by which can be undone. */}
      {onRemove && t && (
        <button type="button" ref={removeRef} className="byd-data-dropfield" aria-label={t('table.field.remove', { field })} onClick={onRemove}>
          ×
        </button>
      )}
    </th>
  )
}

// What a column takes with it, in the two things it can take: the value on the cards that hold
// one — a column nobody has written in loses nothing, and the question says so rather than
// counting to zero — and the elements of the template that drew it, which have nothing left to
// draw once it is gone. The second sentence is only there when there is something to say.
function dropLabel(doc: ProjectDoc, field: string, t: T): string {
  const held = doc.rows.filter((row) => row.fields[field] !== undefined && row.fields[field] !== '').length
  const values = held === 0 ? t('table.field.remove.none', { field }) : t(held === 1 ? 'table.field.remove.one' : 'table.field.remove.other', { field, n: held })
  const drawn = drawnBy(doc, field)
  if (drawn === 0) return values
  return `${values} ${t(drawn === 1 ? 'table.field.drawn.one' : 'table.field.drawn.other', { n: drawn })}`
}

// What a delete is about, in cards. The same words name the button and the question it opens, so
// pressing one and reading the other is the same sentence twice.
function removeLabel(count: number, t: T): string {
  return t(count === 1 ? 'table.bulk.remove.one' : 'table.bulk.remove.other', { n: count })
}

function sortLabel(sort: SortState | null, t: T): string {
  if (!sort) return t('table.sort.none')
  return t(sort.dir === 'ascending' ? 'table.sort.ascending' : 'table.sort.descending', { field: sort.field })
}

// A field that moved between the two versions being held against each other (B4).
const moved = (change: RowChange | undefined, field: string): boolean => change?.kind === 'changed' && change.fields.some((f) => f.field === field)
