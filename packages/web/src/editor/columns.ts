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
  // And the lane the icon control stands in (#140), which is the cell's and not the field's. A
  // column that carries it has that much less room for its value, so it asks for that much more —
  // otherwise `typ` and `title` go straight back to `Play…` and `Sal's Sa…`, which is what #130
  // measured and fixed. Read off the page for the same reason the target is.
  const lane = parseFloat(getComputedStyle(table).getPropertyValue('--byd-data-rail')) || 0
  const hasLane = (i: number): boolean => table.querySelector(`tbody tr > *:nth-child(${i + 1})[data-rail]`) !== null

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
  // What a string is worth, remembered on the box it was measured in. Shaping text is the one
  // expensive thing this function does — five hundred cards over six columns is six thousand
  // calls, and the engine has to lay every glyph out to answer — while a narrower window, a
  // column made or taken away, and a character typed into one cell all leave nearly every value
  // of the deck exactly as it was. So a value is measured once and then recognised.
  //
  // Kept against the font and the padding it was measured with, because those are the only two
  // things that can make the same string a different width: a zoom, a theme, a stylesheet
  // reloaded in development. When either moves, everything is forgotten and measured again.
  const kept = box as unknown as { __bydInk?: { font: string; sides: number; of: Map<string, number> } }
  if (!kept.__bydInk || kept.__bydInk.font !== font || kept.__bydInk.sides !== sides) kept.__bydInk = { font, sides, of: new Map() }
  const seen = kept.__bydInk.of
  const need = (text: string): number => {
    const had = seen.get(text)
    if (had !== undefined) return had
    const asked = Math.ceil(drawn(text) + sides)
    seen.set(text, asked)
    return asked
  }

  // What a heading takes: everything standing in its flow, plus the cell's own padding. A control
  // that has been lifted out of the flow — the × that takes a column away — is not counted, which
  // is the whole reason a number column can be narrow at all. Two 44 px buttons on one line put
  // the floor at about 114 px however short the word above them is.
  //
  // What each of them takes is the widest of three answers, and the third is what keeps this from
  // depending on where the pointer happens to be resting: the sort control's box gives way to the
  // × while the column is pointed at (#46), so its drawn width is smaller then, and a floor read
  // off the drawn width alone would make the same heading two different sizes. Its own declared
  // minimum does not move, and asking the page for it keeps the number out of this file.
  const heads = Array.from(table.querySelectorAll('thead > tr > *')) as HTMLElement[]
  const headNeed = (i: number): number => {
    const th = heads[i]
    if (!th) return tap
    const own = getComputedStyle(th)
    let flow = 0
    for (const child of Array.from(th.children) as HTMLElement[]) {
      const how = getComputedStyle(child)
      if (how.position === 'absolute' || how.position === 'fixed' || how.display === 'none') continue
      flow += Math.max(child.getBoundingClientRect().width, child.scrollWidth, parseFloat(how.minWidth) || 0) + parseFloat(how.marginLeft) + parseFloat(how.marginRight)
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

  // One record per column of the table, in the order the head stands in. Every column is exactly
  // what it asks for, and nothing is handed round between them (#141).
  //
  // It used to be a pool: the sentences shared out whatever was over and gave back whatever was
  // missing, so the table always ended exactly where its box did. That bought a tidy right edge
  // with a drag that meant four things — pulling `typ` 150 px wider took 20 px off `id`, 18 off
  // `title`, 92 off `body` and 20 off `grupp`, none of which the hand had touched, and `title`
  // was already too narrow for its values before it lost any. L4 and #46 say the width is the
  // designer's, and a width that moves behind the back of the person who dragged is not hers.
  //
  // So the table is now as wide as its columns add up to, which may be wider than the box or
  // narrower. Wider is the case the pinned × was drawn for (#53); narrower simply ends where the
  // last column ends.
  type Track = { col: HTMLTableColElement; width: number; own: boolean }
  const tracks: Track[] = cols.map((col, i) => {
    const kind = col.getAttribute('data-kind') ?? 'text'
    if (kind === 'tap') return { col, width: tap, own: false }
    const name = col.getAttribute('data-col')
    // A width the designer set herself, if she has (#46). It is read off the column, beside what
    // the column is worth sizing like, because that is where the table already says everything
    // this function is allowed to know about a column. What the deck says it needs is not
    // consulted at all, which is the whole of what setting a width means. A value that no longer
    // fits says so in the cell, the way a value that does not fit always has.
    const own = parseFloat(col.getAttribute('data-width') ?? '')
    if (Number.isFinite(own) && own > 0) return { col, width: own, own: true }
    let widest = kind === 'image' ? imageNeed(i) : 0
    for (const value of (name && deck[name]) || []) widest = Math.max(widest, need(value))
    // The heading has no lane under it, so only the value's side of the question pays for one.
    return { col, width: Math.max(headNeed(i), widest + (hasLane(i) ? lane : 0)), own: false }
  })

  // And no measured column is drawn wider than the room it can show its own right edge in (#398).
  //
  // A column asks for what stands in it, and for a real rules text that is 1 684 px. Its own drag
  // edge then lands outside the box — the edge you take hold of *because* the column is too wide
  // is out of reach *because* it is too wide — and the only way left to a narrower column is a
  // keystroke nothing in the surface mentions, sixteen pixels at a time.
  //
  // The ceiling is measured against the room that is really visible, which is not the box: the
  // tick and `id` stand pinned on top of the column (#145) and eat into it, so a column exactly
  // the width of the box has its edge underneath them. What is pinned is asked of the stylesheet
  // rather than named here, for the same reason the target and the lane are.
  //
  // A width the designer pulled to herself is not touched. The ceiling is an opinion about a
  // measurement, and hers is not one (L4, #46): she can see the edge she dragged, because she
  // dragged it.
  const pinned = tracks.reduce((sum, track, i) => {
    const th = heads[i]
    if (!th) return sum
    const how = getComputedStyle(th)
    return how.position === 'sticky' && how.left !== 'auto' ? sum + track.width : sum
  }, 0)
  // A fingertip inside the box, so the edge is not under the scrollbar's thumb nor flush against
  // the next column's first character.
  const ceiling = room - pinned - tap
  for (const [i, track] of tracks.entries()) {
    if (track.own || track.width <= ceiling) continue
    // Never under what the heading itself needs: a column squeezed below its own name is not a
    // column anybody can read, and the floor is the same one every other answer here respects.
    track.width = Math.max(ceiling, headNeed(i))
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
  // Var det fastnålade slutar, sagt till stylesheetet (#401). Rubriken glider i sidled och stannar
  // just innanför bocken och `id`, och hur brett det är vet bara den här mätningen: `id` är mätt
  // mot sina värden som varje annan kolumn. Samma tal som taket ovan räknas mot, så de två kan
  // inte glida isär.
  table.style.setProperty('--byd-data-lane', `${pinned}px`)
  // And nothing else may have an opinion about it. The stylesheet's `min-width: 100%` was written
  // for the layout this replaced, where a table that could not see its own content had to be told
  // to fill the box; under a fixed layout it does not merely widen the table, it hands the
  // difference back out across every column, a number column as readily as a sentence. A deck with
  // a text column hides that entirely — the sentences take the slack until the total is the room
  // anyway — but a deck of nothing but numbers has nothing to absorb it, and every column stretches
  // in proportion. That is the issue's opening symptom, arrived at from the other end.
  table.style.minWidth = '0'
}

// Which values did not fit after all (#46).
//
// A separate question from the widths, and deliberately so, because it has a different answer at
// a different moment. A width is a fact about the deck and is measured when the deck changes;
// whether *this* value fits *this* column is a fact about a cell, and it is true or false again
// on every character the designer types — while the width she is typing inside must not move
// under her. So the widths are held still while a cell has the caret and this is not.
//
// It is asked of the browser rather than of a font, which is both cheaper and truer: since the
// field takes exactly the width of its column (#46) an input that has scrolled is an input whose
// value does not fit, and that is the same value the designer can see, including the half-written
// one that is not in the project yet. A cut is the exception once the widths are measured —
// nothing is cut at 1280 or at 1024 for six cards — but when it happens the cell has to say so,
// and the cell has to say it because the input cannot: `text-overflow` on an input goes silent
// the moment the cell takes focus, which is exactly when the designer is reading it.
//
// Deliberately one self-contained function with no imports, as `fitColumns` and `markCut` are:
// the browser test runs this very function inside the page, so what is measured there is what
// ships.
export function markValues(box: Element): void {
  const table = box.querySelector('table.byd-data') as HTMLTableElement | null
  if (!table) return
  for (const cell of Array.from(table.querySelectorAll('tbody td[data-col]')) as HTMLTableCellElement[]) {
    // En body-cell (L39, #324) svarar på den andra axeln. Den bryter raden i stället för att
    // rulla i sidled, så den kan inte kapas åt höger; det som kan hamna utanför den är raderna
    // under taket. Uttoningen under kanten är cellens sätt att säga just det, och den ritas
    // därför bara här — jämt ritad lägger den sin gradient över underlängderna på en rad som
    // redan är hel, vilket är en signal som ljuger genom att alltid stå på.
    const body = cell.querySelector('.byd-data-body') as HTMLElement | null
    if (body) {
      cell.removeAttribute('data-cut')
      // En pixels slack: en radhöjd är sällan ett helt tal, och en avrundning åt fel håll är
      // inte en rad till under kanten.
      if (body.scrollHeight > body.clientHeight + 1) body.setAttribute('data-more', 'true')
      else body.removeAttribute('data-more')
      continue
    }
    const field = cell.querySelector('input:not([type=checkbox])') as HTMLInputElement | null
    const runs = field ? field.scrollWidth > field.clientWidth : cell.scrollWidth > cell.clientWidth
    if (runs) cell.setAttribute('data-cut', 'true')
    else cell.removeAttribute('data-cut')
  }
}

// How far the scrolling box should move under a drag that has reached its edge (#141).
//
// A column can be dragged wider than the window now, and without this it cannot: the pointer runs
// out where the window does, so the hand has to let go, scroll the box and catch the edge again —
// which is the one thing the drag was changed to make possible.
//
// Near the edge and not at it: a hand that has pushed a column out past the right-hand side is
// already at the last pixel it has, so the band has to start before that. Forty pixels is about a
// finger's width and is the number the issue names. Inside the band the step grows with how far in
// the hand is, so easing off slows the scroll rather than stopping it dead.
//
// It answers nought wherever there is nothing to scroll to, which is both edges of a table that
// fits its box and the far end of one that does not — otherwise a drag would keep asking for a
// scroll the box has already run out of, and the column would grow for nothing.
//
// Deliberately one self-contained function with no imports, as `fitColumns`, `markCut` and
// `columnsOutside` are: the browser test runs this very function inside the page, so what is
// measured there is what ships.
export function dragScroll(box: Element, clientX: number): number {
  const scroller = box as HTMLElement
  const room = scroller.scrollWidth - scroller.clientWidth
  if (room <= 0) return 0
  const at = scroller.getBoundingClientRect()
  const edge = 40
  const step = 24
  const past = clientX - (at.right - edge)
  if (past > 0) {
    // Nothing to ask for once the box is already at the end of what it has.
    const left = room - scroller.scrollLeft
    return left <= 0 ? 0 : Math.min(left, Math.ceil((Math.min(past, edge) / edge) * step))
  }
  const before = at.left + edge - clientX
  if (before > 0) {
    const left = scroller.scrollLeft
    return left <= 0 ? 0 : -Math.min(left, Math.ceil((Math.min(before, edge) / edge) * step))
  }
  return 0
}
