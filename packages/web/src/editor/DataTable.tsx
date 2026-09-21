import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent, type FocusEvent, type KeyboardEvent } from 'react'
import type { ProjectDoc, ProjectRow } from './types.js'
import { deckKeepsFields, fieldsOf, fieldLabel, takenNames } from './fields.js'
import { ANTAL, drawnBy } from '@byd/server/doc'
import { ColumnDoor } from './ColumnDoor.js'
import { Crown, CrownBox, CrownDrawer, CrownFoot, CrownRail } from './Crown.js'
import { DragDoor } from './DragDoor.js'
import { ASSET_DRAG_TYPE, assetRef, assetUrl, assetsInUse, iconFieldsOf, imageFieldsOf, isAssetRef, mediaInGame, previewIcons, ASSET_PREFIX } from './assets.js'
import { boxesOf, proseChoiceOf, proseFieldsOf } from './body.js'
import { ProseMark, type ProseMarkProps } from './ProseMark.js'
import { BodyCell, type BodyCellProps } from './BodyCell.js'
import { DropSays, dropSurface, oneFile } from './dropping.js'
import { PictureLibraryDialog, type LibraryPicture } from './PictureLibrary.js'
import { searchSymbols, symbolName, type GameSymbol } from './symbols.js'
import { RoleList, roleOptionId, symbolListKey, symbolOptionId } from './SymbolList.js'
import { SymbolBox, meaningsOf } from './SymbolBox.js'
import { SymbolSample, SymbolSheet } from './SymbolSample.js'
import { groundOf } from './palette.js'
import { triggerBehind } from './picking.js'
import { diffProjects, type RowChange } from '@byd/server/doc'
import { Summary } from './HistoryPanel.js'
import type { Cell } from './ProjectClient.js'
import { exportCardsCsv, importCardsCsv } from './csv.js'
import { keepOrder, nextSort, sortRows, type SortState } from './sorting.js'
import { deckValues, dragScroll, fitColumns, markValues, widthKind, GROUP_COL } from './columns.js'
import { TAP_FLOOR, heldWidths, rememberWidths } from './widths.js'
import { countLabel, discreteColumns, filterRows, isFiltering, noFilter, toggleValue, type FilterState } from './filtering.js'
import { duplicateRows, keepRows, markRows, noSelection, removeRows, selectionLabel, setColumn, toggleRow, type Selection } from './selection.js'
import { useMarked } from './marked.js'
import { groupColumn, groupOfRow, ruleLabel } from './groups.js'
import { Question } from './Question.js'
import { useT, type T } from '../i18n/index.js'
import { useGesture } from './gesture.js'
import { useSay } from '../status/StatusLive.js'

