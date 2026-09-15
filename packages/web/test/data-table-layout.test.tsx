// @vitest-environment jsdom
// The condition the prototype uncovered (#32), and the reason variant A could not be chosen out
// of hand: the form that makes a column must not make the head taller. In the prototype it did,
// and every heading beside it — `id`, `title`, `body`, `antal` — was pushed down while the
// designer typed, so the table jumped under her hands.
//
// jsdom lays nothing out, so this is measured in a real engine with the real stylesheet, the way
// the felt's labels and the phone's viewport are (#10, #20).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { useState } from 'react'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { chromium, type Browser } from 'playwright'
import { applyEdit } from '@byd/server/doc'
import { DataTable, columnsOutside, markCut } from '../src/editor/DataTable.js'
import { deckValues, fitColumns, markValues } from '../src/editor/columns.js'
import type { ProjectDoc } from '../src/editor/types.js'
import { translate, type T } from '../src/i18n/index.js'
import { projectDoc } from './project-doc.js'

// A surface mounted on its own speaks Swedish (A4), which is what the markup below is rendered in.
const sv: T = (key, params) => translate('sv', key, params)

// A table is its markup *and* what the deck holds, because since #46 the second is what decides
// how wide the first is drawn. Handing them round together is what keeps every measurement in this
// file taken against the layout the editor really ships: before, `markCut` was run on its own and
// every rectangle below was read off equal-width auto-layout columns — a table that has not
// existed since the widths were measured. The claims held; the geometry was somebody else's.
type Table = { html: string; deck: Record<string, string[]> }

// The editor's own two decisions, run on the page rather than described by the test, in the order
// it makes them.
const FIT = `(box, deck) => { (${String(fitColumns)})(box, deck); (${String(markValues)})(box) }`

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')

type Box = { x: number; y: number; w: number; h: number }
// `box` is the header cell; `ink` is the control the designer actually reads inside it, which is
// what a row grown taller moves even when the cell's own top stays where it was.
// `columns` is every cell of the head paired with the cell under it in the first card's row, in
// document order — the head's own class on each, so a drift can be named rather than counted.
type Column = { head: string; body: string | null; headBox: Box; bodyBox: Box | null }
type Head = { row: Box; headings: { name: string; box: Box; ink: Box }[]; door: Box | null; scroll: Box; firstRow: Box; columns: Column[] }

const VIEW = { w: 1280, h: 800 }

function Table({ doc: initial = projectDoc() }: { doc?: ProjectDoc }) {
  const [doc, setDoc] = useState(initial)
  return (
    <DataTable
      doc={doc}
      selectedRow={null}
      onSelectRow={() => undefined}
      onCell={() => undefined}
      onAddRow={() => undefined}
      onRemoveRow={() => undefined}
      onReplaceRows={(rows) => setDoc((current) => ({ ...current, rows }))}
      onAddField={(field) => setDoc((current) => applyEdit(current, { v: 'addField', field }))}
      onRemoveField={(field) => setDoc((current) => applyEdit(current, { v: 'removeField', field }))}
      onMoveField={() => undefined}
    />
  )
}

// The table's markup as it stands after `act`ing on it: closed, and with the form open and half a
// name typed into it — which is the moment the prototype's head grew.
async function markup(open: boolean): Promise<Table> {
  const user = userEvent.setup()
  const { container, unmount } = render(<Table />)
  if (open) {
    await user.click(screen.getByRole('button', { name: 'Kolumner' }))
    await user.type(screen.getByLabelText('Namn'), 'a')
  }
  const html = container.innerHTML
  unmount()
  return { html, deck: deckValues(projectDoc(), sv) }
}

let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser.close()
}, 60_000)

// The editor's own page with the table's markup dropped into it, and `extra` appended after the
// editor's own stylesheet so a rule can be taken back for the control cases below.
const shellOf = (html: string, extra: string) =>
  read('index.html')
    .replace('<script type="module" src="/src/main.tsx"></script>', '')
    .replace('</head>', `<style>${read('src/editor/editor.css')}\n${read('src/buttons.css')}${extra}</style></head>`)
    .replace('<div id="root"></div>', `<div id="root"><div class="byd-editor" data-page="editor" data-mode="table"><main><div role="tabpanel">${html}</div></main></div></div>`)

