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


// The pinned × lies over what scrolls under it, and no stylesheet can stop it: the content and the
// pin share one clipping rectangle, and the only way out — a pin outside the scroller — costs the
// sticky heading, which is not for sale (#53, and the measurements in its thread). So the overlap
// stays and is made legible instead. Two things have to be true of that: the table has to know
// when a column has run in under the pin, which is geometry; and the reader has to be able to see
// it, which is paint. Both are read in a real engine, off the boxes and off the pixels.
const FIELDS = 10

// A deck wide enough that the box scrolls sideways at 1280 — the only width at which the pin
// covers anything at all.
function wideDoc(): ProjectDoc {
  const doc = projectDoc()
  const extra = Object.fromEntries(Array.from({ length: FIELDS }, (_, i) => [`fält${i + 1}`, `värde ${i + 1} som fortsätter förbi kanten`]))
  return { ...doc, rows: doc.rows.map((row) => ({ ...row, fields: { ...row.fields, ...extra } })) }
}

async function markupOf(doc: ProjectDoc): Promise<string> {
  const { container, unmount } = render(<Table doc={doc} />)
  const html = container.innerHTML
  unmount()
  return html
}

// The three places the box can be: where it opens, halfway along, and as far as it goes.
const WHERE = ['rest', 'mid', 'end'] as const
type Where = (typeof WHERE)[number]

// What the pin is standing on at one scroll position. `under` is every column whose box overlaps
// the pin's at all, with how many of its pixels are covered; `hit` is what a thumb aimed at the
// middle of the pin actually lands on, which is the whole of #17; `strip` is a picture of the
// last 40 px in front of the pin — the ground a value has to cross to go under it.
type Shot = { cut: string | null; scrollLeft: number; left: number; pin: Box; box: Box; under: { name: string; px: number }[]; hit: string; strip: Buffer }

// One page, scrolled to each of the three places in turn, so a stylesheet costs one browser page
// rather than three. `extra` is appended after the editor's own, which is how the cue is taken
// back for the control cases below.
async function pinned(html: string, extra = ''): Promise<Record<Where, Shot>> {
  const page = await browser.newPage({ viewport: { width: VIEW.w, height: VIEW.h } })
  try {
    await page.setContent(shellOf(html, extra), { waitUntil: 'load' })
    const out = {} as Record<Where, Shot>
    for (const where of WHERE) {
      const facts = await page.evaluate(
        ({ where, decide }) => {
          const scroll = document.querySelector('.byd-data-scroll') as HTMLElement
          const far = scroll.scrollWidth - scroll.clientWidth
          scroll.scrollLeft = where === 'rest' ? 0 : where === 'mid' ? Math.round(far / 2) : far
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
          return {
            cut: scroll.getAttribute('data-cut'),
            scrollLeft: Math.round(scroll.scrollLeft),
            left: Math.round(far - scroll.scrollLeft),
            pin: round(over),
            box: round(box),
            under,
            hit: `${at?.tagName ?? '(nothing)'} in ${at?.closest('td, th')?.className ?? '(no cell)'}`,
            clip: { x: over.left - 40, y: box.top, width: 40, height: Math.min(box.height, 420) },
          }
        },
        { where, decide: String(markCut) },
      )
      const { clip, ...rest } = facts
      out[where] = { ...rest, strip: await page.screenshot({ clip }) }
    }
    return out
  } finally {
    await page.close()
  }
}

describe('a column running in under the pinned × (#53)', () => {
  it('is something the table knows about, all the way along the scroll except at the very end of it', async () => {
    const at = await pinned(await markupOf(wideDoc()))

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
const FORCED = {
  off: '.byd-data .byd-data-remove::before { opacity: 0 !important; }',
  on: '.byd-data .byd-data-remove::before { opacity: 1 !important; }',
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

  it('says nothing about a table that fits: with four fields the ground in front of the pin is the bare ground', async () => {
    const [shown, off] = await Promise.all([pinned(await markupOf(projectDoc())), pinned(await markupOf(projectDoc()), FORCED.off)])

    expect(WHERE.map((w) => shown[w]!.strip.equals(off[w]!.strip))).toEqual([true, true, true])
  }, 60_000)
})

// The sticky heading is what every nested design would have cost, and it is the thing the
// narrowed issue refused to pay for (#53). So it is measured beside the cue rather than taken on
// trust: a deck long enough to scroll down and wide enough for the cue to be on, scrolled both
// ways at once.
async function scrolled(html: string): Promise<{ head: Box; box: Box; first: string; cut: string | null; pin: Box }> {
  const page = await browser.newPage({ viewport: { width: VIEW.w, height: VIEW.h } })
  try {
    await page.setContent(shellOf(html, ''), { waitUntil: 'load' })
    return await page.evaluate((decide) => {
      const scroll = document.querySelector('.byd-data-scroll') as HTMLElement
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
    }, String(markCut))
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
  })
})
