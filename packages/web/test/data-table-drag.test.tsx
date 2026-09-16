// @vitest-environment jsdom
// What a drag on a column's edge means (#141).
//
// It meant four other things. Pulling `typ` 150 px to the right at 1440 made `typ` 150 px wider
// and took 20 px off `id`, 18 off `title`, 92 off `body` and 20 off `grupp` — columns the hand
// never touched, and `title` was already too narrow for its values before it lost any. Only the
// dragged column was written to `localStorage` as a width; the rest were measured columns that
// had been asked to give.
//
// The decision is that the edge moves the column the hand is holding and nothing else. The table
// becomes wider or narrower than its box, and the box scrolls — the property "the table always
// fits until a width is set" is given up on purpose, in exchange for a drag meaning one thing.
// L4 and #46 say the width is the designer's, and a width that changes behind the back of the
// person who dragged is not the designer's.
//
// jsdom lays nothing out, so the drag is made in the document and the result measured in a real
// engine against the stylesheet the editor ships — the same two halves as `data-table-widths`.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { useState } from 'react'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { chromium, type Browser } from 'playwright'
import { DataTable } from '../src/editor/DataTable.js'
import { deckValues, dragScroll, fitColumns, markValues } from '../src/editor/columns.js'
import type { ProjectDoc } from '../src/editor/types.js'
import { translate, type T } from '../src/i18n/index.js'
import { projectDoc } from './project-doc.js'

const sv: T = (key, params) => translate('sv', key, params)
const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')

// The deck the issue measured: a column of single words, one of short titles, one of sentences,
// and two of numbers. The words and the sentences are what a sharing-out moves; the numbers are
// what it was never supposed to touch and moved anyway.
const CARDS = [
  { id: 'k1', fields: { art: 'Fälla', title: 'Stöld', body: 'Stjäl ett kort från motståndaren', cost: 3, antal: 2 } },
  { id: 'k2', fields: { art: 'Varelse', title: 'Vakt', body: 'Blockerar nästa anfall mot dig', cost: 2, antal: 4 } },
  { id: 'k3', fields: { art: 'Plats', title: 'Marknad', body: 'Dra två kort, lägg sedan tillbaka ett av dem underst i draghögen', cost: 5, antal: 1 } },
  { id: 'k4', fields: { art: 'Plats', title: 'Gruva', body: 'Ge 2 mynt', cost: 1, antal: 3 } },
  { id: 'k5', fields: { art: 'Varelse', title: 'Spion', body: 'Titta på motståndarens hand och välj ett kort som kastas', cost: 4, antal: 2 } },
  { id: 'k6', fields: { art: 'Fälla', title: 'Eld', body: 'Förstör en varelse med kostnad 3 eller mindre', cost: 2, antal: 1 } },
]

function deckDoc(): ProjectDoc {
  const doc = projectDoc()
  const front = doc.template.faces['front']!
  return {
    ...doc,
    template: {
      ...doc.template,
      faces: {
        ...doc.template.faces,
        front: {
          ...front,
          base: ['art', 'title', 'body', 'cost'].map((field, i) => ({
            kind: 'text' as const,
            id: field,
            x: 5,
            y: 5 + i * 12,
            w: 53,
            h: 10,
            bind: { field },
            font: { family: 'sans-serif', sizePt: 9 },
            color: '#111',
          })),
        },
      },
    },
    rows: CARDS,
  }
}

function Table() {
  const [doc, setDoc] = useState(deckDoc)
  return (
    <DataTable
      doc={doc}
      selectedRow={null}
      onSelectRow={() => undefined}
      onCell={() => undefined}
      onAddRow={() => undefined}
      onRemoveRow={() => undefined}
      onReplaceRows={(rows) => setDoc((now) => ({ ...now, rows }))}
      onAddField={() => undefined}
      onRemoveField={() => undefined}
      onMoveField={() => undefined}
    />
  )
}

// The table's markup, with or without a drag on one heading's edge made first. The drag is real
// pointer events on the real grip, so what the table declares on the column is what the
// measurement below reads.
function markup(pull?: { field: string; by: number }): string {
  const { container, unmount } = render(<Table />)
  try {
    if (pull) {
      const grip = container.querySelector(`thead th[data-col="${pull.field}"] .byd-data-pull`) as HTMLElement
      fireEvent.pointerDown(grip, { pointerId: 1, button: 0, clientX: 0 })
      fireEvent.pointerMove(grip, { pointerId: 1, clientX: pull.by })
      fireEvent.pointerUp(grip, { pointerId: 1, clientX: pull.by })
    }
    return container.innerHTML
  } finally {
    unmount()
  }
}