async function measure({ html, deck }: Table, extra = ''): Promise<Head> {
  const page = await browser.newPage({ viewport: { width: VIEW.w, height: VIEW.h } })
  try {
    await page.setContent(shellOf(html, extra), { waitUntil: 'load' })
    return (await page.evaluate(({ deck, fit }) => {
      new Function('box', 'deck', `(${fit})(box, deck)`)(document.querySelector('.byd-data-scroll'), deck)
      const box = (el: Element | null): Box | null => {
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
      }
      // A heading that names itself is taken at its word: the pinned column's head says what the
      // × under it is for, and since #46 it also carries the + that makes a column, so the word
      // inside it is no longer the name of the column.
      const headings = [...document.querySelectorAll('.byd-data thead th')]
        .map((th) => ({ name: (th.getAttribute('aria-label') ?? th.querySelector('button')?.textContent ?? th.textContent ?? '').trim(), box: box(th)!, ink: box(th.querySelector('button') ?? th)! }))
        .filter((h) => h.name !== '')
      // A cell says which column it is by the class the table gives it; a heading with no class
      // of its own is named by the word in it, which is enough to read a mismatch by.
      const named = (cell: Element): string => cell.className.replace('byd-data-', '') || (cell.querySelector('button')?.textContent ?? cell.textContent ?? '').trim() || '(blank)'
      const heads = [...document.querySelectorAll('.byd-data thead th')]
      const bodies = [...(document.querySelector('.byd-data tbody tr')?.children ?? [])]
      return {
        row: box(document.querySelector('.byd-data thead tr'))!,
        headings,
        door: box(document.querySelector('.byd-columns')),
        scroll: box(document.querySelector('.byd-data-scroll'))!,
        firstRow: box(document.querySelector('.byd-data tbody tr'))!,
        columns: heads.map((th, i) => ({
          head: named(th),
          body: bodies[i] ? named(bodies[i]!) : null,
          headBox: box(th)!,
          bodyBox: box(bodies[i] ?? null),
        })),
      }
    }, { deck, fit: FIT })) as Head
  } finally {
    await page.close()
  }
}

describe("the head's own door for its columns (#32, #46)", () => {
  it('lies over the rows instead of growing the head, so no heading moves while it is being typed in', async () => {
    const [shut, open] = await Promise.all([measure(await markup(false)), measure(await markup(true))])

    // The guard is worth nothing if it is measuring nothing: the door is really on the page, and
    // it is taller than the head it hangs from — which is what would have pushed the row down.
    // It is taller still now that the columns are listed in it above the form (#46 on #32), so
    // the thing this guards against is larger than it was, not smaller.
    expect(open.door).not.toBeNull()
    expect(open.door!.h).toBeGreaterThan(open.row.h)
    expect(shut.door).toBeNull()
    expect(shut.headings.map((h) => h.name)).toEqual(['id ↕', 'title ↕', 'body ↕', 'antal ↕', 'Ta bort'])
    expect(open.headings.map((h) => h.name)).toEqual(shut.headings.map((h) => h.name))

    // The condition itself: the head is exactly as tall as it was, every heading cell stands
    // where it stood, every word inside one stands where it stood, and the first card has not
    // moved down the page.
    expect(open.row.h).toBe(shut.row.h)
    expect(open.headings.map((h) => h.box)).toEqual(shut.headings.map((h) => h.box))
    expect(open.headings.map((h) => h.ink.y)).toEqual(shut.headings.map((h) => h.ink.y))
    expect(open.firstRow.y).toBe(shut.firstRow.y)

    // It hangs from the cell it was opened from, over what is under it, and inside the box the
    // table scrolls in — it is not a sheet that floats off somewhere else on the page.
    const cell = open.headings.at(-1)!.box
    expect(Math.abs(open.door!.y - (cell.y + cell.h))).toBeLessThanOrEqual(2)
    expect(open.door!.y).toBeLessThan(open.firstRow.y + open.firstRow.h)
    expect(open.door!.x + open.door!.w).toBeLessThanOrEqual(open.scroll.x + open.scroll.w + 1)
  }, 60_000)

  it('is a real condition and not a rule that cannot be broken: in the flow, the head does grow', async () => {
    // The same markup with one property taken back — the door standing in the cell instead of
    // over the rows — is the prototype that was rejected. If this passed too, the pair above
    // would be measuring the browser rather than the stylesheet.
    const html = await markup(true)
    const [held, inFlow] = await Promise.all([measure(html), measure(html, '.byd-columns { position: static; }')])

    expect(inFlow.row.h).toBeGreaterThan(held.row.h)
    // And that is exactly the fault the prototype had: every heading beside it is pushed down,
    // and so is the first card.
    const pushed = inFlow.headings.filter((h, i) => h.ink.y > held.headings[i]!.ink.y)
    expect(pushed.map((h) => h.name)).toEqual(['id ↕', 'title ↕', 'body ↕', 'antal ↕'])
    expect(inFlow.firstRow.y).toBeGreaterThan(held.firstRow.y)
  }, 60_000)
})

