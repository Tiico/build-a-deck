import { ANTAL } from '@byd/server/doc'
import type { ProjectDoc } from './types.js'
import type { T } from '../i18n/index.js'
import { fieldsOf } from './fields.js'
import { columnKind } from './sorting.js'
import { imageFieldsOf } from './assets.js'
import { groupColumn, groupOfRow, ruleLabel } from './groups.js'

// The column the canvas's grouping adds to the table (#13). It is not a field of a card, so it
// has no name of its own to be keyed by; `#` cannot start a field name — `addField` folds a name
// down to letters, digits and hyphens — so nothing a designer writes can collide with this.
export const GROUP_COL = '#group'

// What a column has to be sized like. The first two are chrome and not values: a tick box and the
// × that removes a card are one tap wide and nothing else. `key` is measured like text but never
// grows: a card's id is a machine key, so room it does not need belongs to the sentences.
export type WidthKind = 'tap' | 'key' | 'text' | 'number' | 'image'

// Which of those a column of the deck is. `antal` is the engine's own count, and a column the
// designer filled with numbers sorts as numbers (#15) — so the same reading decides both, and a
// column of "3", "4", "varierar" is text here exactly as it is there.
export function widthKind(doc: ProjectDoc, field: string): WidthKind {
  if (imageFieldsOf(doc).includes(field)) return 'image'
  return columnKind(doc.rows, field)
}

// Every value the deck holds, by the column it stands in.
//
// Read off `doc.rows`, and deliberately never off the rows that happen to be on screen: sorting
// and filtering are views of the project and never touch it (L4), so a width taken from the view
// would jump with every character typed into the search box and shuffle the columns along with
// the rows. The deck is the deck whichever part of it is being looked at.
export function deckValues(doc: ProjectDoc, t: T): Record<string, string[]> {
  const out: Record<string, string[]> = { id: doc.rows.map((row) => row.id) }
  for (const field of fieldsOf(doc)) {
    // The same value the cell shows, including the count a card that never said one falls back
    // to — what is measured has to be what is drawn.
    out[field] = doc.rows.map((row) => {
      const value = row.fields[field]
      return value === undefined || value === null ? (field === ANTAL ? '1' : '') : String(value)
    })
  }
  const grouping = groupColumn(doc)
  if (grouping) {
    out[GROUP_COL] = doc.rows.map((row) => {
      const group = groupOfRow(doc, row)
      return group === null ? t('table.group.base') : ruleLabel(grouping, group)
    })
  }
  return out
}