const shellOf = (html: string) =>
  read('index.html')
    .replace('<script type="module" src="/src/main.tsx"></script>', '')
    .replace('</head>', `<style>${read('src/editor/editor.css')}\n${read('src/buttons.css')}</style></head>`)
    .replace('<div id="root"></div>', `<div id="root"><div class="byd-editor" data-page="editor" data-mode="table"><main><div role="tabpanel">${html}</div></main></div></div>`)

const FIT = `(box, deck) => { (${String(fitColumns)})(box, deck); (${String(markValues)})(box) }`

let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser.close()
}, 60_000)

type Laid = { width: Record<string, number>; table: number; scroll: number; page: number }

async function measure(html: string, width = 1440): Promise<Laid> {
  const page = await browser.newPage({ viewport: { width, height: 900 } })
  try {
    await page.setContent(shellOf(html), { waitUntil: 'load' })
    return (await page.evaluate(
      ({ deck, fit }) => {
        const box = document.querySelector('.byd-data-scroll') as HTMLElement
        new Function('box', 'deck', `(${fit})(box, deck)`)(box, deck)
        const table = box.querySelector('.byd-data') as HTMLElement
        const width: Record<string, number> = {}
        for (const th of table.querySelectorAll('thead > tr > *')) {
          const name = th.getAttribute('data-col') ?? (th.className.replace('byd-data-', '') || '(blank)')
          width[name] = Math.round(th.getBoundingClientRect().width)
        }
        return {
          width,
          table: Math.round(table.getBoundingClientRect().width),
          scroll: Math.round(box.getBoundingClientRect().width),
          page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        }
      },
      { deck: deckValues(deckDoc(), sv), fit: FIT },
    )) as Laid
  } finally {
    await page.close()
  }
}

describe('a drag on a column edge (#141)', () => {
  it('moves the column the hand is holding, and no other', async () => {
    // jsdom lays nothing out, so the heading the grip belongs to measures nought when the hand
    // comes down: the drag therefore sets the column to exactly the distance moved, which is what
    // `data-table-widths` reads a pull as too. 300 is well clear of what `art` asks for, so this
    // is not a guard over a width the column was going to come out at anyway.
    const [before, after] = await Promise.all([measure(markup()), measure(markup({ field: 'art', by: 300 }))])
    expect(before.width['art']).not.toBe(300)
    expect(after.width['art']).toBe(300)

    // And every other column is exactly where it was. Named rather than counted, so a column that
    // moved can be read off the failure rather than inferred from a total.
    const moved = Object.keys(before.width)
      .filter((name) => name !== 'art')
      .map((name) => ({ name, was: before.width[name]!, now: after.width[name]! }))
      .filter(({ was, now }) => was !== now)
      .map(({ name, was, now }) => `${name}: ${was} → ${now}`)
    expect(moved).toEqual([])
  }, 90_000)

  it('lets the table grow past its box, because that is what a drag that means one thing costs', async () => {
    // One column pulled past what the whole table had: the drag sets the width outright, so this
    // is a `body` of 1100 px beside five columns that still measure themselves.
    const after = await measure(markup({ field: 'body', by: 1100 }))

    // The property given up on purpose: the table used to fit its box until somebody set a width,
    // and it bought that by taking the difference off columns nobody asked about. Now the box
    // scrolls, which is the same honest answer the pinned × was drawn for (#53).
    expect(after.table).toBeGreaterThan(after.scroll)
    // What must never happen is the page itself running sideways (L12).
    expect(after.page).toBe(0)
  }, 90_000)

  it('leaves a column narrower than the deck asked for just as untouched as a wider one', async () => {
    // The other direction, and the one the issue's own table is about: `body` pulled *down* used
    // to hand its room out to `art` and `title`, which is how a column the designer never chose
    // came to be wider than she left it. A drag is one thing in both directions or it is not one
    // thing.
    const [before, after] = await Promise.all([measure(markup()), measure(markup({ field: 'body', by: 200 }))])
    expect(before.width['body']).toBeGreaterThan(200)
    expect(after.width['body']).toBe(200)
    const moved = Object.keys(before.width)
      .filter((name) => name !== 'body')
      .map((name) => ({ name, was: before.width[name]!, now: after.width[name]! }))
      .filter(({ was, now }) => was !== now)
      .map(({ name, was, now }) => `${name}: ${was} → ${now}`)
    expect(moved).toEqual([])
  }, 90_000)
})