// The head grew a column in #32 and the body did not, which no test could see: both guards above
// measure the head against itself, and the tests that read the table's markup count headings or
// find a cell by its label. Nothing compared a heading to the cell standing under it.
//
// So every card's row ended one `<td>` short of the head. A table with more headings than cells is
// still a legal table — the browser lays the columns out and the row simply stops early — and what
// the designer saw was the pinned × sitting under the wrong heading, at the wrong width, with a
// phantom empty column after it. The column it was sitting under has since gone: the button that
// makes a column moved into the head of the pinned column rather than bringing one of its own,
// because that one had nothing under it on any row (#46). The pairing is the fact, not the count.
describe('the head and the rows are the same table (#32)', () => {
  it('puts every card cell under the heading it belongs to, at the same width', async () => {
    const { columns } = await measure(await markup(false))

    // The head is the shape it is meant to be, named rather than counted, so this is not a guard
    // over a table without the cells in question.
    expect(columns.map((c) => c.head)).toEqual(['check', 'id ↕', 'title ↕', 'body ↕', 'antal ↕', 'remove'])

    // Nothing in the head stands over nothing.
    expect(columns.filter((c) => c.bodyBox === null).map((c) => c.head)).toEqual([])
    // And what stands under each heading is that heading's own column, in the same place and at
    // the same width. Position alone would not have caught it: the fault put a cell at the right
    // x with the wrong width.
    expect(columns.map((c) => ({ head: c.head, x: c.headBox.x, w: c.headBox.w }))).toEqual(
      columns.map((c) => ({ head: c.head, x: c.bodyBox!.x, w: c.bodyBox!.w })),
    )
    // The pinned column is where the fault showed: `--byd-tap` wide, in the head and in the row.
    expect(columns.at(-1)!.body).toBe('remove')
    expect(columns.at(-1)!.headBox.w).toBe(44)
    expect(columns.at(-1)!.bodyBox!.w).toBe(44)
  }, 60_000)

  it('is a condition that can fail: take one cell out of a row and the × slides under the wrong heading', async () => {
    // The same markup with one of the row's cells taken out of the layout is the table exactly as
    // #32 shipped it — a row one `<td>` short of the head. Which cell it is does not matter; what
    // matters is that everything after it moves up a column. If this passed too, the assertion
    // above would be measuring the browser rather than the markup.
    const html = await markup(false)
    const short = await measure(html, '.byd-data tbody .byd-data-id { display: none; }')

    // Every column from the missing cell on has drifted, and the head still has all of its own.
    const drift = short.columns.filter((c) => c.bodyBox === null || c.bodyBox.x !== c.headBox.x || c.bodyBox.w !== c.headBox.w)
    expect(drift.map((c) => c.head)).toEqual(['id ↕', 'title ↕', 'body ↕', 'antal ↕', 'remove'])

    // And the drift is the one that shipped: the × has slid a whole heading to the left, onto
    // `antal`, and taken that heading's width instead of a tap target's.
    const antal = short.columns.find((c) => c.head === 'antal ↕')!
    const remove = short.columns.find((c) => c.head === 'remove')!
    expect(remove.body).toBe('remove')
    expect(remove.bodyBox!.x).toBe(antal.headBox.x)
    expect(remove.bodyBox!.w).toBe(antal.headBox.w)
    expect(antal.headBox.w).toBeGreaterThan(44)
  }, 60_000)
})


// The pinned × lies over what scrolls under it, and no stylesheet can stop it: the content and the
// pin share one clipping rectangle, and the only way out — a pin outside the scroller — costs the
// sticky heading, which is not for sale (#53, and the measurements in its thread). So the overlap
// stays and is made legible instead. Two things have to be true of that: the table has to know
// when a column has run in under the pin, which is geometry; and the reader has to be able to see
// it, which is paint. Both are read in a real engine, off the boxes and off the pixels.
const FIELDS = 10

// A deck wide enough that the box scrolls sideways at 1280 — the only width at which the pin
// covers anything at all.
//
// Wide by its *headings* and not only by its values, because since #46 a long value no longer
// makes a wide column: a sentence gives its room back until it stands on its own heading, and ten
// columns of `fält1` squeezed onto theirs came to less than a desk is wide. What a column can
// never be pushed below is the word at the top of it, so that is what this deck is made of.
function wideDoc(): ProjectDoc {
  const doc = projectDoc()
  const extra = Object.fromEntries(Array.from({ length: FIELDS }, (_, i) => [`egenskap-nummer-${i + 1}`, `värde ${i + 1} som fortsätter förbi kanten`]))
  return { ...doc, rows: doc.rows.map((row) => ({ ...row, fields: { ...row.fields, ...extra } })) }
}

async function markupOf(doc: ProjectDoc): Promise<Table> {
  const { container, unmount } = render(<Table doc={doc} />)
  const html = container.innerHTML
  unmount()
  return { html, deck: deckValues(doc, sv) }
}

