// @vitest-environment jsdom
// How the card table hands out its width (#46, variant B — "innehållet bestämmer").
//
// The whole issue is one measurement. Today every column of the table is the same width to the
// pixel — at 1280 `art`, `title`, `body`, `cost` and `antal` come out 193 each — and the reason
// is not that the browser guesses badly. Every cell is an `<input>`, and an input's intrinsic
// width is its `size`: twenty characters, whatever the value inside happens to be. The browser
// never sees the content at all. So there is no pure-CSS answer; the values have to be measured
// in JavaScript and the width *told* to the table.
//
// Which means this file has to measure in a real engine, with the real fonts and the real
// stylesheet — jsdom lays nothing out and has no text metrics to lay it out from.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { useState } from 'react'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { chromium, type Browser } from 'playwright'
import { applyEdit } from '@byd/server/doc'
import { DataTable } from '../src/editor/DataTable.js'
import { deckValues, fitColumns } from '../src/editor/columns.js'
import type { ProjectDoc } from '../src/editor/types.js'
import { translate, type T } from '../src/i18n/index.js'
import { projectDoc } from './project-doc.js'

// A surface mounted on its own speaks Swedish (A4), which is what the markup below is rendered in.
const sv: T = (key, params) => translate('sv', key, params)

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')

// The deck the issue is written about: six cards over `id`, `art`, `title`, `body`, `cost` and
// `antal`. `title` and `body` are both text — that is the point of the fixture — and they are the
// pair that tells a measured layout apart from one that only reads the registry's type: a type
// can only say "both are text", and the issue's own symptom is `body` being cut while `title` has
// room to spare.
const CARDS = [
  { id: 'k1', fields: { art: 'Fälla', title: 'Stöld', body: 'Stjäl ett kort från motståndaren', cost: 3, antal: 2 } },
  { id: 'k2', fields: { art: 'Varelse', title: 'Vakt', body: 'Blockerar nästa anfall mot dig', cost: 2, antal: 4 } },
  { id: 'k3', fields: { art: 'Plats', title: 'Marknad', body: 'Dra två kort, lägg sedan tillbaka ett av dem underst i draghögen', cost: 5, antal: 1 } },
  { id: 'k4', fields: { art: 'Plats', title: 'Gruva', body: 'Ge 2 mynt', cost: 1, antal: 3 } },
  { id: 'k5', fields: { art: 'Varelse', title: 'Spion', body: 'Titta på motståndarens hand och välj ett kort som kastas', cost: 4, antal: 2 } },
  { id: 'k6', fields: { art: 'Fälla', title: 'Eld', body: 'Förstör en varelse med kostnad 3 eller mindre', cost: 2, antal: 1 } },
]