// The other half of the same decision (#141). A column can now be dragged wider than the window,
// and without this it cannot: the pointer runs out at the window's edge, the drag has to be let
// go, the box scrolled by hand and the edge caught again. So a pointer held near the box's edge
// during a drag scrolls the box under it.
//
// The decision itself is one function with nothing in it but arithmetic, so it is asked of a real
// box in a real engine — the same way `columnsOutside` and `markCut` are. What it cannot be asked
// in jsdom is anything at all: a box there is nought wide and every edge is every other edge.
describe('the box under a drag that has reached its edge (#141)', () => {
  it('scrolls toward the edge the pointer is near, and stands still anywhere else', async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    try {
      // A table well wider than its box, so there is somewhere to scroll in both directions.
      await page.setContent(shellOf(markup({ field: 'body', by: 1600 })), { waitUntil: 'load' })
      const seen = await page.evaluate(
        ({ deck, fit, decide }) => {
          const box = document.querySelector('.byd-data-scroll') as HTMLElement
          new Function('box', 'deck', `(${fit})(box, deck)`)(box, deck)
          const at = box.getBoundingClientRect()
          const step = new Function('box', 'clientX', `return (${decide})(box, clientX)`) as (box: Element, x: number) => number
          // Halfway along, so there is room to scroll either way.
          box.scrollLeft = Math.round((box.scrollWidth - box.clientWidth) / 2)
          const middleOfTheRoad = box.scrollLeft
          const inside = (from: number) => Math.round(step(box, from))
          return {
            room: box.scrollWidth - box.clientWidth,
            atTheRightEdge: inside(at.right - 5),
            justInsideTheRightEdge: inside(at.right - 39),
            wellClearOfIt: inside(at.right - 200),
            atTheLeftEdge: inside(at.left + 5),
            middle: inside(at.left + at.width / 2),
            middleOfTheRoad,
          }
        },
        { deck: deckValues(deckDoc(), sv), fit: FIT, decide: String(dragScroll) },
      )

      // The fixture really is wider than its box, or every answer below would be nought for the
      // wrong reason.
      expect(seen.room).toBeGreaterThan(0)
      expect(seen.middleOfTheRoad).toBeGreaterThan(0)
      // Toward the edge the hand is nearest, and harder the nearer it is.
      expect(seen.atTheRightEdge).toBeGreaterThan(0)
      expect(seen.justInsideTheRightEdge).toBeGreaterThan(0)
      expect(seen.atTheRightEdge).toBeGreaterThan(seen.justInsideTheRightEdge)
      expect(seen.atTheLeftEdge).toBeLessThan(0)
      // And nothing at all anywhere else: a drag across the middle of the table must not drift.
      expect(seen.wellClearOfIt).toBe(0)
      expect(seen.middle).toBe(0)
    } finally {
      await page.close()
    }
  }, 90_000)

  it('stands still when there is nowhere to scroll to', async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    try {
      // The deck as it measures itself: narrower than its box, so the edge means nothing.
      await page.setContent(shellOf(markup()), { waitUntil: 'load' })
      const seen = await page.evaluate(
        ({ deck, fit, decide }) => {
          const box = document.querySelector('.byd-data-scroll') as HTMLElement
          new Function('box', 'deck', `(${fit})(box, deck)`)(box, deck)
          const at = box.getBoundingClientRect()
          const step = new Function('box', 'clientX', `return (${decide})(box, clientX)`) as (box: Element, x: number) => number
          return { room: box.scrollWidth - box.clientWidth, right: step(box, at.right - 5), left: step(box, at.left + 5) }
        },
        { deck: deckValues(deckDoc(), sv), fit: FIT, decide: String(dragScroll) },
      )
      expect(seen.room).toBe(0)
      expect({ right: seen.right, left: seen.left }).toEqual({ right: 0, left: 0 })
    } finally {
      await page.close()
    }
  }, 90_000)
})