// The three places the box can be: where it opens, halfway along, and as far as it goes.
const WHERE = ['rest', 'mid', 'end'] as const
// A fourth place, which is not a fraction of the scroll but a question put to the page: where is
// a column's × actually standing in the fade? That depends on how wide the headings come out, and
// a heading is as wide as its typeface makes it — so it is worked out on the page rather than
// written down here, where it would only ever be true on the machine it was written on.
const PLACES = [...WHERE, 'veil'] as const
type Place = (typeof PLACES)[number]

// What the pin is standing on at one scroll position. `under` is every column whose box overlaps
// the pin's at all, with how many of its pixels are covered; `hit` is what a thumb aimed at the
// middle of the pin actually lands on, which is the whole of #17; `strip` is a picture of the
// last 40 px in front of the pin — the ground a value has to cross to go under it.
//
// That strip runs from the top of the box, so it takes in the head and the rows at once. The head
// is a different kind of ground from a row: a row holds a value, the head holds the word a column
// is called and the control that sorts by it. So the same 40 px are also taken twice over, banded
// by row — `headStrip` across the heading row, `bodyStrip` across the first card's row — and
// `veiled` says which of the head's own controls are standing in the 24 px the fade covers, so a
// comparison over the head cannot pass by pointing at empty ground.
type Shot = {
  cut: string | null
  scrollLeft: number
  left: number
  pin: Box
  box: Box
  under: { name: string; px: number }[]
  hit: string
  strip: Buffer
  headStrip: Buffer
  bodyStrip: Buffer
  veiled: { field: string; px: number }[]
  // Every column of the head, in order, at the width it was drawn, and whether the table is laid
  // out on the widths it was told or on what the browser could guess. Read so this file can say
  // out loud which table it is measuring: `markCut` used to be run here on its own, and every
  // rectangle below was taken off a table the editor has not drawn since #46.
  heads: number[]
  told: boolean
}

// One page, scrolled to each of the three places in turn, so a stylesheet costs one browser page
// rather than three. `extra` is appended after the editor's own, which is how the cue is taken
// back for the control cases below.
async function pinned({ html, deck }: Table, extra = ''): Promise<Record<Place, Shot>> {
  const page = await browser.newPage({ viewport: { width: VIEW.w, height: VIEW.h } })
  try {
    await page.setContent(shellOf(html, extra), { waitUntil: 'load' })
    // The widths first, once, before anything is scrolled or photographed: where the pin falls and
    // what runs under it are facts about the table as it is drawn, and since #46 that is a table
    // whose columns are as wide as what stands in them.
    await page.evaluate(({ deck, fit }) => new Function('box', 'deck', `(${fit})(box, deck)`)(document.querySelector('.byd-data-scroll'), deck), { deck, fit: FIT })
    const out = {} as Record<Place, Shot>
    for (const where of PLACES) {
      const facts = await page.evaluate(
        ({ where, decide }) => {
          const scroll = document.querySelector('.byd-data-scroll') as HTMLElement
          const far = scroll.scrollWidth - scroll.clientWidth
          if (where === 'veil') {
            // Scroll until the first × that can reach the fade has its right edge 12 px in front
            // of the pin. The pin is sticky, so its left edge does not move while this is decided.
            scroll.scrollLeft = 0
            const front = (scroll.querySelector('thead .byd-data-remove') as HTMLElement).getBoundingClientRect().left
            const reach = [...scroll.querySelectorAll('thead .byd-data-dropfield')]
              .map((drop) => Math.round(drop.getBoundingClientRect().right - (front - 12)))
              .find((delta) => delta > 0 && delta <= far)
            scroll.scrollLeft = reach ?? Math.round(far / 2)
          } else scroll.scrollLeft = where === 'rest' ? 0 : where === 'mid' ? Math.round(far / 2) : far
          // The editor's own decision, run on the page rather than described by the test.
          new Function('box', `(${decide})(box)`)(scroll)
          const round = (r: DOMRect): Box => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) })
          const pin = scroll.querySelector('thead .byd-data-remove') as HTMLElement
          const over = pin.getBoundingClientRect()
          const box = scroll.getBoundingClientRect()
          const under = [...scroll.querySelectorAll('thead > tr > *')]
            .filter((cell) => cell !== pin)
            .map((cell) => {
              const seen = cell.getBoundingClientRect()
              return { name: cell.className.replace('byd-data-', '') || (cell.textContent ?? '').trim(), px: Math.round(Math.min(seen.right, over.right) - Math.max(seen.left, over.left)) }
            })
            .filter((c) => c.px > 0)
          // The × of the first card, and what the browser finds at the middle of it.
          const row = (scroll.querySelector('tbody tr .byd-data-remove') as HTMLElement).getBoundingClientRect()
          const at = document.elementFromPoint(row.left + row.width / 2, row.top + row.height / 2)
          // The two rows the same ground is read across, and the controls standing in the fade.
          const headRow = (scroll.querySelector('thead > tr') as HTMLElement).getBoundingClientRect()
          const bodyRow = (scroll.querySelector('tbody > tr') as HTMLElement).getBoundingClientRect()
          const veiled = [...scroll.querySelectorAll('thead th[data-col] > button')]
            .map((drop) => {
              const seen = drop.getBoundingClientRect()
              return {
                field: (drop.textContent ?? '').trim(),
                px: Math.round(Math.min(seen.right, over.left) - Math.max(seen.left, over.left - 24)),
              }
            })
            .filter((c) => c.px > 0)
          return {
            cut: scroll.getAttribute('data-cut'),
            heads: [...scroll.querySelectorAll('thead > tr > *')].map((th) => Math.round(th.getBoundingClientRect().width)),
            told: getComputedStyle(scroll.querySelector('table.byd-data') as HTMLElement).tableLayout === 'fixed',
            scrollLeft: Math.round(scroll.scrollLeft),
            left: Math.round(far - scroll.scrollLeft),
            pin: round(over),
            box: round(box),
            under,
            veiled,
            hit: `${at?.tagName ?? '(nothing)'} in ${at?.closest('td, th')?.className ?? '(no cell)'}`,
            clip: { x: over.left - 40, y: box.top, width: 40, height: Math.min(box.height, 420) },
            headClip: { x: over.left - 40, y: headRow.top, width: 40, height: headRow.height },
            bodyClip: { x: over.left - 40, y: bodyRow.top, width: 40, height: bodyRow.height },
          }
        },
        { where, decide: String(markCut) },
      )
      const { clip, headClip, bodyClip, ...rest } = facts
      out[where] = {
        ...rest,
        strip: await page.screenshot({ clip }),
        headStrip: await page.screenshot({ clip: headClip }),
        bodyStrip: await page.screenshot({ clip: bodyClip }),
      }
    }
    return out
  } finally {
    await page.close()
  }
}