// The template binds the four fields the designer made, in the order the head shows them; `antal`
// is the engine's and comes last on its own (L4).
function deckDoc(): ProjectDoc {
  const doc = projectDoc()
  const front = doc.template.faces.front!
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

function Table({ doc: initial }: { doc: ProjectDoc }) {
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

function markupOf(doc: ProjectDoc): string {
  const { container, unmount } = render(<Table doc={doc} />)
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

const shellOf = (html: string, extra: string) =>
  read('index.html')
    .replace('<script type="module" src="/src/main.tsx"></script>', '')
    .replace('</head>', `<style>${read('src/editor/editor.css')}\n${read('src/buttons.css')}${extra}</style></head>`)
    .replace('<div id="root"></div>', `<div id="root"><div class="byd-editor" data-page="editor" data-mode="table"><main><div role="tabpanel">${html}</div></main></div></div>`)

type Measured = {
  // Every column of the head, by the name the table gives it, with the width it was drawn at.
  width: Record<string, number>
  // The head in document order, and how many of the cards' cells under each heading hold
  // anything at all — a value, a word, or a control. A column where that is nought is a column
  // the deck has no use for, and it is the ~200 px of nothing the issue opens with.
  columns: { head: string; holds: number }[]
  // Where the row stops and where the box it scrolls in stops, so an empty column at the end has
  // somewhere to show up.
  table: number
  scroll: number
  // What the whole page does — the one thing a measured layout can break that nothing else can.
  page: number
}

// The table laid out in a real engine at `width`, with the editor's own measurement run on the
// page. `fit: false` leaves it unmeasured, which is what every control case below needs.
async function measure(doc: ProjectDoc, { width = 1280, fit = true, extra = '' } = {}): Promise<Measured> {
  const page = await browser.newPage({ viewport: { width, height: 800 } })
  try {
    await page.setContent(shellOf(markupOf(doc), extra), { waitUntil: 'load' })
    return (await page.evaluate(
      ({ deck, fit, decide }) => {
        const box = document.querySelector('.byd-data-scroll') as HTMLElement
        // The editor's own decision, run on the page rather than described by the test.
        if (fit) new Function('box', 'deck', `(${decide})(box, deck)`)(box, deck)
        const table = box.querySelector('.byd-data') as HTMLElement
        const named = (cell: Element): string =>
          cell.getAttribute('data-col') ?? (cell.className.replace('byd-data-', '') || '(blank)')
        const out: Record<string, number> = {}
        const heads = [...table.querySelectorAll('thead > tr > *')]
        for (const th of heads) out[named(th)] = Math.round(th.getBoundingClientRect().width)
        const rows = [...table.querySelectorAll('tbody > tr')]
        return {
          width: out,
          columns: heads.map((th, i) => ({
            head: named(th),
            holds: rows.filter((row) => {
              const cell = row.children[i]
              return !!cell && ((cell.textContent ?? '').trim() !== '' || cell.querySelector('input, button, select, textarea, img') !== null)
            }).length,
          })),
          table: Math.round(table.getBoundingClientRect().width),
          scroll: Math.round(box.getBoundingClientRect().width),
          page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        }
      },
      { deck: deckValues(deckDoc(), sv), fit, decide: String(fitColumns) },
    )) as Measured
  } finally {
    await page.close()
  }
}

// What the table looked like before any of this: `table-layout: auto` over cells whose intrinsic
// width is `size="20"` and nothing else. It is put back as a control rather than remembered,
// because "the columns used to be equal" is the claim the whole issue rests on.
const TODAY = '.byd-data { table-layout: auto !important; width: max-content !important; min-width: 100% !important; }'

describe('a column is as wide as what stands in it (#46)', () => {
  it('gives `cost` a number\'s width and `body` the room the sentences need, at 1280', async () => {
    const [before, after] = await Promise.all([
      measure(deckDoc(), { fit: false, extra: TODAY }),
      measure(deckDoc()),
    ])

    // The control, and the reason there is an issue at all: as the table stood, every column of
    // the deck came out the same width to the pixel — a number as wide as a rules text, because
    // the browser was reading `size="20"` in both and never the value.
    const DECK = ['art', 'title', 'body', 'cost', 'antal']
    const same = DECK.map((f) => before.width[f])
    expect(same.every((w) => typeof w === 'number' && w > 0)).toBe(true)
    expect(new Set(same).size).toBe(1)

    // And now the two that are farthest apart: a cost is one digit, a rules text is a sentence.
    // The criterion names `body` on purpose. `title` is text too, so a rule that only knows the
    // registry's type hands those two the same width and cuts `body` anyway — which is exactly
    // the variant this one was chosen over.
    expect(after.width.cost!).toBeLessThanOrEqual(96)
    expect(after.width.body!).toBeGreaterThan(4 * after.width.cost!)
    expect(after.width.body!).toBeGreaterThan(3 * after.width.title!)
  }, 60_000)
})

// The third of the issue's three symptoms, and the one that is pure markup: between `antal` and
// the pinned × stood a column of nothing at all — about 200 px of it — because the button that
// makes a new column had been given a column of its own to stand in (#32). A cell in the head is
// a column whether or not any card has anything to put under it.
describe('the row ends where the last field ends (#46)', () => {
  it('has something under every heading, and nothing standing between the last field and the pin', async () => {
    const after = await measure(deckDoc())

    // Named rather than counted: the column that went is named by its absence from this list, so
    // a rename cannot quietly satisfy a count. `newfield` stood between `antal` and `remove`.
    expect(after.columns.map((c) => c.head)).toEqual(['check', 'id', 'art', 'title', 'body', 'cost', 'antal', 'remove'])

    // And every one of them has cells: the tick column holds a tick per card, the pinned column
    // holds a button per card, and each column of the deck holds its values. A column with no
    // cells is the fault, whatever width it happens to be drawn at.
    expect(after.columns.filter((c) => c.holds === 0)).toEqual([])
    expect(after.columns.every((c) => c.holds === CARDS.length)).toBe(true)
  }, 60_000)
})

// A deck too wide for the room it is in: twelve columns on top of the six the issue is about, so
// that even with every text column pushed down onto its own heading the table cannot fit at 768.
function crowdedDoc(): ProjectDoc {
  const doc = deckDoc()
  const extra = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`fält${i + 1}`, `värde ${i + 1} som fortsätter`]))
  return { ...doc, rows: doc.rows.map((row) => ({ ...row, fields: { ...row.fields, ...extra } })) }
}