// How wide each column of the card table has to be to show what stands in it (#46, variant B).
//
// This is the whole answer to the issue, and the reason it has to exist at all is the one thing
// the review could not see: **the browser never sees the content**. Every cell of the table is an
// `<input>`, and an input's intrinsic width is its `size` — twenty characters, whatever the value
// inside happens to be. The auto layout was therefore not guessing badly about a rules text; it
// had nothing whatever to guess from, which is why `art`, `title`, `body`, `cost` and `antal` all
// came out 193 px at 1280, to the pixel. No stylesheet can reach that. The values have to be
// measured against the font the cell is drawn in, and the width *told* to the table.
//
// Every column asks for its widest value. What is left over after that is shared among the
// columns that can use a sentence's worth of room — the text ones — in proportion to what they
// asked for, and what is missing is taken back from them the same way, never below what their own
// heading needs. A number column asks for a number's width and is never given a share of the
// rest, which is the whole difference from letting the registry's type decide: `title` and `body`
// are both text, and only what stands in them tells them apart.
//
// Nothing here is written down that the stylesheet already says. The font, the padding, the tap
// target and what a heading takes are all asked of the page, so this file cannot drift from
// `editor.css` — and what a heading needs is read off the heading itself rather than rebuilt from
// its label, which also means a control that has left the heading's flow costs the column nothing.
//
// Deliberately one self-contained function with no imports, exactly as `markCut` is: the browser
// test runs this very function inside the page, so what is measured there is what ships.
export function fitColumns(box: Element, deck: Record<string, readonly string[]>): void {
  const table = box.querySelector('table.byd-data') as HTMLTableElement | null
  if (!table) return
  const cols = Array.from(table.querySelectorAll('colgroup > col')) as HTMLTableColElement[]
  const room = box.clientWidth
  if (cols.length === 0 || room <= 0) return

  // The one target size the editor declares, asked of the page rather than repeated here.
  const tap = parseFloat(getComputedStyle(table).getPropertyValue('--byd-tap')) || 44

  // The font a value is actually drawn in, and the room around it, taken from a cell that is
  // really on the page. A deck with no cards has no cell to ask, and also nothing to measure.
  const probe = table.querySelector('tbody input:not([type=checkbox])') as HTMLElement | null
  const ink = probe ? getComputedStyle(probe) : null
  const font = ink ? `${ink.fontStyle} ${ink.fontWeight} ${ink.fontSize} ${ink.fontFamily}` : '12px system-ui, sans-serif'
  // The cell's own padding, plus the two pixels a caret standing after the last character needs.
  const sides = (ink ? parseFloat(ink.paddingLeft) + parseFloat(ink.paddingRight) : 20) + 3

  const paper = document.createElement('canvas').getContext('2d')
  const drawn = (text: string): number => {
    if (!paper) return text.length * 7
    paper.font = font
    return paper.measureText(text).width
  }
  const need = (text: string): number => Math.ceil(drawn(text) + sides)

  // What a heading takes: everything standing in its flow, plus the cell's own padding. A control
  // that has been lifted out of the flow — the × that takes a column away — is not counted, which
  // is the whole reason a number column can be narrow at all. Two 44 px buttons on one line put
  // the floor at about 114 px however short the word above them is.
  const heads = Array.from(table.querySelectorAll('thead > tr > *')) as HTMLElement[]
  const headNeed = (i: number): number => {
    const th = heads[i]
    if (!th) return tap
    const own = getComputedStyle(th)
    let flow = 0
    for (const child of Array.from(th.children) as HTMLElement[]) {
      const how = getComputedStyle(child)
      if (how.position === 'absolute' || how.position === 'fixed' || how.display === 'none') continue
      flow += Math.max(child.getBoundingClientRect().width, child.scrollWidth) + parseFloat(how.marginLeft) + parseFloat(how.marginRight)
    }
    return Math.ceil(flow + parseFloat(own.paddingLeft) + parseFloat(own.paddingRight))
  }

  // An image cell is the one cell that is not a value: a thumbnail with a place to drop, a button
  // to choose and a × to clear, all of them boxes the browser can already size. So it is measured
  // as a box and not against a font.
  const imageNeed = (i: number): number => {
    const cell = table.querySelector(`tbody tr > *:nth-child(${i + 1}) .byd-data-drop`) as HTMLElement | null
    if (!cell) return 0
    let flow = 0
    for (const child of Array.from(cell.children) as HTMLElement[]) flow += Math.max(child.getBoundingClientRect().width, child.scrollWidth)
    const own = getComputedStyle(cell)
    const gaps = (parseFloat(own.columnGap) || 0) * Math.max(0, cell.children.length - 1)
    return Math.ceil(flow + gaps + parseFloat(own.paddingLeft) + parseFloat(own.paddingRight) + 24)
  }

  // One record per column of the table, in the order the head stands in. Every column is paid
  // what it asks for; only a column of sentences can be paid more or less than that.
  type Track = { col: HTMLTableColElement; floor: number; asked: number; gives: boolean; width: number }
  const tracks: Track[] = cols.map((col, i) => {
    const kind = col.getAttribute('data-kind') ?? 'text'
    if (kind === 'tap') return { col, floor: tap, asked: tap, gives: false, width: tap }
    const under = headNeed(i)
    const name = col.getAttribute('data-col')
    let widest = kind === 'image' ? imageNeed(i) : 0
    for (const value of (name && deck[name]) || []) widest = Math.max(widest, need(value))
    const asked = Math.max(under, widest)
    // Only a column of sentences gives and takes. A number is as wide as a number however much
    // room is going spare, and a card's id is a machine key and not prose.
    return { col, floor: under, asked, gives: kind === 'text', width: asked }
  })

  // Handing out what is over, or taking back what is missing, in proportion to what was asked
  // for. The narrowest goes first, so a column pushed down onto its own floor leaves the ones
  // behind it a true share of what is still left rather than a promise already spent. Nothing
  // falls below what its own heading needs; when every one of them is on its floor and the room
  // has still run out, the table is wider than the box and the box scrolls, which is the honest
  // answer and the case the pinned × was drawn for (#53).
  const gives = tracks.filter((track) => track.gives)
  let left = room - tracks.reduce((sum, track) => sum + track.asked, 0)
  let pool = gives.reduce((sum, track) => sum + track.asked, 0)
  if (pool > 0 && left !== 0) {
    for (const track of [...gives].sort((a, b) => a.asked - b.asked)) {
      track.width = Math.max(track.floor, track.asked + Math.round((left * track.asked) / pool))
      left -= track.width - track.asked
      pool -= track.asked
    }
  }

  // Said to the table, because saying it to the cells would be saying it to an `<input>` again.
  // A fixed layout is what makes a `<col>` width binding at all, and the table's own width is the
  // sum of the columns: that is what makes the row end where the last field ends.
  let total = 0
  for (const track of tracks) {
    track.col.style.width = `${track.width}px`
    total += track.width
  }
  table.style.tableLayout = 'fixed'
  table.style.width = `${total}px`

  // And which values did not fit after all. A cut is the exception once the widths are measured —
  // nothing is cut at 1280 or at 1024 for six cards — but when it happens the cell has to say so,
  // and the cell has to say it because the input cannot: `text-overflow` on an input goes silent
  // the moment the cell takes focus, which is exactly when the designer is reading it.
  for (const cell of Array.from(table.querySelectorAll('tbody td[data-col]')) as HTMLTableCellElement[]) {
    const field = cell.querySelector('input:not([type=checkbox])') as HTMLInputElement | null
    const value = field ? field.value : (cell.textContent ?? '')
    const track = tracks[cell.cellIndex]
    if (!track) continue
    if (need(value) > track.width) cell.setAttribute('data-cut', 'true')
    else cell.removeAttribute('data-cut')
  }
}