// Which columns are standing outside the box altogether, at each place along the scroll. A
// separate question from the pin's: the pin's is about a value crossing under a control, and this
// one is about a column a reader cannot see at all — the thing that happens after a width is
// pulled, and the thing the table said nothing about.
async function outsideAt({ html, deck }: Table): Promise<Record<'rest' | 'end', { left: string[]; right: string[]; wider: boolean }>> {
  const page = await browser.newPage({ viewport: { width: VIEW.w, height: VIEW.h } })
  try {
    await page.setContent(shellOf(html, ''), { waitUntil: 'load' })
    await page.evaluate(({ deck, fit }) => new Function('box', 'deck', `(${fit})(box, deck)`)(document.querySelector('.byd-data-scroll'), deck), { deck, fit: FIT })
    return (await page.evaluate(({ decide }) => {
      const scroll = document.querySelector('.byd-data-scroll') as HTMLElement
      const far = scroll.scrollWidth - scroll.clientWidth
      const ask = () => ({
        ...(new Function('box', `return (${decide})(box)`)(scroll) as { left: string[]; right: string[] }),
        wider: scroll.scrollWidth > scroll.clientWidth,
      })
      scroll.scrollLeft = 0
      const rest = ask()
      scroll.scrollLeft = far
      return { rest, end: ask() }
    }, { decide: String(columnsOutside) })) as Record<'rest' | 'end', { left: string[]; right: string[]; wider: boolean }>
  } finally {
    await page.close()
  }
}

describe('the columns standing outside the box (#46)', () => {
  it('names the ones that cannot be read, on the side they went out', async () => {
    const wide = await outsideAt(await markupOf(wideDoc()))

    // The deck really is wider than the window, which is the case this is about.
    expect(wide.rest.wider).toBe(true)
    // Where the box opens nothing has gone out to the left, and what is out to the right is named
    // — every column of the deck the reader cannot see, in the order the head stands in.
    expect(wide.rest.left).toEqual([])
    expect(wide.rest.right.length).toBeGreaterThan(0)
    expect(wide.rest.right).toContain('antal')
    // And at the far end of the scroll it is the other way round: what was out to the right has
    // come home, and the head's first columns have gone out to the left.
    expect(wide.end.right).toEqual([])
    expect(wide.end.left).toContain('title')
    // Nothing is named twice, and nothing is named on both sides.
    expect(new Set([...wide.end.left, ...wide.end.right]).size).toBe(wide.end.left.length + wide.end.right.length)
  }, 60_000)

  it('names none at all when the whole table fits in its box', async () => {
    const fits = await outsideAt(await markupOf(projectDoc()))
    expect(fits.rest.wider).toBe(false)
    expect(fits.rest).toMatchObject({ left: [], right: [] })
    expect(fits.end).toMatchObject({ left: [], right: [] })
  }, 60_000)
})