// The one thing a measured layout can break that nothing else in this issue can: it can measure
// itself. `fitColumns` asks the box how much room there is and then makes the table exactly that
// wide. If anything above the box takes its own width from what is standing in it, the question
// comes back as its own answer — the measurement finds precisely the room it asked for, squeezes
// nothing, and the deck runs off the right of the screen with the page scrolling after it.
//
// The prototype hit this and laid it at the door of `.byd-editor`, which is a grid with rows and
// no column track. The editor was never in danger from that: two boxes on the way down already
// clip — `.byd-editor > main` and the table's own scrolling box — and a scroll container has a
// min-content of nought, so nothing under them can push the document sideways however wide it
// gets. A column track here would be a declaration with no work to do. What is locked instead is
// the property itself, and it is locked against the two boxes that really carry it.
//
// 768 is not a width the editor is designed at (L12); it is the floor at which nothing may break,
// and a deck that runs off the screen is breaking.
describe('the table is measured against the room it really has (#46)', () => {
  it('keeps a deck too wide for 768 inside the window, scrolling the box and never the page', async () => {
    const [held, loose] = await Promise.all([
      measure(crowdedDoc(), { width: 768 }),
      // The two boxes that clip, taken away. Nothing else changes: the same markup, the same
      // measurement, at the same width. If this did not run away, everything below would be
      // measuring the browser rather than the stylesheet.
      measure(crowdedDoc(), { width: 768, extra: '.byd-editor > main, .byd-data-scroll { overflow: visible; }' }),
    ])

    // The control, and it is the prototype's finding exactly: with nothing clipping, the box is as
    // wide as the table and the table is as wide as the box, the two settle far outside a 768 px
    // window, and the page scrolls to reach them.
    expect(loose.scroll).toBe(loose.table)
    expect(loose.table).toBeGreaterThan(768)
    expect(loose.page).toBeGreaterThan(0)

    // And the table as it ships: the box is inside the window, the table is wider than the box —
    // a deck this wide cannot be made to fit without lying about it — and the box is what
    // scrolls. The page does not move.
    expect(held.scroll).toBeLessThanOrEqual(768)
    expect(held.table).toBeGreaterThan(held.scroll)
    expect(held.page).toBe(0)
  }, 60_000)

  it('spends exactly the room it is given, and no more, when the deck does fit', async () => {
    const [wide, narrow] = await Promise.all([measure(deckDoc()), measure(deckDoc(), { width: 1024 })])

    // Every column added up is the table, and the table is the box: the slack has been handed out
    // rather than left standing at the end of the row, and nothing has been handed out twice.
    for (const at of [wide, narrow]) {
      expect(Object.values(at.width).reduce((a, b) => a + b, 0)).toBe(at.table)
      expect(at.table).toBe(at.scroll)
      expect(at.page).toBe(0)
    }

    // And what a narrower window takes, it takes from the sentences and from nothing else: the
    // number columns are the same width at 1024 as at 1280 and `body` is not.
    expect(narrow.width.cost).toBe(wide.width.cost)
    expect(narrow.width.antal).toBe(wide.width.antal)
    expect(narrow.width.body!).toBeLessThan(wide.width.body!)
    expect(narrow.width.cost!).toBeLessThanOrEqual(96)
  }, 60_000)
})
