import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ProjectDoc, ProjectRow } from './types.js'
import { deckKeepsFields, fieldsOf, fieldLabel, takenNames } from './fields.js'
import { ANTAL, drawnBy } from '@byd/server/doc'
import { NewField } from './NewField.js'
import { ASSET_DRAG_TYPE, assetRef, assetUrl, assetsInUse, iconFieldsOf, imageFieldsOf, isAssetRef, ASSET_PREFIX } from './assets.js'
import { searchSymbols, type GameSymbol } from './symbols.js'
import { SymbolList, symbolListKey, symbolOptionId } from './SymbolList.js'
import { diffProjects, type RowChange } from '@byd/server/doc'
import { Summary } from './HistoryPanel.js'
import type { Cell } from './ProjectClient.js'
import { exportCardsCsv, importCardsCsv } from './csv.js'
import { keepOrder, nextSort, sortRows, type SortState } from './sorting.js'
import { deckValues, fitColumns, markValues, widthKind, GROUP_COL } from './columns.js'
import { countLabel, discreteColumns, filterRows, isFiltering, noFilter, toggleValue, type FilterState } from './filtering.js'
import { duplicateRows, keepRows, markRows, noSelection, removeRows, selectionLabel, setColumn, toggleRow, type Selection } from './selection.js'
import { groupColumn, groupOfRow, ruleLabel } from './groups.js'
import { Question } from './Question.js'
import { useT, type T } from '../i18n/index.js'

export type DataTableProps = {
  doc: ProjectDoc
  selectedRow: string | null
  onSelectRow(cardRef: string): void
  // `gesture` is the visit to the cell this value was written during (#35). The table writes one
  // value per keystroke; a word typed into a cell is one thing the designer did, and the token is
  // what puts all those keystrokes on a single step back.
  onCell(cardRef: string, field: string, value: Cell, gesture?: string): void
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

// The game's own name, folded down to something a file system will carry — and folding is all
// that happens to it. Every letter and digit survives in whatever script it was written in,
// because the content language is unbounded (A4) and a name is the designer's: a game called
// 森の王 leaves under its own name, not under the tool's word for a game it could not spell. A
// `download` attribute is UTF-8 and has been carried by every file system this reaches for
// twenty years. What goes is only what a path could be built out of — separators, dots, spaces,
// everything that is neither letter nor digit — so nothing a designer types reaches out of the
// directory the reader saves into.
// A file name is 255 bytes on APFS and on ext4, and bytes are not letters: a name in a script
// that spends three of them a letter runs out in eighty-five. The game's name is cut to fit,
// between letters and never through one, and what the tool adds about the file always has room.
const NAME_BYTES = 200
export function fileSafe(name: string) {
  const folded = name.toLowerCase().normalize('NFC').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '')
  const written = new TextEncoder().encode(folded)
  if (written.length <= NAME_BYTES) return folded
  // Cutting the bytes can cut a letter in half; the decoder marks the half it could not read and
  // the mark comes off with the hyphen a cut can leave hanging.
  return new TextDecoder().decode(written.slice(0, NAME_BYTES)).replace(/\uFFFD+$/, '').replace(/-+$/, '')
}

// Only one cell is ever being typed into, so the library at the brace is one list with one name.
const CELL_SYMBOLS = 'byd-cell-symbols'

// The column that removes a card is pinned to the right edge of the scrolling box (#17), and what
// scrolls under it is covered. No stylesheet can help: the content and the pin share one clipping
// rectangle, and the only way out — a pin outside the scroller — costs the sticky heading, which
// is not for sale (#53). Nothing is lost for good, since every column clears the pin at the end of
// the scroll; what was wrong is that nothing said a value was still going. So the box says it, and
// the stylesheet draws the saying.
//
// Whether it is happening is geometry and nothing else: a cell is under the pin when its box and
// the pin's box overlap. The half-pixel is the edge case — at the end of the scroll the last
// column ends exactly where the pin begins, and touching is not covering.
//
// Deliberately one self-contained function with no imports: the browser test runs this very
// function inside the page, so what is measured there is what ships.
export function markCut(box: Element): void {
  const pin = box.querySelector('thead .byd-data-remove')
  if (!pin) return
  const over = pin.getBoundingClientRect()
  let cut = false
  for (const cell of box.querySelectorAll('thead > tr > *')) {
    if (cell === pin) continue
    const seen = cell.getBoundingClientRect()
    if (seen.right > over.left + 0.5 && seen.left < over.right - 0.5) cut = true
  }
  box.setAttribute('data-cut', cut ? 'true' : 'false')
}