describe('a column running in under the pinned × (#53)', () => {
  it('is something the table knows about, all the way along the scroll except at the very end of it', async () => {
    const at = await pinned(await markupOf(wideDoc()))

    // And this is the table the editor draws, not the one the browser would have guessed: the
    // widths were measured and told to it, which is the only way a `<col>` binds at all. Nothing
    // below means what it says without this line — the rectangles it reads were taken off an
    // auto-laid-out table until now.
    expect(at.rest.told).toBe(true)
    const deck = at.rest.heads.slice(2, -1)
    expect(deck.length).toBeGreaterThan(FIELDS)
    expect(new Set(deck).size).toBeGreaterThan(1)

    // The guard is worth nothing if the box does not scroll: there is somewhere to go at rest,
    // half of it left in the middle, and nowhere at the end.
    expect(at.rest.scrollLeft).toBe(0)
    expect(at.rest.left).toBeGreaterThan(100)
    expect(at.mid.scrollLeft).toBeGreaterThan(0)
    expect(at.end.left).toBe(0)

    // The fault itself, read off the boxes: while there is anywhere left to scroll a column
    // really is under the pin, and at the end of the scroll none is.
    expect(at.rest.under.length).toBeGreaterThan(0)
    expect(at.mid.under.length).toBeGreaterThan(0)
    expect(at.end.under).toEqual([])
    expect(WHERE.map((w) => at[w]!.cut)).toEqual(['true', 'true', 'false'])
  }, 60_000)

  it("never costs the pin itself: the × stands at the box's edge and takes the tap at every scroll position (#17)", async () => {
    const at = await pinned(await markupOf(wideDoc()))

    // One box, in one place, a tap wide, flush with the right edge of the box that scrolls —
    // whatever the scroll is doing and whatever the cue is doing.
    expect(WHERE.map((w) => at[w]!.pin)).toEqual([at.rest.pin, at.rest.pin, at.rest.pin])
    expect(at.rest.pin.w).toBe(44)
    expect(WHERE.map((w) => at[w]!.pin.x + at[w]!.pin.w)).toEqual(WHERE.map((w) => at[w]!.box.x + at[w]!.box.w))
    // And a thumb aimed at the middle of a card's × lands on that button, not on what is under it.
    expect(WHERE.map((w) => at[w]!.hit)).toEqual(Array(3).fill('BUTTON in byd-data-remove'))
  }, 60_000)

  it("is not what a narrow table does: with the fixture's four fields nothing is under the pin", async () => {
    const at = await pinned(await markupOf(projectDoc()))

    // The table fits, so there is nowhere to scroll and nothing to cover — and nothing is marked.
    expect(WHERE.map((w) => at[w]!.left)).toEqual([0, 0, 0])
    expect(WHERE.map((w) => at[w]!.under)).toEqual([[], [], []])
    expect(WHERE.map((w) => at[w]!.cut)).toEqual(['false', 'false', 'false'])
  }, 60_000)
})

// Whether the cue is really drawn is read the way the felt reads its ellipsis (join-layout): the
// ground in front of the pin is painted twice — once as the stylesheet leaves it, once with the
// cue's own property forced the other way — and the two pictures are compared. A fade that is
// really painted shows up as a difference; one the stylesheet only asks for does not.
// Nothing in the head hides itself any more: the × that took a column away was the one control
// there that appeared on a pointer, and it has moved to the head's own door (#46 on #32). What
// stands in the heading stands there always, so there is no state to force it into.
const SHOWING = ''
const FORCED = {
  off: '.byd-data .byd-data-remove::before { opacity: 0 !important; }',
  on: '.byd-data .byd-data-remove::before { opacity: 1 !important; }',
  // The same fade laid over the heading row as well, which is the thing the head is spared. It is
  // here so that "the head is painted the same either way" can be shown to be a fact about the
  // head rather than a fact about two pictures of nothing.
  head: '.byd-data thead .byd-data-remove::before { content: ""; position: absolute; top: 0; bottom: 1px; right: 100%; width: 24px; background: linear-gradient(to left, #1b1d23, rgb(27 29 35 / 0%)); opacity: 1; }',
}

