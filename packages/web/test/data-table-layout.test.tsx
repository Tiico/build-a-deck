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
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { chromium, type Browser } from 'playwright'
import { applyEdit } from '@byd/server/doc'
import { DataTable, markCut } from '../src/editor/DataTable.js'
import type { ProjectDoc } from '../src/editor/types.js'
import { projectDoc } from './project-doc.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')

type Box = { x: number; y: number; w: number; h: number }
// `box` is the header cell; `ink` is the control the designer actually reads inside it, which is
// what a row grown taller moves even when the cell's own top stays where it was.
// `columns` is every cell of the head paired with the cell under it in the first card's row, in
// document order — the head's own class on each, so a drift can be named rather than counted.
type Column = { head: string; body: string | null; headBox: Box; bodyBox: Box | null }
type Head = { row: Box; headings: { name: string; box: Box; ink: Box }[]; form: Box | null; scroll: Box; firstRow: Box; columns: Column[] }

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
    />
  )
}

// The table's markup as it stands after `act`ing on it: closed, and with the form open and half a
// name typed into it — which is the moment the prototype's head grew.
async function markup(open: boolean): Promise<string> {
  const user = userEvent.setup()
  const { container, unmount } = render(<Table />)
  if (open) {
    await user.click(screen.getByRole('button', { name: '+ Nytt fält' }))
    await user.type(screen.getByLabelText('Namn'), 'a')
  }
  const html = container.innerHTML
  unmount()
  return html
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

async function measure(html: string, extra = ''): Promise<Head> {
  const page = await browser.newPage({ viewport: { width: VIEW.w, height: VIEW.h } })
  try {
    await page.setContent(shellOf(html, extra), { waitUntil: 'load' })
    return (await page.evaluate(() => {
      const box = (el: Element | null): Box | null => {
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
      }
      const headings = [...document.querySelectorAll('.byd-data thead th')]
        .map((th) => ({ name: (th.querySelector('button')?.textContent ?? th.textContent ?? '').trim(), box: box(th)!, ink: box(th.querySelector('button') ?? th)! }))
        .filter((h) => h.name !== '')
      // A cell says which column it is by the class the table gives it; a heading with no class
      // of its own is named by the word in it, which is enough to read a mismatch by.
      const named = (cell: Element): string => cell.className.replace('byd-data-', '') || (cell.querySelector('button')?.textContent ?? cell.textContent ?? '').trim() || '(blank)'
      const heads = [...document.querySelectorAll('.byd-data thead th')]
      const bodies = [...(document.querySelector('.byd-data tbody tr')?.children ?? [])]
      return {
        row: box(document.querySelector('.byd-data thead tr'))!,
        headings,
        form: box(document.querySelector('.byd-newfield')),
        scroll: box(document.querySelector('.byd-data-scroll'))!,
        firstRow: box(document.querySelector('.byd-data tbody tr'))!,
        columns: heads.map((th, i) => ({
          head: named(th),
          body: bodies[i] ? named(bodies[i]!) : null,
          headBox: box(th)!,
          bodyBox: box(bodies[i] ?? null),
        })),
      }
    })) as Head
  } finally {
    await page.close()
  }
}

describe('the form that makes a column (#32)', () => {
  it('lies over the rows instead of growing the head, so no heading moves while it is being typed in', async () => {
    const [shut, open] = await Promise.all([measure(await markup(false)), measure(await markup(true))])

    // The guard is worth nothing if it is measuring nothing: the form is really on the page, and
    // it is taller than the head it hangs from — which is what would have pushed the row down.
    expect(open.form).not.toBeNull()
    expect(open.form!.h).toBeGreaterThan(open.row.h)
    expect(shut.form).toBeNull()
    expect(shut.headings.map((h) => h.name)).toEqual(['id ↕', 'title ↕', 'body ↕', 'antal ↕', '+ Nytt fält', 'Ta bort'])
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
    const cell = open.headings.at(-2)!.box
    expect(Math.abs(open.form!.y - (cell.y + cell.h))).toBeLessThanOrEqual(2)
    expect(open.form!.y).toBeLessThan(open.firstRow.y + open.firstRow.h)
    expect(open.form!.x + open.form!.w).toBeLessThanOrEqual(open.scroll.x + open.scroll.w + 1)
  }, 60_000)

  it('is a real condition and not a rule that cannot be broken: in the flow, the head does grow', async () => {
    // The same markup with one property taken back — the form standing in the cell instead of
    // over the rows — is the prototype that was rejected. If this passed too, the pair above
    // would be measuring the browser rather than the stylesheet.
    const html = await markup(true)
    const [held, inFlow] = await Promise.all([measure(html), measure(html, '.byd-newfield { position: static; }')])

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
// So every card's row ended one `<td>` short of the head. A table with seven headings and six
// cells is still a legal table — the browser lays the columns out and the row simply stops early
// — and what the designer saw was the pinned × sitting under "+ Nytt fält", twice the width it is
// meant to be, with a phantom empty column after it.
describe('the head and the rows are the same table (#32)', () => {
  it('puts every card cell under the heading it belongs to, at the same width', async () => {
    const { columns } = await measure(await markup(false))

    // The head really does have the column the issue added, so this is not a guard over a table
    // without the cell in question.
    expect(columns.map((c) => c.head)).toEqual(['check', 'id ↕', 'title ↕', 'body ↕', 'antal ↕', 'newfield', 'remove'])

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

  it('is a condition that can fail: take the new cell back out and the × slides under the wrong heading', async () => {
    // The same markup with the body's cell hidden is the table exactly as #32 shipped it. If this
    // passed too, the assertion above would be measuring the browser rather than the markup.
    const html = await markup(false)
    const short = await measure(html, '.byd-data tbody .byd-data-newfield { display: none; }')

    // A cell taken out of the layout leaves the table exactly as short as one that was never
    // written: the head keeps its seven columns and the rows lay out six.
    const drift = short.columns.filter((c) => c.bodyBox!.x !== c.headBox.x || c.bodyBox!.w !== c.headBox.w)
    expect(drift.map((c) => c.head)).toEqual(['newfield', 'remove'])

    // And the drift is the one that shipped: the × has slid a whole heading to the left, onto
    // "+ Nytt fält", and taken that heading's width instead of a tap target's.
    const newfield = short.columns.find((c) => c.head === 'newfield')!
    const remove = short.columns.find((c) => c.head === 'remove')!
    expect(remove.bodyBox!.x).toBe(newfield.headBox.x)
    expect(remove.bodyBox!.w).toBe(newfield.headBox.w)
    expect(newfield.headBox.w).toBeGreaterThan(44)
  }, 60_000)
})

// The pinned × lies over what scrolls under it, and no stylesheet can stop it: content and pin
// share one clipping rectangle, and taking the pin out of the scroller costs the sticky heading
// (#53, and the measurements in its thread). So the overlap stays and is made legible instead —
// which first of all means the table has to know when it is happening. That is geometry, so it
// is read in a real engine: the pin's box against every other cell's, the editor's own function
// running inside the page it was written for.
const FIELDS = 10

// A deck wide enough that the box scrolls sideways at 1280 — which is the only width at which the
// pin covers anything at all.
function wideDoc(): ProjectDoc {
  const doc = projectDoc()
  const extra = Object.fromEntries(Array.from({ length: FIELDS }, (_, i) => [`fält${i + 1}`, `värde ${i + 1}`]))
  return { ...doc, rows: doc.rows.map((row) => ({ ...row, fields: { ...row.fields, ...extra } })) }
}

async function markupOf(doc: ProjectDoc): Promise<string> {
  const { container, unmount } = render(<Table doc={doc} />)
  const html = container.innerHTML
  unmount()
  return html
}

// What the pin is standing on at a given scroll position, read off the boxes: where the pin is,
// how far the box can still scroll, and every column that overlaps the pin at all with how many
// of its pixels are under it. `at` is where the box is scrolled to before anything is read.
type Pinned = { cut: string | null; scrollLeft: number; rest: number; pin: Box; under: { name: string; px: number }[] }

async function pinned(html: string, at: 'rest' | 'end', extra = ''): Promise<Pinned> {
  const page = await browser.newPage({ viewport: { width: VIEW.w, height: VIEW.h } })
  try {
    await page.setContent(shellOf(html, extra), { waitUntil: 'load' })
    return await page.evaluate(
      ({ end, decide }) => {
        const scroll = document.querySelector('.byd-data-scroll') as HTMLElement
        scroll.scrollLeft = end ? scroll.scrollWidth : 0
        // The editor's own decision, run on the page rather than described by the test.
        new Function('box', `(${decide})(box)`)(scroll)
        const pin = scroll.querySelector('thead .byd-data-remove') as HTMLElement
        const over = pin.getBoundingClientRect()
        const under = [...scroll.querySelectorAll('thead > tr > *')]
          .filter((cell) => cell !== pin)
          .map((cell) => {
            const box = cell.getBoundingClientRect()
            const px = Math.round(Math.min(box.right, over.right) - Math.max(box.left, over.left))
            return { name: cell.className.replace('byd-data-', '') || (cell.textContent ?? '').trim(), px }
          })
          .filter((c) => c.px > 0)
        const round = (r: DOMRect): Box => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) })
        return {
          cut: scroll.getAttribute('data-cut'),
          scrollLeft: Math.round(scroll.scrollLeft),
          rest: Math.round(scroll.scrollWidth - scroll.clientWidth - scroll.scrollLeft),
          pin: round(over),
          under,
        }
      },
      { end: at === 'end', decide: String(markCut) },
    )
  } finally {
    await page.close()
  }
}

describe('a column running in under the pinned × (#53)', () => {
  it('is something the table knows about, at rest and not at the end of the scroll', async () => {
    const html = await markupOf(wideDoc())
    const [rest, end] = await Promise.all([pinned(html, 'rest'), pinned(html, 'end')])

    // The guard is worth nothing if the box does not scroll: there is somewhere to scroll to at
    // rest, and nowhere left at the end.
    expect(rest.scrollLeft).toBe(0)
    expect(rest.rest).toBeGreaterThan(100)
    expect(end.rest).toBe(0)
    // The pin is where #17 put it, at the box's right edge, at both positions.
    expect(end.pin).toEqual(rest.pin)
    expect(rest.pin.w).toBe(44)

    // And the fault itself, read off the boxes: at rest a column really is under the pin, and at
    // the end of the scroll none is.
    expect(rest.under.length).toBeGreaterThan(0)
    expect(end.under).toEqual([])
    expect(rest.cut).toBe('true')
    expect(end.cut).toBe('false')
  }, 60_000)

  it('is not what a narrow table does: with four fields nothing is under the pin and nothing is marked', async () => {
    const only = await pinned(await markupOf(projectDoc()), 'rest')

    // The table fits, so there is nowhere to scroll and nothing to cover.
    expect(only.rest).toBe(0)
    expect(only.under).toEqual([])
    expect(only.cut).toBe('false')
  }, 60_000)
})