export type DataTableProps = {
  doc: ProjectDoc
  // The game this table is of, when it was opened from one. It is what a width the designer set
  // herself is remembered under (#46): a width is a view and not the project (L4), so it lives in
  // her browser — but it is a view of *these* columns, and a column called `body` in one game says
  // nothing about a column called `body` in the next. A table with no project behind it still
  // pulls; it simply has nothing to file the answer under.
  project?: string | undefined
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
  // Where a column stands (#46). `before` is the column it comes to stand in front of, and null
  // is last of all — the two ways a drag along the head can end. It is an edit like the other
  // two, because the order is the document's and not this table's view of it.
  onMoveField(field: string, before: string | null): void
  // Vad kolumnen heter (#384). Namnet är nyckeln: `fieldLabel` ger tillbaka nyckeln oförändrad för
  // allt utom `antal`, så det finns ingen etikett vid sidan av nyckeln att byta i stället — och
  // priset är taget medvetet, CSV-rubriken byter namn med kolumnen. Utan den står namnen kvar i
  // dörren som ord: en tabell utan projekt bakom sig har ingenstans att skriva bytet.
  onRenameField?: ((from: string, to: string) => void) | undefined
  // Vad en kolumn är: prosa eller vanlig text (L43, #362). Rutans höjd i mallen föreslår, och
  // det här är designerns svar på förslaget — `null` när hon lämnar tillbaka frågan till höjden.
  // Utan den står märket kvar och säger vad kolumnen är, men det går inte att vända: en tabell
  // utan projekt bakom sig har ingenting att skriva valet i.
  onProse?: ((field: string, prose: boolean | null) => void) | undefined
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
const CELL_ROLES = 'byd-cell-roles'
const CELL_MEANINGS = 'byd-cell-meanings'

// What opens the library in a cell, and what says the writing is over rather than unfinished:
// a brace that has been closed is text the designer wrote and not a question she is asking (L2).
const BRACE = '{'
const BRACE_STOPS = ['}'] as const

// What a keystroke pulls a column by (#46). A drag is as fine as the hand that makes it; the keys
// are steps, and the step is a character or two of the font a cell is drawn in — small enough to
// land on a width, large enough that a column can be crossed without holding the key down.
const PULL_STEP = 16

// And how far the hand has to move before a press on the edge is a pull at all (#46). A pointer
// resting on a button slides a pixel or two as it is released, and the edge stands over the
// right-hand ten pixels of a heading — so without this a click aimed at the heading, or a hand
// that let go carelessly, set the column to the width it already had and left it there. Three
// pixels is a slip; a pull is what anybody would call a drag.
const PULL_SLOP = 3

// What the import takes, written once and answered the same way for both ways in (#292). The
// picker hands `accept` to the file dialog; a drop never goes near it, so the same question has
// to be asked again on this side — and asked of the name first. A CSV out of a spreadsheet
// arrives with an empty type on one machine and as `application/vnd.ms-excel` on another, so a
// receiver that sorted on `File.type` would turn away the ordinary case (#294).
const CSV_ACCEPT = '.csv,.tsv,text/csv,text/tab-separated-values'
const isDataFile = (file: File) => /\.(csv|tsv)$/i.test(file.name) || file.type === 'text/csv' || file.type === 'text/tab-separated-values'

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
export function DataTable({ doc, project, selectedRow, onSelectRow, onCell, onAddRow, onRemoveRow, onReplaceRows, onAddField, onRemoveField, onMoveField, onRenameField, onProse, assetBase, onUpload, onSymbol, compareWith, onStopCompare }: DataTableProps) {
  const t = useT()
  // The one channel everything on a screen speaks in (#7): a column that moved under the focus
  // says so here rather than in a live region this table made for itself.
  const say = useSay()
  // What the import warns about is bound to the import control by this, so the warning is read
  // with it and not merely next to it (#36).
  const noteId = useId()
  const [importError, setImportError] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  // Which image cell a drag is over.
  const [over, setOver] = useState<string | null>(null)
  // The symbol picker (E4): which cell has an open brace before the cursor, what has been typed
  // since it, and which symbol is under the arrow keys.
  // `role` is what stands after the bar, or null when no bar has been typed: the syntax itself
  // is what says whether the designer is naming a symbol or the meaning to draw it in (E4).
  // `wrote` is true when the brace under the cursor is one the `{ }` button put there rather than
  // one the designer typed. Only such a brace may be taken back by pressing that button again
  // (#236): what somebody typed is theirs, and a control that eats it is a control nobody trusts.
  const [brace, setBrace] = useState<{ cardRef: string; field: string; at: number; query: string; role: string | null; wrote: boolean } | null>(null)
  const [choice, setChoice] = useState(0)
  // The symbol chosen in the box, while its meaning is still the question (L34). Null until one
  // is chosen, and null again the moment anything else is typed: what was chosen was chosen for
  // the name that stood in the brace then.
  const [picked, setPicked] = useState<GameSymbol | null>(null)
  const matches = brace && brace.role === null ? searchSymbols(brace.query, null, t).slice(0, 8) : []
  // The game's meanings as the box offers them, «utan betydelse» first — and none at all when the
  // game has named none, which is what makes the meaning step not exist rather than be skipped.
  const meanings = useMemo(() => meaningsOf(doc.palette), [doc.palette])
  // Where the keys are: in the grid, among the meanings of a chosen symbol, or in the list a
  // typed bar opened. The typed path is the one that was always there and is left exactly as it
  // was — the box is a road to the same string, not a replacement for it.
  const stage = brace === null ? null : brace.role !== null ? 'typed' : picked !== null ? 'meaning' : 'symbol'
  // The card's ground, which every sample stands on (L34): the same reading the palette's own
  // contrast check judges a meaning's colour against.
  const paper = useMemo(() => groundOf(doc, 'front'), [doc])
  // Projektets symboler som bilder: proven i rutan ritas av dem, och `{namn}` i en body-cell
  // ritas som symbolen och inte som sitt namn. Samma upplösning som förhandsvisningen gör (E1).
  const gameIcons = useMemo(() => previewIcons(doc, assetBase), [doc, assetBase])
  // The meanings the deck has named, narrowed by what has been typed after the bar. A deck that
  // has named none offers nothing rather than an empty list — there is nothing to pick.
  const namingRole = brace?.role ?? null
  const roleMatches =
    namingRole === null
      ? []
      : Object.entries(doc.palette ?? {})
          .filter(([role]) => role.toLowerCase().startsWith(namingRole.toLowerCase()))
          .map(([role, colour]) => ({ role, colour }))
          .slice(0, 8)
  // The one the keys are on, which is what Enter takes and what the cell points at.
  const active = stage === 'meaning' ? picked : matches[choice]
  const activeRole = roleMatches[choice]
  const activeMeaning = stage === 'meaning' ? (meanings[choice] ?? null) : null
  const closeBrace = () => {
    setBrace(null)
    setPicked(null)
    setChoice(0)
  }
  // What a cell shows now: the row's value, unless the picker is open on it, since the cell is
  // typed into before the project has the change.
  const typing = useRef<Record<string, string>>({})
  // Which cell the designer is standing in, so the way to an icon is offered there and nowhere
  // else (#33). Which cell it is belongs to React, not to the stylesheet: a handle hidden by CSS
  // is still a stop in the tab order, and there would be one per cell.
  const [here, setHere] = useState<{ cardRef: string; field: string } | null>(null)
  // Which visit to a cell is the current one (L14): it goes up whenever a cell takes the focus,
  // so everything typed without leaving is one step back and coming back to the same cell is the
  // next one. Only one cell holds the focus at a time, so one count is the whole of it.
  const visits = useGesture('cell')
  const cellGesture = () => visits.token()
  // Whether the designer is standing in a cell at all, which is what holds the column widths
  // still (#46). One boolean and not the cell itself: moving from one cell to the next is not a
  // moment to re-measure, it is the same edit going on.
  const editing = here !== null
  // Var markören ska stå efter att verktyget skrivit åt designern — en symbol tagen ur listan i
  // en body-cell — och vilken klammer knappen `{ }` själv skrev. Båda är ett meddelande till
  // nästa rendering och inget tillstånd att rita av, så de bor i en ref.
  const caretAfter = useRef<{ cardRef: string; field: string; at: number } | null>(null)
  const braceByButton = useRef(false)
  const openBrace = (cardRef: string, field: string, el: HTMLInputElement, wrote = false) =>
    openBraceAt(cardRef, field, el.value, el.selectionStart ?? el.value.length, wrote)
  const openBraceAt = (cardRef: string, field: string, value: string, caret: number, wrote = false) => {
    // Where the brace stands behind the caret and what has been written since it is the same
    // question the rulebook's `[[` asks, so it is asked in one place (L23, #215). A closed brace
    // is written text and stops the lookup; a bare number in braces is a pip (L2) and is this
    // surface's own exception, since only a cell has pips in it.
    const byButton = braceByButton.current
    braceByButton.current = false
    const found = triggerBehind(value, caret, BRACE, BRACE_STOPS)
    if (!found || /^\d+$/.test(found.query)) return closeBrace()
    // The bar is the whole of the switch: before it the designer is naming a symbol, after it the
    // meaning to draw it in. Nothing has to be learned and no key is taken from moving around the
    // table, which Tab and the arrows already own.
    const bar = found.query.indexOf('|')
    setBrace(
      bar < 0
        ? { cardRef, field, at: found.at, query: found.query, role: null, wrote: wrote || byButton }
        : { cardRef, field, at: found.at, query: found.query.slice(0, bar), role: found.query.slice(bar + 1), wrote: wrote || byButton },
    )
    setPicked(null)
    setChoice(0)
  }
  // In card text an icon is its name in braces (L2). In a cell a row of icons reads, it is the
  // bare name among others, because that element splits the cell on spaces and commas (#33). A
  // meaning follows the name after a bar in both (E4).
  const token = (name: string, role: string | null, bare: boolean) => (bare ? `${name}${role === null ? '' : `|${role}`}` : `{${name}${role === null ? '' : `|${role}`}}`)
  // Chosen with or without a meaning, it is one insertion (L34): the symbol is taken into the
  // game and the token written where the brace stood, exactly as typing it would have.
  const takeSymbol = (symbol: GameSymbol, role: string | null = null) => {
    const open = brace
    if (!open || !onSymbol) return
    const key = `${open.cardRef}:${open.field}`
    const current = typing.current[key] ?? String(doc.rows.find((r) => r.id === open.cardRef)?.fields[open.field] ?? '')
    closeBrace()
    const bare = iconFieldsOf(doc).includes(open.field)
    void onSymbol(symbol).then((name) => {
      const before = current.slice(0, open.at)
      const after = current.slice(open.at + 1 + open.query.length)
      const written = bare ? `${before.replace(/\{$/, '')}${token(name, role, true)}${after}`.trim() : `${before}${token(name, role, false)}${after}`
      caretAfter.current = { cardRef: open.cardRef, field: open.field, at: written.length - after.length }
      onCell(open.cardRef, open.field, written)
    })
  }
  // A symbol chosen in the grid: inserted at once when the game has no meanings, and otherwise
  // held while the meaning is chosen — with the keys moved onto «utan betydelse», which is first.
  const chooseSymbol = (symbol: GameSymbol) => {
    if (meanings.length === 0) return takeSymbol(symbol)
    setPicked(symbol)
    setChoice(0)
  }
  // What the box will write, said in the box as the product's own syntax. The name is the one
  // the symbol gets in the game, which is what `takeSymbol` writes.
  const writes = brace && active ? token(symbolName(active, t), activeMeaning?.role ?? null, iconFieldsOf(doc).includes(brace.field)) : ''
  // The meaning written onto the symbol already named. What stands before the bar is left exactly
  // as the designer typed it: they have already chosen the symbol, and this only says how it is
  // to be read (E4).
  const takeRole = (role: string) => {
    const open = brace
    if (!open || open.role === null) return
    const key = `${open.cardRef}:${open.field}`
    const current = typing.current[key] ?? String(doc.rows.find((r) => r.id === open.cardRef)?.fields[open.field] ?? '')
    closeBrace()
    const bare = iconFieldsOf(doc).includes(open.field)
    const before = current.slice(0, open.at)
    const after = current.slice(open.at + 1 + open.query.length + 1 + open.role.length)
    const written = bare ? `${before.replace(/\{$/, '')}${open.query}|${role}${after}`.trim() : `${before}{${open.query}|${role}}${after}`
    caretAfter.current = { cardRef: open.cardRef, field: open.field, at: written.length - after.length }
    onCell(open.cardRef, open.field, written)
  }

  // Klammerns väljare, skriven en gång för varje sorts cell som har en. Ett vanligt fält och en
  // body-cells skrivyta är två skrivytor i samma flik, och två väljare där vore just felet L34
  // stängde: rutan är samma ruta, tangenterna är samma tangenter, och aria pekar på samma listor.
  // Därför står de tre som funktioner här och inte som JSX i var sin gren.
  //
  // Vad rutan öppnar på beror bara på `stage`, och `stage` hör till den enda klammer som är öppen
  // — bara en cell åt gången skrivs det i.
  const cellPicking = (cardRef: string, field: string) => brace?.cardRef === cardRef && brace.field === field
  // Tangenterna listan svarar på, hörda där markören står och inte i listan: fokus stannar i
  // meningen som skrivs. Räknandet av hur många som går att stega mellan följer steget.
  const onListKey = (cardRef: string, field: string, e: { key: string; preventDefault(): void }) => {
    if (!cellPicking(cardRef, field)) return
    const picking = stage === 'meaning' ? meanings.length : stage === 'typed' ? roleMatches.length : matches.length
    const act = symbolListKey(e.key, picking, choice)
    if (!act) return
    e.preventDefault()
    if (act === 'close') return closeBrace()
    if (act === 'pick') {
      if (stage === 'typed') return void (activeRole && takeRole(activeRole.role))
      if (stage === 'meaning') return void (picked && takeSymbol(picked, activeMeaning?.role ?? null))
      return void (active && chooseSymbol(active))
    }
    setChoice(act.active)
  }
  // Vilken lista skrivytan pekar på, och vilket alternativ i den som är det aktiva.
  const listAria = (cardRef: string, field: string): Record<string, string> =>
    !cellPicking(cardRef, field)
      ? {}
      : {
          ...(stage === 'symbol' && active ? { 'aria-controls': CELL_SYMBOLS, 'aria-activedescendant': symbolOptionId(CELL_SYMBOLS, active) } : {}),
          ...(stage === 'meaning' && activeMeaning ? { 'aria-controls': CELL_MEANINGS, 'aria-activedescendant': roleOptionId(CELL_MEANINGS, activeMeaning.role) } : {}),
          ...(stage === 'typed' && activeRole ? { 'aria-controls': CELL_ROLES, 'aria-activedescendant': roleOptionId(CELL_ROLES, activeRole.role) } : {}),
        }
  // Själva rutan. Den hänger på cellen, som är det `position: relative` står på, så den svävar
  // över tabellen i stället för att växa raden.
  const cellPicker = (cardRef: string, field: string) => {
    const open = brace
    if (!open || !cellPicking(cardRef, field)) return null
    return (
      <>
        {stage === 'typed' && roleMatches.length > 0 && (
          // The deck's meanings, where the bar was just typed. When the name before the bar is
          // one of the game's symbols, each meaning is a coloured copy of it on the card's paper
          // (L34); a name the game lacks has nothing to copy and keeps the swatch.
          <>
            <SymbolSheet />
            <RoleList
              id={CELL_ROLES}
              className="byd-data-symbols"
              roles={roleMatches}
              active={choice}
              label={t('table.roles')}
              sample={doc.icons[open.query] ? ({ role }) => <SymbolSample written={`{${open.query}|${role}}`} symbols={{ icons: gameIcons, palette: doc.palette }} paper={paper} /> : undefined}
              onPick={(role) => role !== null && takeRole(role)}
            />
          </>
        )}
        {stage !== 'typed' && matches.length > 0 && (
          // The library where the cursor stands (E4): the same set the Symboler tab fills and the
          // rail's Ikon tool opens, reached without leaving the sentence being written — and the
          // same list component, so it cannot come to differ. The meaning is chosen in the same
          // box (L34).
          <SymbolBox
            symbolsId={CELL_SYMBOLS}
            meaningsId={CELL_MEANINGS}
            className="byd-data-symbols"
            symbols={matches}
            active={picked ? matches.indexOf(picked) : choice}
            picked={picked}
            meanings={meanings}
            meaningActive={stage === 'meaning' ? choice : null}
            paper={paper}
            palette={doc.palette}
            writes={writes}
            onPickSymbol={chooseSymbol}
            onPickMeaning={(role) => active && takeSymbol(active, role)}
          />
        )}
      </>
    )
  }

  // What moved since the version being compared with (B4), and the cards that are no longer
  // there — shown after the deck, since they have no place in it any more.
  const diff = compareWith ? diffProjects(compareWith.doc, doc) : null
  const changeOf = (cardRef: string) => diff?.rows.find((r) => r.cardRef === cardRef)
  const goneRows: ProjectRow[] = compareWith && diff ? compareWith.doc.rows.filter((r) => diff.rows.some((c) => c.kind === 'removed' && c.cardRef === r.id)) : []
  const wasCell = (cardRef: string, field: string) => compareWith?.doc.rows.find((r) => r.id === cardRef)?.fields[field]
  const imageFields = assetBase && onUpload ? imageFieldsOf(doc) : []
  // Kolumnerna som skrivs som prosa och därför kan visa ett stycke eller en punkt (L39). De
  // ritas som den form de bär i stället för som tecknen som bär den. Vilka de är föreslås av
  // rutans höjd i mallen och avgörs av designern (L43, #362).
  const bodyFields = proseFieldsOf(doc)
  // Och rutan varje kolumn mäts mot, som är vad märket i huvudet säger orsaken med.
  const boxes = boxesOf(doc)
  const images = assetsInUse(doc)
  // The library window (#296, variant B): opened from a picture cell or from the marked cards,
  // and it is one window for both. What it is about is the one thing the table has to hold —
  // the picture it writes is the window's own answer — and what it did is said in the strip
  // above the table, where the pictures are, so a designer who stays in Data is told.
  const [library, setLibrary] = useState<{ kind: 'cell'; cardRef: string; field: string } | { kind: 'marked'; field: string } | null>(null)
  const [said, setSaid] = useState<string | null>(null)
  // Every picture the game holds, the unused ones included (L22): the strip above the table
  // lists what is in use, which is exactly the list a designer looking for the picture she just
  // uploaded cannot find it in.
  const pictures: LibraryPicture[] = mediaInGame(doc).map(({ hash, cards, template }) => ({ hash, name: doc.pictures?.[hash]?.name, cards, template }))
  // What the status calls the picture: its file name where one was kept, and otherwise nothing —
  // the same sentence the upload's own status uses, since a picture from before names is not
  // called «Bild på dragon» once it is on knight and wizard too.
  const pictureName = (hash: string): string | undefined => doc.pictures?.[hash]?.name
  // Cellens egen ruta tar en bild (#291): flera filer är en fråga utan svar, och den ställs
  // tillbaka i stället för att besvaras med den första.
  const upload = async (cardRef: string, field: string, files: readonly File[]) => {
    const one = oneFile(files, t)
    if (one === null || !onUpload) return
    if ('said' in one) {
      setUploadError(one.said)
      return
    }
    try {
      onCell(cardRef, field, assetRef(await onUpload(one.file)))
      setUploadError(null)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err))
    }
  }
  // The same upload, for the action row rather than for a cell: the file becomes one asset and the
  // row holds it until the button is pressed. One file, one upload, however many cards it lands on.
  const bulkUpload = async (files: readonly File[]) => {
    const one = oneFile(files, t)
    if (one === null || !onUpload) return
    if ('said' in one) {
      setUploadError(one.said)
      return
    }
    try {
      setBulkImage(await onUpload(one.file))
      setUploadError(null)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err))
    }
  }
  const [sort, setSort] = useState<SortState | null>(null)
  const [filter, setFilter] = useState<FilterState>(noFilter)
  // The marking is the deck's and not this panel's (#222): it is made here and acted on here and
  // in the media library, so it is held above both. A table mounted on its own keeps its own.
  const [selected, setSelected] = useMarked()
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
  // And what it writes when the column is a bild (E1): the image itself, since a bildfält is not a
  // sentence anyone can type. The hash is held until the button is pressed, exactly as the typed
  // value is.
  const [bulkImage, setBulkImage] = useState<string | null>(null)
  const [bulkOver, setBulkOver] = useState(false)
  // Whether the head's last cell is showing the form that makes a column, and which column has
  // been asked about taking away (#32).
  const [adding, setAdding] = useState(false)
  // The head's last cell, which is the door and its handle together (#388).
  const doorCell = useRef<HTMLTableCellElement>(null)
  // The import and the export are the one thing on this surface that is done once and is not a
  // state, so they are what falls into a box (#130). The filters stay in the row.
  const [importing, setImporting] = useState(false)
  // A file is over the import control. The same word the table's picture cells use for the same
  // moment (#222), so the mark is one mark in one language wherever a file is let go in the tool.
  const [csvOver, setCsvOver] = useState(false)
  const importBox = useRef<HTMLButtonElement>(null)
  const [dropping, setDropping] = useState<string | null>(null)
  // Which column is being carried along the head, and which heading it would land in front of
  // (#46). The carried one is a ref and the heading under the pointer is state, for the reason
  // the layer list has the same pair: what is being dragged is read inside an event and never
  // drawn, and where it would land is drawn on every frame of the drag and never read back.
  const carried = useRef<string | null>(null)
  const [overColumn, setOverColumn] = useState<string | null>(null)
  // The widths the designer set herself (#46), and which column is being pulled right now — a
  // column being pulled may not also be picked up and carried off by the same grip.
  const [widths, setWidths] = useState<Record<string, number>>(() => heldWidths(project))
  const [pulling, setPulling] = useState<string | null>(null)
  // The pull the hand is making right now: which edge it came down on, where, the width the
  // column had then, and whether it has gone anywhere yet. A ref beside that state for the same
  // reason `carried` is one — it is read inside an event and never drawn, while `pulling` is
  // drawn on every frame and never read back.
  // `at` is where the pointer was last seen and `scrolled` how far the box has moved under it
  // since the hand came down (#141): a column dragged past the window's edge keeps growing while
  // the box travels, so the width it is drawn at is the hand's distance plus the box's.
  const gripped = useRef<{ field: string; from: number; was: number; pulled: boolean; at: number; scrolled: number } | null>(null)
  const travelling = useRef<number | null>(null)
  // Which columns are standing outside the box, and the answer they were last drawn from (#46).
  // The set is held as state because it is words on the screen; the key beside it is what keeps a
  // scroll from setting state on every frame it does not change anything.
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
      // And whether anything has gone under the columns that stand still (#145), which is one
      // number rather than eight rectangles. The edge under `id` is a promise that something is
      // there; drawn against a table scrolled to its start it would be a lie.
      box.toggleAttribute('data-under', box.scrollLeft > 0)
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
      pin()
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
  }, [deck, editing, widths])
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
  // The columns whose place along the head is the designer's (#46). The card's id is not one of
  // them and never was — it is a column of the table without being a field of a card — and
  // `antal` stands last wherever the table shows it (L4), so a move of it could not be seen and a
  // place in front of it is not on offer.
  const mine = fields.filter((field) => field !== ANTAL)
  // Where a column comes to stand when it is dropped on a heading. Dropped on one to its left it
  // stands in front of that heading; dropped on one to its right it stands after it, which is in
  // front of whatever follows and last of all when nothing does. Said in columns and never in
  // indexes, because the document answers in columns: the index an order is read at changes the
  // moment the carried column is lifted out of it.
  const landing = (held: string, onto: string): string | null => {
    const at = mine.indexOf(held)
    const to = mine.indexOf(onto)
    return at > to ? onto : (mine[to + 1] ?? null)
  }
  // One move, wherever it came from, and the head says where the column ended up. A drag is its
  // own answer to the eye; the keys are not, and a column that moved out from under the focus
  // with nothing said is a column the reader has lost.
  const moveColumn = (field: string, before: string | null) => {
    onMoveField(field, before)
    const rest = mine.filter((f) => f !== field)
    const at = before === null ? rest.length : rest.indexOf(before)
    say?.('polite', t('table.column.moved', { field, at: at + 1, of: mine.length }))
  }
  // Ett namnbyte, och huvudet säger vad kolumnen heter nu (#384). Rubriken byter ord under
  // designerns ögon, men hon står i dörren och tittar på listan när det händer — och den som har
  // leken öppen någon annanstans får bytet som vilket steg som helst, utan att något sägs där.
  const renameColumn = (from: string, to: string) => {
    onRenameField?.(from, to)
    say?.('polite', t('table.column.renamed', { from, to }))
  }
  // What the editor declares a target to be, asked of the page rather than written down here —
  // and it is the floor a column can be pulled to. Narrower than a fingertip is not a width
  // anybody chose; it is a column thrown away by a hand that slipped, and there is no way back to
  // it once its own edge is too small to catch.
  const tap = (): number => {
    const box = scrollRef.current
    const said = box ? parseFloat(getComputedStyle(box).getPropertyValue('--byd-tap')) : NaN
    return Number.isFinite(said) && said > 0 ? said : TAP_FLOOR
  }
  // Every width the table holds, drawn and remembered in one move, because they are one fact:
  // what is on the screen and what will be on it again next time cannot be allowed to drift.
  const hold = (next: Record<string, number>) => {
    setWidths(next)
    rememberWidths(project, next)
  }
  // The same record without one column in it.
  const without = (field: string): Record<string, number> => {
    const { [field]: gone, ...rest } = widths
    void gone
    return rest
  }
  // A width with no column left to be about (#46). It goes without a word: what has happened is
  // that a column was taken away, which the head has already said, and "body follows its content
  // again" is a sentence about a column that is still there. Left behind instead it was a number
  // under a name nothing answers to — and the next column made under that name, empty and brand
  // new, was drawn at a width a hand had chosen for somebody else's values.
  const forgetWidth = (field: string) => {
    if (widths[field] !== undefined) hold(without(field))
  }
  // A width set, or given back to the measurement. Held in this table and remembered in the
  // browser, never written into the document: how wide one designer wants to read a column on
  // her screen is not a fact about the game (L4).
  const setWidth = (field: string, px: number | null) => {
    const next = px === null ? without(field) : { ...widths, [field]: Math.max(tap(), Math.round(px)) }
    hold(next)
    const said = next[field]
    say?.('polite', said === undefined ? t('table.column.width.said.auto', { field }) : t('table.column.width.said', { field, px: said }))
  }
  // What the table is drawn at while a hand is on a column's edge, and what it is drawn back at
  // when that hand lets go of the drag instead of the width. Declared on the column and then
  // measured — the same two steps in the same order through the same door — so that the picture
  // under the hand cannot be a picture of anything else.
  //
  // Written straight onto the column instead, as it was, nothing else knew: the table's own width
  // still said what the last measurement said, and under a fixed layout a table wider than the sum
  // of its columns hands the difference back out over all of them. Measured in Chromium, a column
  // pulled 300 px narrower was drawn 56 px wider than the width it had just been given — so the
  // edge lagged the hand going in, and jumped to catch up when the hand let go.
  const drawWidth = (field: string, px: number | null) => {
    const box = scrollRef.current
    const col = Array.from(box?.querySelectorAll('colgroup > col') ?? []).find((c) => c.getAttribute('data-col') === field)
    if (!box || !(col instanceof HTMLElement)) return
    if (px === null) col.removeAttribute('data-width')
    else col.setAttribute('data-width', String(px))
    fitColumns(box, deck)
    markValues(box)
    markCut(box)
  }
  // What the column is worth right now: how far the hand has moved, plus how far the box has
  // travelled under it (#141), and never less than a target.
  const widthUnderTheHand = (held: { from: number; was: number; at: number; scrolled: number }): number =>
    Math.max(tap(), Math.round(held.was + (held.at - held.from) + held.scrolled))
  const stopTravelling = () => {
    if (travelling.current !== null) cancelAnimationFrame(travelling.current)
    travelling.current = null
  }
  // The box moving under a drag that has reached its edge. It asks `dragScroll` what the pointer's
  // place is worth on every frame and stops the moment that is nought — which is both edges of a
  // table that fits, and the far end of one that does not.
  const travel = () => {
    if (travelling.current !== null) return
    const step = () => {
      travelling.current = null
      const held = gripped.current
      const box = scrollRef.current
      if (!held?.pulled || !box) return
      const by = dragScroll(box, held.at)
      if (by === 0) return
      box.scrollLeft += by
      held.scrolled += by
      drawWidth(held.field, widthUnderTheHand(held))
      travelling.current = requestAnimationFrame(step)
    }
    travelling.current = requestAnimationFrame(step)
  }

  // Fetching a column that has gone out of the box back into it (#46). A step of most of the box
  // rather than a jump to the end, so the sentence beside it counts down as the hand presses and
  // the reader can stop at what she was looking for.
  //
  // The gliding is asked for here and not in the stylesheet, because `scroll-behavior` on the box
  // would be an answer to every scroll anything ever asks it for — including the one a test makes
  // to see where the pin falls, and including the browser's own when it brings a focused cell into
  // view. A reader who has asked for less motion is handed the jump instead; it is the same
  // sentence either way, and nothing else moves.
  // What a heading needs to be the edge its column is pulled by. The two the table owns have
  // none: a card's id is a machine key and `antal` is the engine's own count, and neither is
  // prose anybody reads at a width of her choosing (L4).
  const pullOf = (field: string): Pull | undefined =>
    mine.includes(field)
      ? {
          onGrab: (event) => {
            // The edge is inside a heading that can be picked up and carried off (#46), and a
            // pointer that went down on the edge came down on the heading too. The grab is
            // therefore taken here and nowhere else, and the heading stops being draggable for
            // as long as the hand is on its edge.
            event.preventDefault()
            event.stopPropagation()
            const th = (event.target as HTMLElement).closest('th')
            if (!th) return
            gripped.current = { field, from: event.clientX, was: Math.round(th.getBoundingClientRect().width), pulled: false, at: event.clientX, scrolled: 0 }
            setPulling(field)
            // The edge holds the pointer it took hold of, exactly as the canvas's own drag layer
            // does (#18), and for the second of the two reasons that one gives: a fast hand keeps
            // pulling the column it grabbed, and — this is the half that was missing — a gesture
            // the browser takes away from the page comes back here as `pointercancel`. Hung on
            // `window` instead, as this was, nothing came back at all: a pen lifted or a system
            // gesture left the listeners standing, `pulling` standing, and the heading unable to
            // be either dragged or sorted until a release that never came (#142).
            event.currentTarget.setPointerCapture?.(event.pointerId)
          },
          onPull: (event) => {
            const held = gripped.current
            if (held?.field !== field) return
            // Until the hand has really moved, the column is left exactly as the measurement last
            // had it — so a press that turns out to be a click has nothing to give back.
            if (!held.pulled && Math.abs(event.clientX - held.from) < PULL_SLOP) return
            held.pulled = true
            held.at = event.clientX
            drawWidth(field, widthUnderTheHand(held))
            // A hand that has reached the box's edge is out of pointer, not out of intent. The
            // box travels under it for as long as it stays there — a pointer held still sends no
            // more moves, so the travelling is its own loop rather than a step per event.
            travel()
          },
          onLetGo: (event) => {
            const held = gripped.current
            if (held?.field !== field) return
            gripped.current = null
            setPulling(null)
            // A press that never went anywhere is not a width. It used to be one — the release
            // set the column to the width it already had — and a column that has stopped
            // following its deck looks exactly like one that still does, so the table went
            // quietly deaf on whichever heading a hand had rested on.
            stopTravelling()
            if (held.pulled) setWidth(field, widthUnderTheHand({ ...held, at: event.clientX }))
          },
          onCallOff: () => {
            const held = gripped.current
            if (held?.field !== field) return
            gripped.current = null
            setPulling(null)
            stopTravelling()
            if (!held.pulled) return
            // Back to the width the column had when the hand came down on its edge: a number when
            // the designer had set one, and no number at all when it was still following its deck.
            // Nothing is written and nothing is remembered — a drag taken back is not a width
            // anybody chose — so the picture has to be put back by hand, the measurement having
            // nothing new to answer to.
            drawWidth(field, widths[field] ?? null)
            say?.('polite', t('editor.drag.cancelled'))
          },
          // Asked twice, the edge gives the column back to the measurement.
          onAuto: () => setWidth(field, null),
          onStep: (dir) => {
            const th = Array.from(scrollRef.current?.querySelectorAll('thead th') ?? []).find((cell) => cell.getAttribute('data-col') === field)
            const was = widths[field] ?? Math.round(th?.getBoundingClientRect().width ?? 0)
            setWidth(field, was + dir * PULL_STEP)
          },
        }
      : undefined
  // What a heading needs to be a handle. A heading with none of it is a heading that cannot be
  // carried and is not a place to put one down either.
  const carryOf = (field: string): Carry | undefined =>
    mine.includes(field)
      ? {
          over: overColumn === field,
          onPickUp: () => {
            carried.current = field
          },
          onOver: (event) => {
            event.preventDefault()
            if (carried.current !== null && carried.current !== field) setOverColumn(field)
          },
          onDone: () => {
            carried.current = null
            setOverColumn(null)
          },
          onDrop: () => {
            const held = carried.current
            carried.current = null
            setOverColumn(null)
            if (held === null || held === field || !mine.includes(held)) return
            moveColumn(held, landing(held, field))
          },
          onStep: (dir) => {
            const at = mine.indexOf(field)
            const to = at + dir
            // One step to the left is standing in front of the neighbour; one to the right is
            // standing in front of whatever follows the neighbour, and last of all when the
            // neighbour is the end of the head. The ends are ends: a column does not come round.
            const before = dir === -1 ? mine[to] : mine[to + 1]
            if (to < 0 || to >= mine.length) return
            moveColumn(field, before ?? null)
          },
        }
      : undefined
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
  // What the row would write, and whether there is anything to write at all. One question for
  // both shapes of value: a bildfält holds an image and every other column holds what has been
  // typed, but pressing the button is the same action either way, so it is one button and one
  // reading of what it is about to do. `null` is the empty hand — a change nobody chose is not
  // worth pressing by mistake.
  const bulkIsImage = imageFields.includes(field)
  const bulkWrites: Cell | null = bulkIsImage
    ? bulkImage === null
      ? null
      : assetRef(bulkImage)
    : bulkValue === ''
      ? null
      : field === ANTAL
        ? Number(bulkValue)
        : bulkValue
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
  // The second way into that one path (#292, #291 variant B). What the drop may not do is decide
  // anything the picker does not: an import replaces the whole table, so a drop that reached for
  // the first of several files would make the deck the designer ends up with the order the files
  // happened to arrive in — and the rest would be gone without a word. Both refusals name the
  // files, in the same place a CSV that would not parse says so, and leave the table untouched.
  const dropFile = (dropped: readonly File[]) => {
    const [file, ...rest] = dropped
    if (!file) return
    if (rest.length > 0) {
      setImportError(t('table.import.one', { files: dropped.map((f) => f.name).join(', ') }))
      return
    }
    if (!isDataFile(file)) {
      setImportError(t('table.import.wrongType', { file: file.name }))
      return
    }
    importFile(file)
  }
  // What the file is called is the tool's word about the file, not the game's, so it follows the
  // reader (A4). The game's own name inside it is the game's: it is only folded into something a
  // file system will carry, never translated, and a name that leaves nothing behind falls back to
  // the tool's own stand-in — which is the tool's word too, and follows the reader with the rest.
  const filename = t('table.export.filename', { name: fileSafe(doc.name) || t('table.export.unnamed') })
  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent('\uFEFF' + exportCardsCsv(doc))}`
  return (
    <div className="byd-table-wrap">
      {/* The way out of the pull, for the hand that changed its mind before it let go (#142).
          The same door the canvas hangs over its own drag, and it stands only while there is a
          pull to leave. */}
      {pulling !== null && <DragDoor onCancel={() => pullOf(pulling)?.onCallOff()} />}
      {/* The crown (#128, #130, variant B). Four bands used to stack over this table and cost it
          189 px at 1440 and 218 px at 1280 before the first card row: the import pair with its
          warning, the search with thirteen filter chips, the count, and the sort. They are one
          row now, with the count and the sort read under the table instead.
          The filters keep their place in the row and get a side scroll of their own: putting
          thirteen chips behind `Filter (13) ▾` would hide the one thing here that is a state
          rather than an action. What falls into a box is the import and the export. */}
      <Crown>
        <input
          type="search"
          className="byd-data-search"
          aria-label={t('table.search')}
          placeholder={t('table.search.placeholder')}
          value={filter.query}
          onChange={(event) => changeFilter({ ...filter, query: event.target.value })}
        />
        {discrete.length > 0 && (
          <CrownRail label={t('table.filters')}>
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
          </CrownRail>
        )}
        {isFiltering(filter) && (
          <button type="button" className="byd-data-clear" onClick={() => changeFilter(noFilter)}>
            {t('table.filter.clear')}
          </button>
        )}
        <CrownBox name={t('table.import.box')} open={importing} onToggle={() => setImporting(!importing)} boxRef={importBox} end />
      </Crown>
      {importing && (
        <CrownDrawer label={t('table.import.box')} opener={importBox} onClose={() => setImporting(false)}>
          <div className="byd-data-tools">
            {/* The control is the receiver (#292, #291 variant B): the data file is let go on the
                thing that takes it, and there is no second box beside it and no drop over the
                whole Data tab. Both halves of the drag are cancelled, because a file let go
                anywhere the page does not catch it is the browser leaving the editor to open the
                CSV as a page of its own. */}
            <label
              data-over={csvOver ? 'true' : undefined}
              onDragOver={(event) => {
                event.preventDefault()
                setCsvOver(true)
              }}
              onDragLeave={() => setCsvOver(false)}
              onDrop={(event) => {
                event.preventDefault()
                setCsvOver(false)
                dropFile([...(event.dataTransfer.files ?? [])])
              }}
            >
              {t('table.import')}
              <input className="byd-offscreen" type="file" accept={CSV_ACCEPT} aria-label={t('table.import')} aria-describedby={noteId} onChange={(event) => importFile(event.target.files?.[0])} />
            </label>
            {/* What an import costs is import's own warning (#36). It stands where it is read —
                after the control it warns about, before the one it says nothing about — and it is
                bound to that control besides, so a reader who never sees the two standing next to
                each other hears the warning as part of the thing that carries it. It came with
                the pair into the box rather than staying over the table as a band of its own,
                which is what #130 measured 189 px of. */}
            <span id={noteId}>{t('table.import.note')}</span>
            {importError && <span role="alert">{importError}</span>}
            <a href={csvHref} download={filename}>{t('table.export')}</a>
          </div>
        </CrownDrawer>
      )}
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
          {/* What the library did, said where the pictures are. The region stands from the start
              and empty, so it is one something was listening to when the sentence arrives. */}
          <span className="byd-data-said" role="status">{said ?? ''}</span>
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
            {/* A bildfält is written with an image and never with a sentence (E1). The cell
                already knows that; the action row used to offer a text field for it, which wrote
                prose into a column the template draws as a picture. So the value takes the shape
                of the column: a place to drop one of the deck's images, and nothing to type. */}
            {bulkIsImage && assetBase ? (
              <div
                role="group"
                aria-label={t('table.bulk.image')}
                {...dropSurface({
                  className: 'byd-data-drop',
                  over: bulkOver,
                  onOver: setBulkOver,
                  onFiles: (files) => void bulkUpload(files),
                  onLibrary: setBulkImage,
                })}
              >
                {bulkImage ? <img src={assetUrl(assetBase, bulkImage)} alt={t('table.bulk.image')} /> : <span>{t('table.image.drop')}</span>}
                {bulkOver && <DropSays />}
                {/* The library (#296): a picture the game already has, onto every marked card. */}
                <button type="button" className="byd-data-file" aria-label={t('table.bulk.image.choose')} onClick={() => setLibrary({ kind: 'marked', field })}>
                  {t('table.image.choose')}
                </button>
                <label className="byd-data-file">
                  {t('table.image.upload')}
                  <input className="byd-offscreen" type="file" accept="image/*" aria-label={t('table.bulk.image.upload')} onChange={(event) => void bulkUpload([...(event.target.files ?? [])])} />
                </label>
              </div>
            ) : (
              <input
                type={field === ANTAL ? 'number' : 'text'}
                min={field === ANTAL ? 0 : undefined}
                aria-label={t('table.value')}
                value={bulkValue}
                onChange={(event) => setBulkValue(event.target.value)}
              />
            )}
            <button
              type="button"
              disabled={bulkWrites === null}
              onClick={() => {
                if (bulkWrites === null) return
                onReplaceRows(setColumn(doc.rows, chosenIds, field, bulkWrites))
                setBulkValue('')
                setBulkImage(null)
              }}
            >
              {bulkIsImage ? t('table.bulk.setImage', { n: chosen.length }) : t('table.bulk.set', { field, n: chosen.length })}
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
            forgetWidth(dropping)
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
          {/* And what the designer set it to, when she has set it (#46). It travels on the column
              beside what the column is worth sizing like, so the measurement is told the whole of
              it by the table and needs to know nothing about what any column is called. */}
          {fields.map((f) => (
            <col key={f} data-col={f} data-kind={widthKind(doc, f)} {...(widths[f] === undefined ? {} : { 'data-width': widths[f] })} />
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
            <SortableHeader field="id" label="id" sort={sort} onSort={setSort} />
            {fields.map((f) => (
              <SortableHeader
                key={f}
                field={f}
                label={fieldLabel(f, t)}
                sort={sort}
                onSort={setSort}
                carry={pulling === null ? carryOf(f) : undefined}
                pull={pullOf(f)}
                // Räknekolumnen är motorns egen (L4) och skrivs aldrig som prosa, så den får
                // inget märke: en kontroll som bara kan svara ett är ingen fråga.
                prose={
                  f === ANTAL
                    ? undefined
                    : { prose: bodyFields.includes(f), choice: proseChoiceOf(doc, f), box: boxes[f] ?? null, ...(onProse ? { onProse: (next: boolean | null) => onProse(f, next) } : {}) }
                }
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
            {/* The cell is what holds the keyboard while the door stands (#388): the ＋ and the
                panel under it are one thing to a hand, and the focus the table hands back to the
                ＋ when a column has gone is a focus that must not be pulled off it again. */}
            <th ref={doorCell} className="byd-data-remove" aria-label={t('table.remove.column')}>
              <button type="button" ref={addRef} aria-label={t('table.columns')} aria-expanded={adding} onClick={() => setAdding(!adding)}>
                +
              </button>
              {adding && (
                <ColumnDoor
                  cell={doorCell}
                  columns={['id', ...fields]}
                  canRemove={(field) => field !== 'id' && field !== ANTAL}
                  onRemove={(field) => setDropping(field)}
                  removeRef={(field, el) => {
                    if (el) dropRefs.current.set(field, el)
                    else dropRefs.current.delete(field)
                  }}
                  asking={dropping !== null}
                  widths={widths}
                  onWidth={setWidth}
                  {...(onRenameField ? { onRename: renameColumn } : {})}
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
                      role="group"
                      aria-label={t('table.imageFor', { cardRef })}
                      data-image-cell={cardRef}
                      {...dropSurface({
                        className: 'byd-data-drop',
                        // Cellen äger sitt eget svar på om draget står över den, så ett släpp
                        // aldrig kan råka ändra ett annat mål (#291).
                        over: over === `${cardRef}:${f}`,
                        onOver: (on) => setOver(on ? `${cardRef}:${f}` : null),
                        onFiles: (files) => void upload(cardRef, f, files),
                        // En biblioteksbild återanvänds utan ny uppladdning (E1): den bär redan
                        // sin hash, och att lägga upp den igen vore att göra en bild av två.
                        onLibrary: (hash) => onCell(cardRef, f, assetRef(hash)),
                      })}
                    >
                      {isAssetRef(row[f]) ? <img src={assetUrl(assetBase, String(row[f]).slice(ASSET_PREFIX.length))} alt={`${cardRef} ${f}`} /> : <span>{t('table.image.drop')}</span>}
                      {over === `${cardRef}:${f}` && <DropSays />}
                      {/* The library (#296): a picture the game already has, into this cell.
                          The upload beside it stays as it was — a file off the disk is the
                          other way a picture reaches a card (#291 owns the drop). */}
                      <button type="button" className="byd-data-file" aria-label={t('table.image.chooseFor', { cardRef })} onClick={() => setLibrary({ kind: 'cell', cardRef, field: f })}>
                        {isAssetRef(row[f]) ? t('table.image.replace') : t('table.image.choose')}
                      </button>
                      <label className="byd-data-file">
                        {t('table.image.upload')}
                        <input className="byd-offscreen" type="file" accept="image/*" aria-label={t('table.image.uploadFor', { cardRef })} onChange={(e) => void upload(cardRef, f, [...(e.target.files ?? [])])} />
                      </label>
                      {isAssetRef(row[f]) && (
                        <button type="button" aria-label={t('table.image.removeFor', { cardRef })} onClick={() => onCell(cardRef, f, '')}>
                          ×
                        </button>
                      )}
                    </div>
                  </td>
                ) : bodyFields.includes(f) ? (
                  <BodyTd
                    key={f}
                    field={f}
                    cardRef={cardRef}
                    doc={doc}
                    row={row}
                    t={t}
                    icons={gameIcons}
                    was={moved(changeOf(cardRef), f) ? String(wasCell(cardRef, f) ?? '') : null}
                    picking={brace?.cardRef === cardRef && brace.field === f}
                    open={here?.cardRef === cardRef && here.field === f}
                    caretAt={caretAfter.current?.cardRef === cardRef && caretAfter.current.field === f ? caretAfter.current.at : null}
                    onWrite={(text, at) => {
                      typing.current[`${cardRef}:${f}`] = text
                      onCell(cardRef, f, text, cellGesture())
                      if (onSymbol) openBraceAt(cardRef, f, text, at)
                    }}
                    onOpen={() => {
                      visits.visit.onFocus()
                      setHeld(shown.map((r) => r.id))
                      setHere({ cardRef, field: f })
                    }}
                    onClose={() => {
                      setHeld(null)
                      setHere((at) => (at?.cardRef === cardRef && at.field === f ? null : at))
                      if (brace?.cardRef === cardRef && brace.field === f) closeBrace()
                    }}
                    onSymbol={() => {
                      // Ett andra tryck på `{ }` är listans eget: den stängs, och ingen ny
                      // klammer skrivs (#236 i den form den kan ta i en skrivyta).
                      if (!(brace?.cardRef === cardRef && brace.field === f && brace.wrote)) {
                        braceByButton.current = true
                        return false
                      }
                      closeBrace()
                      return true
                    }}
                    onListKey={(e) => onListKey(cardRef, f, e)}
                    aria={listAria(cardRef, f)}
                  >
                    {cellPicker(cardRef, f)}
                  </BodyTd>
                ) : (
                <td
                  key={f}
                  data-col={f}
                  // The lane the icon control stands in (#140). It is declared on every cell of a
                  // column the icon path reaches, and not only on the one being worked in: the
                  // control is drawn in one cell at a time, and a lane that came and went with it
                  // would move every field in the column the moment the caret arrived.
                  {...(onSymbol && f !== ANTAL ? { 'data-rail': 'true' } : {})}
                  className={brace?.cardRef === cardRef && brace.field === f ? 'byd-data-picking' : undefined}
                >
                  {moved(changeOf(cardRef), f) && <s className="byd-data-was">{String(wasCell(cardRef, f) ?? '')}</s>}
                  {/* The field and the lane its control stands in, as one grid (#140). It is a box
                      inside the cell and not the cell itself: `display: grid` on a `<td>` stops it
                      being a table cell at all, and the table then wraps every run of them in one
                      anonymous cell where they stack — two railed columns measured a 90 px row
                      where the editor allows 44. The picker below hangs off the cell, which is
                      what `position: relative` is on, so it stays outside this box. */}
                  <div className="byd-data-lane">
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
                    onKeyDown={(e) => onListKey(cardRef, f, e)}
                    onFocus={() => {
                      visits.visit.onFocus()
                      setHeld(shown.map((r) => r.id))
                      setHere({ cardRef, field: f })
                    }}
                    onBlur={() => {
                      setHeld(null)
                      setHere((at) => (at?.cardRef === cardRef && at.field === f ? null : at))
                      // The library belongs to the cell it was opened in (#236). What draws it asks
                      // only which cell that was, so a hand that went to another row left it
                      // standing over a cell nobody was in — a library about nothing. Picking from
                      // it is not a departure: an option refuses the focus on `mousedown`, exactly
                      // so that the sentence being written keeps it.
                      if (brace?.cardRef === cardRef && brace.field === f) closeBrace()
                    }}
                    aria-label={`${cardRef} ${f}`}
                    {...listAria(cardRef, f)}
                  />
                  {/* The brace, made visible in the cell the designer is standing in (#33). It
                      writes the brace and opens the same picker typing one does — one way in, seen
                      rather than known. Only in the cell being worked in: one handle per cell is a
                      wall of braces on screen, and a hundred stops in the tab order.
                      It stands after the field and not before it, because that is where it stands
                      on the screen: the cell is a grid and the two are laid out in the order they
                      are written (#140). It is also the order they are read in — the field, and
                      then the control that belongs to it. */}
                  {onSymbol && f !== 'antal' && here?.cardRef === cardRef && here.field === f && (
                    <button
                      type="button"
                      className="byd-data-icon"
                      aria-label={t('table.icon.insert')}
                      title={t('table.icon.hint')}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={(event) => {
                        const input = event.currentTarget.closest('td')?.querySelector('input')
                        if (!input) return
                        // Pressed a second time it is the same press undone (#236): the library
                        // goes, and so does the brace this button wrote. A brace still open is by
                        // construction a brace with no finished symbol in it — `openBrace` closes
                        // the moment a `}` is written — so there is nothing here to lose. Only the
                        // brace itself is taken; letters typed after it are the designer's.
                        const mine = brace?.cardRef === cardRef && brace.field === f && brace.wrote ? brace : null
                        if (mine) {
                          const undone = `${input.value.slice(0, mine.at)}${input.value.slice(mine.at + 1)}`
                          typing.current[`${cardRef}:${f}`] = undone
                          onCell(cardRef, f, undone, cellGesture())
                          input.value = undone
                          input.focus()
                          input.setSelectionRange(mine.at, mine.at)
                          return closeBrace()
                        }
                        const at = input.selectionStart ?? input.value.length
                        const next = `${input.value.slice(0, at)}{${input.value.slice(at)}`
                        typing.current[`${cardRef}:${f}`] = next
                        onCell(cardRef, f, next, cellGesture())
                        input.value = next
                        input.focus()
                        input.setSelectionRange(at + 1, at + 1)
                        openBrace(cardRef, f, input, true)
                      }}
                    >
                      {'{ }'}
                    </button>
                  )}
                  </div>
                  {cellPicker(cardRef, f)}
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
      {/* What the table adds up to, under it rather than over it (#130). */}
      <CrownFoot>
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
        <p className="byd-data-sort" role="status">{sortLabel(sort, t)}</p>
      </CrownFoot>
      {library !== null && assetBase && (
        <PictureLibraryDialog
          target={library.kind === 'cell' ? t('library.target.card', { cardRef: library.cardRef, field: library.field }) : t('library.target.cards', { n: chosen.length, field: library.field })}
          count={library.kind === 'cell' ? 1 : chosen.length}
          replacing={library.kind === 'cell' ? (isAssetRef(doc.rows.find((r) => r.id === library.cardRef)?.fields[library.field]) ? 1 : 0) : chosen.filter((r) => isAssetRef(r.fields[library.field])).length}
          pictures={pictures}
          assetBase={assetBase}
          onApply={(hash) => {
            // One change either way (L4, B4): a cell is one edit, and the marked cards are one
            // list of rows — the same door every other bulk change goes through, so a step back
            // takes all of them back at once.
            if (library.kind === 'cell') {
              onCell(library.cardRef, library.field, assetRef(hash))
              const name = pictureName(hash)
              setSaid(name === undefined ? t('table.library.done.one.unnamed', { cardRef: library.cardRef }) : t('table.library.done.one', { name, cardRef: library.cardRef }))
            } else {
              onReplaceRows(setColumn(doc.rows, chosenIds, library.field, assetRef(hash)))
              const name = pictureName(hash)
              setSaid(name === undefined ? t('table.library.done.other.unnamed', { n: chosen.length }) : t('table.library.done.other', { name, n: chosen.length }))
            }
            setLibrary(null)
          }}
          onClose={() => setLibrary(null)}
        />
      )}
    </div>
  )
}

// Body-cellen i tabellen (L39, #324). Cellen är bara ramen: taket, huvudet och skrivytan hör
// till `BodyCell`, och står med flit *inuti* `<td>` — `max-height` på en tabellcell hedras inte,
// en cell växer med sitt innehåll oavsett, vilket prototypen mätte som 101 px där 34 begärdes.
function BodyTd({
  field,
  cardRef,
  doc,
  row,
  t,
  was,
  picking,
  children,
  ...cell
}: Omit<BodyCellProps, 'label' | 'head' | 'value'> & {
  field: string
  cardRef: string
  doc: ProjectDoc
  row: ProjectRow['fields']
  t: T
  was: string | null
  picking: boolean
}) {
  const value = row[field]
  return (
    <td data-col={field} className={picking ? 'byd-data-picking' : undefined}>
      {was !== null && <s className="byd-data-was">{was}</s>}
      <BodyCell
        {...cell}
        label={`${cardRef} ${field}`}
        head={t('table.body.head', { field: fieldLabel(field, t), cardRef })}
        value={value === undefined || value === null ? '' : String(value)}
      >
        {children}
      </BodyCell>
    </td>
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
//
// The name and the way it sorts, and nothing else. The × that took the column away used to
// stand here too, out of the flow and over the heading's right-hand 44 px, because two tap
// targets do not fit in a column a number wide; it has moved to the head's own door, where the
// table already said something about its columns as columns (#46 on #32). What that buys is not
// tidiness: it is the room a heading needs to be draggable and pullable at all.
// What a heading needs to be the handle its column is moved by (#46). Every one of them is the
// designer's except the two that are the tool's, and those get none of it: a heading with no
// `carry` cannot be picked up and is not a place to put a column down either.
type Carry = {
  over: boolean
  onPickUp(): void
  onOver(event: DragEvent<HTMLElement>): void
  onDone(): void
  onDrop(): void
  onStep(dir: -1 | 1): void
}

// And what it needs to be the edge the column is pulled by (#46). The same columns have both: a
// heading is either the designer's to move and size or the tool's own, and never half of each.
type Pull = {
  onGrab(event: ReactPointerEvent<HTMLElement>): void
  onPull(event: ReactPointerEvent<HTMLElement>): void
  onLetGo(event: ReactPointerEvent<HTMLElement>): void
  // The drag taken back rather than let go of (#142): Escape, or a gesture the browser took away
  // from the page altogether. One answer for both, because they are the same thing happening —
  // the column goes back where the pull began and no width is written.
  onCallOff(): void
  onAuto(): void
  onStep(dir: -1 | 1): void
}

function SortableHeader({ field, label, sort, onSort, carry, pull, prose }: { field: string; label: string; sort: SortState | null; onSort(next: SortState | null): void; carry?: Carry | undefined; pull?: Pull | undefined; prose?: Omit<ProseMarkProps, 'label' | 'open'> | undefined }) {
  const active = sort?.field === field ? sort.dir : null
  // Prosamärkets utfällning (L43, #362) hänger ur **rubriken** och inte ur pricken: pricken är
  // ingen kontroll — en 8 px knapp i en kolumn som är en siffra bred är precis det som fällde
  // variant A — så handtaget är hela rubriken. Pekaren och fokus var för sig, och utfällningen
  // framme så länge något av dem är kvar: aldrig bara det ena (#184, och #216 som inte får ta
  // tillbaka det). `shut` är Escape, som lägger ihop den utan att flytta handen eller fokus.
  const [near, setNear] = useState(false)
  const [held, setHeld] = useState(false)
  const [shut, setShut] = useState(false)
  const open = prose !== undefined && !shut && (near || held)
  return (
    <th
      data-col={field}
      // Utfällningen hänger ur rubriken och ska synas utanför den; ett huvud som klipper sitt
      // eget innehåll klipper den (#46, samma sak som `.byd-data-remove` redan säger om dörren).
      {...(prose ? { 'data-prose': open ? 'open' : '' } : {})}
      {...(prose
        ? {
            onPointerEnter: () => setNear(true),
            onPointerLeave: () => {
              setNear(false)
              setShut(false)
            },
            onFocus: () => setHeld(true),
            onBlur: (event: FocusEvent<HTMLTableCellElement>) => {
              if (event.currentTarget.contains(event.relatedTarget)) return
              setHeld(false)
              setShut(false)
            },
            onKeyDown: (event: KeyboardEvent<HTMLTableCellElement>) => {
              if (event.key !== 'Escape' || !open) return
              event.stopPropagation()
              setShut(true)
            },
          }
        : {})}
      aria-sort={active ?? 'none'}
      draggable={carry ? true : undefined}
      onDragStart={carry?.onPickUp}
      onDragOver={carry?.onOver}
      onDragEnd={carry?.onDone}
      onDrop={carry?.onDrop}
      {...(carry?.over ? { 'data-over': '' } : {})}
    >
      <button
        type="button"
        data-active={active !== null}
        onClick={() => onSort(nextSort(sort, field))}
        // Alt and an arrow move the column; the arrow alone is the reader's own, and a heading
        // that swallowed it would take the way out of the head away from her. The same pair the
        // template's layer list moves a layer with (#18), for the same reason: an order that can
        // only be dragged is an order a keyboard has lost.
        onKeyDown={(event) => {
          if (!event.altKey || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return
          const dir = event.key === 'ArrowLeft' ? -1 : 1
          // Alt alone moves the column; Alt and Shift pull its edge. Two things a heading can do
          // to the column it names, on the same hand and the same two keys.
          const answer = event.shiftKey ? pull?.onStep : carry?.onStep
          if (!answer) return
          event.preventDefault()
          answer(dir)
        }}
      >
        {label} <span aria-hidden="true">{active === 'ascending' ? '↑' : active === 'descending' ? '↓' : '↕'}</span>
      </button>
      {/* Kolumnens märke (L43, #362). Pricken står efter rubrikens egen knapp, och utfällningens
          knappar efter den: en Tabb genom huvudet möter först vad kolumnen heter och sorteras på,
          och därefter — medan rubriken har fokus — sättet att vända vad den skrivs som. */}
      {prose && <ProseMark label={label} open={open} {...prose} />}
      {/* The edge the column is pulled by, and nothing a reader without a pointer has to step
          over: the keys do the same thing from the heading itself, and what a column was set to
          is read and given back in the head's own door. So it is out of the tab order and out of
          the tree a screen reader walks, which is what an affordance for a hand is. */}
      {pull && (
        <span
          className="byd-data-pull"
          aria-hidden="true"
          onPointerDown={pull.onGrab}
          onPointerMove={pull.onPull}
          onPointerUp={pull.onLetGo}
          onPointerCancel={pull.onCallOff}
          onDoubleClick={pull.onAuto}
          // The edge stands inside a heading the browser will carry off if a hand presses and
          // moves: starting a drag is the default action of a press, and a press on the edge is a
          // press on the heading. Measured in Chromium, a press on the edge fires `dragstart` on
          // the heading, so every pull in the width was also a drag in the order. Refusing the
          // default here is what stops it — and it has to be the mouse's press, because for a
          // mouse the drag does not hang from the pointer event.
          onMouseDown={(event) => event.preventDefault()}
        />
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