describe('what says a value is still going under the pinned × (#53)', () => {
  it('is painted in front of the pin while a column is cut, and is gone at the end of the scroll', async () => {
    const [shown, off, on] = await Promise.all([
      pinned(await markupOf(wideDoc())),
      pinned(await markupOf(wideDoc()), FORCED.off),
      pinned(await markupOf(wideDoc()), FORCED.on),
    ])

    // The control really can paint: forced on and forced off are two different pictures wherever
    // the box stands. Without this, every comparison below could pass by painting nothing at all.
    expect(WHERE.map((w) => on[w]!.strip.equals(off[w]!.strip))).toEqual([false, false, false])

    // The cue itself: while a column is under the pin, the ground in front of the pin is painted
    // differently from the same ground with the fade taken back.
    expect(shown.rest.strip.equals(off.rest.strip)).toBe(false)
    expect(shown.mid.strip.equals(off.mid.strip)).toBe(false)
    // And at the end of the scroll, where nothing is under the pin, nothing extra is painted:
    // the shipped picture is the picture with the cue taken away, pixel for pixel.
    expect(shown.end.strip.equals(off.end.strip)).toBe(true)
  }, 60_000)

  // The cue is about values that are cut. A heading is not a value: it holds a short field name
  // and, next to it, the × that takes the whole column away. Dimming that × would trade contrast
  // on a destructive control for a hint about a word that was never going to run long — a worse
  // fault than the one the fade was drawn to fix, and against what the editor holds its controls
  // to (editor-contrast, docs/UX-KONTROLLER.md). So the head is deliberately left uncued, and the
  // same 40 px are read twice: across the heading row nothing extra may be painted, across the
  // first card's row the fade must still be there.
  //
  // What the head holds in front of the pin is now the column's own name and the arrow that says
  // how it sorts — the × moved to the head's own door (#46 on #32) — and the question is the same
  // one: the cue may not dim it. A control that is always drawn is easier to ask about than one
  // that had to be revealed first, which is the one thing this test lost and does not miss.
  it('leaves the head alone: while the cue is on, the heading in front of the pin is painted exactly as it is with the cue taken away', async () => {
    const [shown, off, over] = await Promise.all([
      pinned(await markupOf(wideDoc()), SHOWING),
      pinned(await markupOf(wideDoc()), `${SHOWING}${FORCED.off}`),
      pinned(await markupOf(wideDoc()), `${SHOWING}${FORCED.head}`),
    ])

    // The head really is the ground being read: at the place worked out for it, a heading's own
    // control is standing inside the 24 px the fade covers, with the cue on. Which scroll
    // position that is was once assumed to be rest and halfway along; it is on a Mac and it is
    // not on the Linux runner, because the headings are not the same width there.
    expect(shown.veil.veiled.length).toBeGreaterThan(0)
    expect(shown.veil.veiled.every((c) => c.px > 0)).toBe(true)
    expect(shown.veil.cut).toBe('true')
    // Both pictures are taken at the same moment: the cue is a paint, not a layout, so taking it
    // back may not move anything — and if it ever did, the two would part here first.
    expect(shown.veil.scrollLeft).toBe(off.veil.scrollLeft)
    // And the head is ground that a fade would really show up on: laid over the heading row as
    // well, the same fade makes a different picture there. Without this the three comparisons
    // below could agree by being two pictures of an empty strip.
    expect(over.veil.headStrip.equals(off.veil.headStrip)).toBe(false)

    // The condition: the heading row in front of the pin is the same picture with the cue on as
    // with it taken back — the heading keeps every bit of the contrast it was measured at.
    expect(shown.veil.headStrip.equals(off.veil.headStrip)).toBe(true)
    expect(shown.rest.headStrip.equals(off.rest.headStrip)).toBe(true)
    expect(shown.mid.headStrip.equals(off.mid.headStrip)).toBe(true)

    // And it is not bought by taking the cue away: the first card's row, over the same 40 px and
    // at the same moment, is still painted differently from the ground with the fade taken back.
    expect(shown.veil.bodyStrip.equals(off.veil.bodyStrip)).toBe(false)
    expect(shown.rest.bodyStrip.equals(off.rest.bodyStrip)).toBe(false)
    expect(shown.mid.bodyStrip.equals(off.mid.bodyStrip)).toBe(false)
  }, 60_000)

  it('says nothing about a table that fits: with four fields the ground in front of the pin is the bare ground', async () => {
    const [shown, off] = await Promise.all([pinned(await markupOf(projectDoc())), pinned(await markupOf(projectDoc()), FORCED.off)])

    expect(WHERE.map((w) => shown[w]!.strip.equals(off[w]!.strip))).toEqual([true, true, true])
  }, 60_000)
})