// The table (B as a tab): one row per card, the template's fields as columns, `antal` last (L4).
// This is where the designer already lives; a change here reaches every copy of the card.
export function DataTable({ doc, selectedRow, onSelectRow, onCell, onAddRow, onRemoveRow, onReplaceRows, onAddField, onRemoveField, assetBase, onUpload, onSymbol, compareWith, onStopCompare }: DataTableProps) {
  const t = useT()
  // What the import warns about is bound to the import control by this, so the warning is read
  // with it and not merely next to it (#36).
  const noteId = useId()
  const [importError, setImportError] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  // Which image cell a drag is over.
  const [over, setOver] = useState<string | null>(null)
  // The symbol picker (E4): which cell has an open brace before the cursor, what has been typed
  // since it, and which symbol is under the arrow keys.
  const [brace, setBrace] = useState<{ cardRef: string; field: string; at: number; query: string } | null>(null)
  const [choice, setChoice] = useState(0)
  const matches = brace ? searchSymbols(brace.query, null, t).slice(0, 8) : []
  // The one the keys are on, which is what Enter takes and what the cell points at.
  const active = matches[choice]
  const closeBrace = () => {
    setBrace(null)
    setChoice(0)
  }
  // What a cell shows now: the row's value, unless the picker is open on it, since the cell is
  // typed into before the project has the change.
  const typing = useRef<Record<string, string>>({})
  // Which cell the designer is standing in, so the way to an icon is offered there and nowhere
  // else (#33). Which cell it is belongs to React, not to the stylesheet: a handle hidden by CSS
  // is still a stop in the tab order, and there would be one per cell.
  const [here, setHere] = useState<{ cardRef: string; field: string } | null>(null)
  // Which visit to a cell is the current one: it goes up whenever a cell takes the focus, so
  // everything typed without leaving is one step back and coming back to the same cell is the
  // next one. Only one cell holds the focus at a time, so one number is the whole of it.
  const visit = useRef(0)
  const cellGesture = () => `cell-${visit.current}`
  // Whether the designer is standing in a cell at all, which is what holds the column widths
  // still (#46). One boolean and not the cell itself: moving from one cell to the next is not a
  // moment to re-measure, it is the same edit going on.
  const editing = here !== null
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
    // In card text an icon is its name in braces (L2). In a cell a row of icons reads, it is the
    // bare name among others, because that element splits the cell on spaces and commas (#33).
    const bare = iconFieldsOf(doc).includes(open.field)
    void onSymbol(symbol).then((name) => {
      const before = current.slice(0, open.at)
      const after = current.slice(open.at + 1 + open.query.length)
      const written = bare ? `${before.replace(/\{$/, '')}${name}${after}`.trim() : `${before}{${name}}${after}`
      onCell(open.cardRef, open.field, written)
    })
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
  // The box that scrolls, so it can be asked whether a column has run in under the pin (#53).
  const scrollRef = useRef<HTMLDivElement>(null)
  // What the deck holds, by column, for the measurement below (#46). It is read off `doc.rows`
  // and never off `shown`, which is what keeps a width from moving when a filter or a sort does.
  // Held against the project rather than rebuilt every render: walking every value of every column
  // into a list is the same size as measuring them, and the table renders on every keystroke.
  const deck = useMemo(() => deckValues(doc, t), [doc, t])
  // The table's own reading of itself, in the one order the two halves of it can be true in: how
  // wide each column has to be to show what stands in it (#46), and then — at those widths —
  // whether a column has run in under the pinned × (#53).
  //
  // A layout effect and not an effect, because no frame may ever be painted at the width the
  // table would have had without the measurement.
  useLayoutEffect(() => {
    const box = scrollRef.current
    if (!box) return
    // The two questions are not the same size and must not be hung on the same events. Measuring
    // the deck walks every value of every column against a font — milliseconds for a deck of any
    // size — while asking whether a column has run in under the pin is eight rectangles. So the
    // measurement answers to the deck and to the room, and the pin answers to the frame rate.
    let frame = 0
    const pin = () => {
      frame = 0
      markCut(box)
    }
    const soon = () => {
      if (frame === 0) frame = requestAnimationFrame(pin)
    }
    // A new width, and then — at that width — which values did not fit and whether a column is
    // under the pin. In that order, because both of those are asked of the geometry the first one
    // just made.
    //
    // Unless a cell has the caret in it, and then the widths stand still. What is over is handed
    // out in proportion to what each column asked for, so a value that grows by a character takes
    // a pixel or two off every other sentence and moves every boundary to their right — including
    // the one the cell being typed in ends at, so the caret creeps away from under the hand that
    // is writing. The table already holds the row order still for exactly this reason; a width is
    // the same promise about the same moment, and it is kept the same way. The cut cue is not
    // held, because it is about this value in this cell and has to follow the typing.
    const fit = () => {
      if (!editing) fitColumns(box, deck)
      markValues(box)
      markCut(box)
    }
    fit()
    // A scroll moves the box and nothing else. No column can have changed width during one, and
    // the comment this replaced said as much while the code laid the whole table out again.
    box.addEventListener('scroll', soon, { passive: true })
    // A narrower window is the one thing besides the deck that really is a new width: there is
    // less to share out, so the sentences give some back. The table's own size is this very
    // function's output, so it answers the cheap question only — otherwise the measurement would
    // be feeding itself.
    const watch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit)
    watch?.observe(box)
    const pinned = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(soon)
    const table = box.querySelector('.byd-data')
    if (table) pinned?.observe(table)
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame)
      box.removeEventListener('scroll', soon)
      watch?.disconnect()
      pinned?.disconnect()
    }
    // A new deck is what a new width can come out of: an edit, an import, a column made or taken
    // away. Everything else the table keeps in its own state leaves the deck as it was — except
    // the caret arriving in a cell or leaving one, which is what decides whether the widths are
    // being held; leaving one is therefore also when they settle on what was written.
  }, [deck, editing])
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
  // What the file is called is the tool's word about the file, not the game's, so it follows the
  // reader (A4). The game's own name inside it is the game's: it is only folded into something a
  // file system will carry, never translated, and a name that leaves nothing behind falls back to
  // the tool's own stand-in — which is the tool's word too, and follows the reader with the rest.
  const filename = t('table.export.filename', { name: fileSafe(doc.name) || t('table.export.unnamed') })
  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent('\uFEFF' + exportCardsCsv(doc))}`
  return (
    <div className="byd-table-wrap">
      <div className="byd-data-tools">
        <label>{t('table.import')}<input type="file" accept=".csv,text/csv,text/tab-separated-values" aria-label={t('table.import')} aria-describedby={noteId} onChange={(event) => importFile(event.target.files?.[0])} /></label>
        {/* What an import costs is import's own warning (#36). It stands where it is read — after
            the control it warns about, before the one it says nothing about — and it is bound to
            that control besides, so a reader who never sees the two standing next to each other
            hears the warning as part of the thing that carries it. What the import refused is
            import's word too and keeps its own live region. */}
        <span id={noteId}>{t('table.import.note')}</span>
        {importError && <span role="alert">{importError}</span>}
        <a href={csvHref} download={filename}>{t('table.export')}</a>
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
                className="byd-data-chip byd-choice"
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
      <div className="byd-data-scroll" ref={scrollRef}>
      <table className="byd-data">
        {/* Where the measured width is said (#46). It is said to the table and not to the cells,
            because saying it to a cell is saying it to an `<input>` again — and an input's own
            width is its `size`, which is the whole reason the browser could never lay this table
            out for itself. What each column is worth sizing like travels with the column, so
            `fitColumns` needs to know nothing about what any of them is called. */}
        <colgroup>
          <col data-kind="tap" />
          <col data-col="id" data-kind="key" />
          {fields.map((f) => (
            <col key={f} data-col={f} data-kind={widthKind(doc, f)} />
          ))}
          {/* Which group a card falls into is the canvas's answer read back (#13), not prose the
              designer writes, so it takes the room its longest label needs and no share of the
              rest — and is therefore never cut, which is as well, since it is the one column of
              the table that is not an input to fade. */}
          {grouping && <col data-col={GROUP_COL} data-kind="key" />}
          <col data-kind="tap" />
        </colgroup>
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
            <SortableHeader field="id" label="id" sort={sort} onSort={setSort} t={t} />
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
            {grouping && <th data-col={GROUP_COL}>{t('table.group')}</th>}
            {/* The button that makes a column stands at the end of the head, where the column it
                makes will stand (#32) — but it no longer brings a column of its own to stand in.
                It had one, and every card's row met it with an empty cell: about 200 px of
                nothing between the last field and the ×, which is the third thing #46 is about.
                So it moves into the head of the column that is already there. That cell is
                `sticky` and therefore already a containing block, which is what the form it opens
                hangs from; the head keeps its height and no heading moves while the designer
                types. The word goes with the column — a `+` is all a tap-wide cell can hold — and
                the name it is heard by is the same word as before.
                The cell is named for what its own column does, so a screen reader still hears
                what the × under it is for rather than hearing the button above it twice. */}
            <th className="byd-data-remove" aria-label={t('table.remove.column')}>
              <button type="button" ref={addRef} aria-label={t('table.field.new')} aria-expanded={adding} onClick={() => setAdding(!adding)}>
                +
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
              <td className="byd-data-id" data-col="id">{cardRef}</td>
              {fields.map((f) =>
                imageFields.includes(f) && assetBase ? (
                  <td key={f} className="byd-data-image" data-col={f}>
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
                <td key={f} data-col={f} className={brace?.cardRef === cardRef && brace.field === f ? 'byd-data-picking' : undefined}>
                  {moved(changeOf(cardRef), f) && <s className="byd-data-was">{String(wasCell(cardRef, f) ?? '')}</s>}
                  {/* The brace, made visible in the cell the designer is standing in (#33). It
                      writes the brace and opens the same picker typing one does — one way in, seen
                      rather than known. Only in the cell being worked in: one handle per cell is a
                      wall of braces on screen, and a hundred stops in the tab order. */}
                  {onSymbol && f !== 'antal' && here?.cardRef === cardRef && here.field === f && (
                    <button
                      type="button"
                      className="byd-data-icon"
                      aria-label={t('table.icon.insert')}
                      title={t('table.icon.hint')}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={(event) => {
                        const input = event.currentTarget.parentElement?.querySelector('input')
                        if (!input) return
                        const at = input.selectionStart ?? input.value.length
                        const next = `${input.value.slice(0, at)}{${input.value.slice(at)}`
                        typing.current[`${cardRef}:${f}`] = next
                        onCell(cardRef, f, next, cellGesture())
                        input.value = next
                        input.focus()
                        input.setSelectionRange(at + 1, at + 1)
                        openBrace(cardRef, f, input)
                      }}
                    >
                      {'{ }'}
                    </button>
                  )}
                  <input
                    type={f === 'antal' ? 'number' : 'text'}
                    min={f === 'antal' ? 0 : undefined}
                    value={row[f] === undefined || row[f] === null ? (f === 'antal' ? '1' : '') : String(row[f])}
                    onChange={(e) => {
                      typing.current[`${cardRef}:${f}`] = e.target.value
                      onCell(cardRef, f, f === 'antal' ? Number(e.target.value) : e.target.value, cellGesture())
                      if (onSymbol && f !== 'antal') openBrace(cardRef, f, e.target)
                    }}
                    // The same keys the rail's library answers, because it is the same library
                    // (E4). They are heard here rather than in the list because the focus stays
                    // in the sentence being written — the rail hears them on the tool for the
                    // same reason, and both ask `symbolListKey` what the key meant.
                    onKeyDown={(e) => {
                      if (!brace || brace.cardRef !== cardRef || brace.field !== f) return
                      const act = symbolListKey(e.key, matches.length, choice)
                      if (!act) return
                      e.preventDefault()
                      if (act === 'close') return closeBrace()
                      if (act === 'pick') return void (active && takeSymbol(active))
                      setChoice(act.active)
                    }}
                    onFocus={() => {
                      visit.current += 1
                      setHeld(shown.map((r) => r.id))
                      setHere({ cardRef, field: f })
                    }}
                    onBlur={() => {
                      setHeld(null)
                      setHere((at) => (at?.cardRef === cardRef && at.field === f ? null : at))
                    }}
                    aria-label={`${cardRef} ${f}`}
                    {...(brace?.cardRef === cardRef && brace.field === f && active ? { 'aria-controls': CELL_SYMBOLS, 'aria-activedescendant': symbolOptionId(CELL_SYMBOLS, active) } : {})}
                  />
                  {brace?.cardRef === cardRef && brace.field === f && matches.length > 0 && (
                    // The library where the cursor stands (E4): the same set the Symboler tab
                    // fills and the rail's Ikon tool opens, reached without leaving the sentence
                    // being written — and the same component, so it cannot come to differ.
                    <SymbolList id={CELL_SYMBOLS} className="byd-data-symbols" symbols={matches} active={choice} label={t('table.symbols')} onPick={takeSymbol} />
                  )}
                </td>
                ),
              )}
              {grouping && <GroupCell doc={doc} column={grouping} cardRef={cardRef} row={row} />}
              {/* Every heading has a cell under it and every cell has a heading over it. A row
                  one short of the head is still a legal table and the browser lays it out without
                  complaint — what the designer sees is the pinned × under the wrong heading, at
                  the wrong width, with a phantom column after it (#32). */}
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
    <td className="byd-data-group" data-col={GROUP_COL} data-group-of={cardRef}>
      {group === null ? t('table.group.base') : ruleLabel(column, group)}
    </td>
  )
}

// One header per column (variant A): a real button, so the tab order and Enter/Space come for
// free, and `aria-sort` on the `th` for the state. The arrow is the same fact for the eye.
function SortableHeader({ field, label, sort, onSort, onRemove, removeRef, t }: { field: string; label: string; sort: SortState | null; onSort(next: SortState | null): void; onRemove?: (() => void) | undefined; removeRef?: ((el: HTMLButtonElement | null) => void) | undefined; t?: T | undefined }) {
  const active = sort?.field === field ? sort.dir : null
  return (
    <th data-col={field} aria-sort={active ?? 'none'}>
      <button type="button" data-active={active !== null} onClick={() => onSort(nextSort(sort, field))}>
        {label} <span aria-hidden="true">{active === 'ascending' ? '↑' : active === 'descending' ? '↓' : '↕'}</span>
      </button>
      {/* A column the designer made is a column she can take away again (#32). The two that are
          not hers — the card's id, and `antal`, which is how many copies of the card the deck
          holds (L4) — cannot be, and the head used to say so by leaving the × off. That is not
          saying it: the difference between "you may not" and "there is nothing here" was a hole,
          and a hole reads as an oversight. So a padlock stands where the other columns keep their
          ×, with the reason written beside it. A word instead of a glyph is not on offer — the
          shortest true one is 52 px and these are columns that have to be able to come out at 80
          — but the padlock is thirteen, and it is the one thing in the heading that is neither a
          control nor a name, so it is the one thing that is not hidden until the column is
          pointed at. */}
      {onRemove && t ? (
        <button type="button" ref={removeRef} className="byd-data-dropfield" aria-label={t('table.field.remove', { field })} onClick={onRemove}>
          ×
        </button>
      ) : (
        t && (
          <span className="byd-data-system" title={t('table.field.system', { field })}>
            <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false">
              <path d="M3.4 5V3.6a2.6 2.6 0 0 1 5.2 0V5" fill="none" stroke="currentColor" strokeWidth="1.2" />
              <rect x="2.2" y="5" width="7.6" height="5.6" rx="1.2" fill="currentColor" />
            </svg>
            <span className="byd-offscreen">{t('table.field.system', { field })}</span>
          </span>
        )
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