// The sticky heading is what every nested design would have cost, and it is the thing the
// narrowed issue refused to pay for (#53). So it is measured beside the cue rather than taken on
// trust: a deck long enough to scroll down and wide enough for the cue to be on, scrolled both
// ways at once.
async function scrolled({ html, deck }: Table): Promise<{ head: Box; box: Box; first: string; cut: string | null; pin: Box }> {
  const page = await browser.newPage({ viewport: { width: VIEW.w, height: VIEW.h } })
  try {
    await page.setContent(shellOf(html, ''), { waitUntil: 'load' })
    return await page.evaluate(({ decide, deck, fit }) => {
      const scroll = document.querySelector('.byd-data-scroll') as HTMLElement
      new Function('box', 'deck', `(${fit})(box, deck)`)(scroll, deck)
      scroll.scrollTop = 300
      scroll.scrollLeft = Math.round((scroll.scrollWidth - scroll.clientWidth) / 2)
      new Function('box', `(${decide})(box)`)(scroll)
      const round = (r: DOMRect): Box => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) })
      const at = document.elementFromPoint(scroll.getBoundingClientRect().x + 60, scroll.getBoundingClientRect().y + 200)
      return {
        head: round((document.querySelector('.byd-data thead tr th') as HTMLElement).getBoundingClientRect()),
        box: round(scroll.getBoundingClientRect()),
        // Which card is standing 200 px down the box, which says the rows really did move.
        first: at?.closest('tr')?.querySelector('.byd-data-id')?.textContent ?? '(none)',
        cut: scroll.getAttribute('data-cut'),
        pin: round((scroll.querySelector('thead .byd-data-remove') as HTMLElement).getBoundingClientRect()),
      }
    }, { decide: String(markCut), deck, fit: FIT })
  } finally {
    await page.close()
  }
}

describe('the head of a table that is being scrolled both ways (#53 on #17)', () => {
  it('stays at the top of the box while the cue is on, which is the whole reason the overlap was kept', async () => {
    const wide = wideDoc()
    const deck: ProjectDoc = { ...wide, rows: Array.from({ length: 40 }, (_, i) => ({ id: `kort-${i + 1}`, fields: { ...wide.rows[0]!.fields, title: `Kort ${i + 1}` } })) }
    const at = await scrolled(await markupOf(deck))

    // The box really was scrolled down: the card at the top of it is not the first card of the
    // deck any more.
    expect(at.first).not.toBe('kort-1')
    expect(at.first).toMatch(/^kort-\d+$/)
    // The head has not gone with them: it stands at the top of the box, which is what
    // `position: sticky; top: 0` is for and what no nested scroller could have kept.
    expect(at.head.y).toBe(at.box.y)
    // And across the other axis, at the same moment: the pin is at the box's right edge and the
    // cue is on.
    expect(at.pin.x + at.pin.w).toBe(at.box.x + at.box.w)
    expect(at.cut).toBe('true')
  }, 60_000)
})

// Scrolling is not the only thing that puts a column under the pin. A window pulled narrower
// moves the pin; a field added or taken away moves every column after it. Neither is a scroll, so
// neither would ever be heard by a scroll listener — and a cue that only listened for scrolls
// would go on saying whatever it last said. jsdom lays nothing out, so the boxes are given to it
// and the sizes are the fact under test; what is being measured is that the table asks again.
type Rect = { left: number; right: number }

function withBoxes(boxes: Map<Element, Rect>): () => void {
  const real = Element.prototype.getBoundingClientRect
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const at = boxes.get(this) ?? { left: 0, right: 0 }
    return { x: at.left, y: 0, left: at.left, right: at.right, top: 0, bottom: 0, width: at.right - at.left, height: 0, toJSON: () => ({}) } as DOMRect
  }
  return () => {
    Element.prototype.getBoundingClientRect = real
  }
}

describe('a table that stops being the size it was (#53)', () => {
  it('is asked again, because a field added or a window narrowed moves a column under the pin as surely as a scroll does', async () => {
    const boxes = new Map<Element, Rect>()
    const restore = withBoxes(boxes)
    // jsdom has no ResizeObserver; it is given one that says what it was asked to watch and lets
    // the test be the thing that changed size.
    const watched: Element[] = []
    let wake: () => void = () => undefined
    class Stub {
      constructor(run: () => void) {
        wake = run
      }
      observe(el: Element) {
        watched.push(el)
      }
      disconnect() {
        watched.length = 0
      }
    }
    ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = Stub
    try {
      const { container } = render(<Table doc={wideDoc()} />)
      const scroll = container.querySelector('.byd-data-scroll')!
      const pin = container.querySelector('.byd-data thead .byd-data-remove')!
      const last = [...container.querySelectorAll('.byd-data thead > tr > *')].at(-3)!

      // Both boxes whose size can move a column under the pin are being watched: the one that
      // scrolls, and the table inside it.
      expect(watched).toEqual([scroll, container.querySelector('.byd-data')])

      // Nothing overlaps to begin with: the last column ends exactly where the pin begins.
      boxes.set(pin, { left: 1220, right: 1264 })
      boxes.set(last, { left: 1100, right: 1220 })
      wake()
      await waitFor(() => expect(scroll.getAttribute('data-cut')).toBe('false'))

      // Now the table is wider than it was — a field was added — and that column runs on past
      // the pin's edge without anything having been scrolled.
      boxes.set(last, { left: 1100, right: 1250 })
      wake()
      await waitFor(() => expect(scroll.getAttribute('data-cut')).toBe('true'))
    } finally {
      restore()
      delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver
    }
  }, 60_000)
})
