// @vitest-environment jsdom
// How the card table hands out its width (#46, variant B — "innehållet bestämmer").
//
// The whole issue is one measurement. As the table stood, every column of the deck was the same
// width to the pixel — 193 each at 1280 in the shipped table, and 208 each under the control case
// below, which puts the old stylesheet back over the head as it is now — and the reason is not
// that the browser guesses badly. Every cell is an `<input>`, and an input's intrinsic width is
// its `size`: twenty characters, whatever the value inside happens to be. The browser never sees
// the content at all. So there is no pure-CSS answer; the values have to be measured in
// JavaScript and the width *told* to the table.
//
// Which means this file has to measure in a real engine, with the real fonts and the real
// stylesheet — jsdom lays nothing out and has no text metrics to lay it out from.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { useState } from 'react'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
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

// What the designer has done to the view before the markup is taken: nothing, a question put to
// the deck in the search box (#16), or a column sorted (#15). Both are views of the project and
// neither touches `doc.rows` (L4), so neither may move a column.
type View = 'plain' | 'filtered' | 'sorted'

function markupOf(doc: ProjectDoc, view: View = 'plain'): string {
  const { container, unmount } = render(<Table doc={doc} />)
  if (view === 'filtered') fireEvent.change(screen.getByLabelText('Sök i alla fält'), { target: { value: 'Gruva' } })
  if (view === 'sorted') fireEvent.click(screen.getByRole('button', { name: /^title/ }))
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
  // What each heading says about whether its column can be taken away: the control that does it,
  // and — when there is none — whether the head says anything at all about why.
  heads: { col: string; canRemove: boolean; says: string; badge: number }[]
  // How many cards are on screen, which is how a filter proves it did something.
  rows: number
  // The first card on screen, which is how a sort proves it did something.
  first: string
  // Every cell whose field is drawn wider than the column it stands in, and by how much. A
  // measured width means nothing if what is inside the cell refuses it.
  spill: { col: string; px: number }[]
}

// The table laid out in a real engine at `width`, with the editor's own measurement run on the
// page. `fit: false` leaves it unmeasured, which is what every control case below needs.
async function measure(doc: ProjectDoc, { width = 1280, fit = true, extra = '', view = 'plain' as View, deck = doc } = {}): Promise<Measured> {
  const page = await browser.newPage({ viewport: { width, height: 800 } })
  try {
    await page.setContent(shellOf(markupOf(doc, view), extra), { waitUntil: 'load' })
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
          heads: heads
            .filter((th) => th.getAttribute('data-col'))
            .map((th) => {
              const mark = th.querySelector('.byd-data-system') as HTMLElement | null
              return {
                col: th.getAttribute('data-col') ?? '?',
                canRemove: th.querySelector('.byd-data-dropfield') !== null,
                says: (mark?.textContent ?? '').trim(),
                // How much of the heading the mark takes: nought when there is none, and nought
                // again if a stylesheet has drawn it somewhere nobody can see it.
                badge: mark && mark.checkVisibility() ? Math.round(mark.getBoundingClientRect().width) : 0,
              }
            }),
          rows: rows.length,
          first: rows[0]?.getAttribute('data-card-ref') ?? '(none)',
          spill: [...table.querySelectorAll('tbody td[data-col]')]
            .map((cell) => {
              const field = cell.querySelector('input:not([type=checkbox])')
              const over = field ? Math.round(field.getBoundingClientRect().width - cell.getBoundingClientRect().width) : 0
              return { col: cell.getAttribute('data-col') ?? '?', px: over }
            })
            .filter((c) => c.px > 0),
        }
      },
      { deck: deckValues(deck, sv), fit, decide: String(fitColumns) },
    )) as Measured
  } finally {
    await page.close()
  }
}

// What the table looked like before any of this: `table-layout: auto` over cells whose intrinsic
// width is `size="20"` and nothing else. It is put back as a control rather than remembered,
// because "the columns used to be equal" is the claim the whole issue rests on.
const TODAY = '.byd-data { table-layout: auto !important; width: max-content !important; min-width: 100% !important; }'

// A deck of the size the tool is actually for — five hundred cards over the same six columns.
// Every value is its own string, so nothing is saved by two cards happening to say the same
// thing; what is measured here is the deck and not a coincidence in the fixture.
function bigDoc(): ProjectDoc {
  const doc = deckDoc()
  return {
    ...doc,
    rows: Array.from({ length: 500 }, (_, i) => ({
      id: `k${i}`,
      fields: { art: `Varelse ${i}`, title: `Kort ${i}`, body: `Regeltext nummer ${i} som fortsätter en bit till`, cost: i % 9, antal: (i % 4) + 1 },
    })),
  }
}

// How many times the measurement asks the engine for the width of a string, over two passes with
// the same deck in between. `measureText` is the one call that costs anything — the canvas has to
// shape the text to answer — and it is the browser's own, so counting it counts the real work
// rather than a function this file happens to know the name of.
async function measurements(doc: ProjectDoc): Promise<{ first: number; second: number; ms: number }> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  try {
    await page.setContent(shellOf(markupOf(doc), ''), { waitUntil: 'load' })
    return await page.evaluate(
      ({ deck, decide }) => {
        const proto = CanvasRenderingContext2D.prototype
        const own = proto.measureText
        let asked = 0
        proto.measureText = function (text: string) {
          asked++
          return own.call(this, text)
        }
        const box = document.querySelector('.byd-data-scroll') as HTMLElement
        const run = () => new Function('box', 'deck', `(${decide})(box, deck)`)(box, deck)
        const started = performance.now()
        run()
        const ms = performance.now() - started
        const first = asked
        asked = 0
        run()
        const second = asked
        proto.measureText = own
        return { first, second, ms }
      },
      { deck: deckValues(doc, sv), decide: String(fitColumns) },
    )
  } finally {
    await page.close()
  }
}

// A column is only as wide as what stands in it if what stands in it will accept the width. Every
// cell is an `<input>`, and the rule that gave one a floor of twelve characters was written for
// the auto layout it was fighting — an input whose intrinsic width is `size="20"`, in a table that
// sized itself on what it could see. Under a measured, fixed layout that floor is 80 px and the
// whole point of the issue is a column of 64: `cost` drew its field sixteen pixels into `antal`.
describe('a cell keeps inside its own column (#46)', () => {
  it('draws no field wider than the column it stands in, at either desk width', async () => {
    const [wide, narrow] = await Promise.all([measure(deckDoc()), measure(deckDoc(), { width: 1024 })])

    // The column that was doing it is really there and really narrow, so this is not a guard over
    // a table of wide columns.
    expect(wide.width.cost!).toBeLessThan(80)
    expect(narrow.width.cost!).toBeLessThan(80)
    expect(wide.spill).toEqual([])
    expect(narrow.spill).toEqual([])
  }, 60_000)

  it("is a real condition: put the twelve-character floor back and the number column runs over its neighbour", async () => {
    const over = await measure(deckDoc(), { extra: ".byd-data td input:not([type='checkbox']) { min-width: 12ch; }" })

    // Named rather than counted, and by how much: the floor is 80 and the column is `cost`.
    expect([...new Set(over.spill.map((c) => c.col))]).toEqual(['cost'])
    expect(over.spill.every((c) => c.px === 80 - over.width.cost!)).toBe(true)
    expect(over.spill.length).toBe(CARDS.length)
  }, 60_000)
})

// The measurement is O(cards × columns) against a font, and for a deck of five hundred that is
// milliseconds. It is therefore allowed to happen when the deck changes or the room does, and at
// no other time — which `data-table-measure.test.tsx` locks on the React side. What is locked here
// is the other half: asking twice for the same deck may not cost twice.
describe('what a second look at the same deck costs (#46)', () => {
  it('measures every value once and then remembers, so a re-fit walks no text at all', async () => {
    const { first, second } = await measurements(bigDoc())

    // The first pass really is the size the issue is about: every value of every column, and the
    // guard is worth nothing without this.
    expect(first).toBeGreaterThan(1000)
    // And the second pass, with the same deck, asks the engine for nothing.
    expect(second).toBe(0)
  }, 60_000)
})

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

// Which columns are the designer's and which are not (L4). `id` is the card's own key and `antal`
// is how many copies of the card the deck holds; neither was made by anybody and neither can be
// taken away. The head said so by leaving the × off those two headings, which is not saying it:
// the difference between "you may not" and "there is nothing here" was a hole, and a hole reads
// as an oversight.
describe('a column nobody can take away says so (#46, L4)', () => {
  it('puts a mark where the other columns keep their ×, on those two headings and no others', async () => {
    const { heads, width } = await measure(deckDoc())

    // The head really does have both kinds, so this is not a guard over a table of one of them.
    expect(heads.map((h) => h.col)).toEqual(['id', 'art', 'title', 'body', 'cost', 'antal'])
    expect(heads.filter((h) => h.canRemove).map((h) => h.col)).toEqual(['art', 'title', 'body', 'cost'])

    // The two that cannot be taken away carry a mark instead of a hole, it is really drawn, and
    // it says in words what it means — a glyph on its own is a decoration.
    const system = heads.filter((h) => !h.canRemove)
    expect(system.map((h) => h.col)).toEqual(['id', 'antal'])
    expect(system.every((h) => h.badge > 0)).toBe(true)
    expect(system.map((h) => h.says)).toEqual([sv('table.field.system', { field: 'id' }), sv('table.field.system', { field: 'antal' })])
    // And nowhere else: a column the designer made has its × and nothing else.
    expect(heads.filter((h) => h.canRemove && (h.badge > 0 || h.says !== ''))).toEqual([])

    // It costs those two columns something, and what it costs them is affordable: both are still
    // inside the width a number column has to be able to reach.
    expect(width.id!).toBeLessThanOrEqual(96)
    expect(width.antal!).toBeLessThanOrEqual(96)
  }, 60_000)
})

// What the filter and the sort may do to a width, which is nothing at all.
//
// Sorting and filtering are views of the project and never touch `doc.rows` (L4), and the
// measurement has to be read the same way or the table comes apart under the designer's hands: a
// width taken from the rows that happen to be on screen would move on every character typed into
// the search box, and every column would shuffle as well as every row.
describe('a width is a fact about the deck, not about the view (#46 on #15, #16)', () => {
  it('does not move when the filter narrows the deck to one card, or when a column is sorted', async () => {
    const [plain, filtered, sorted] = await Promise.all([
      measure(deckDoc()),
      measure(deckDoc(), { view: 'filtered' }),
      measure(deckDoc(), { view: 'sorted' }),
    ])

    // Both views really did something: the filter left one card of six on screen, and the sort
    // put a different card at the top.
    expect(plain.rows).toBe(CARDS.length)
    expect(filtered.rows).toBe(1)
    expect(sorted.first).not.toBe(plain.first)
    expect(sorted.rows).toBe(CARDS.length)

    // And neither moved a column by a pixel.
    expect(filtered.width).toEqual(plain.width)
    expect(sorted.width).toEqual(plain.width)
  }, 60_000)

  it('is a real condition: measure the rows on screen instead and the filter drags every column with it', async () => {
    // The same filtered table, handed the values of the one card still on screen instead of the
    // deck's. That is the whole fault, and it is what this file would be failing to notice if the
    // pair above were passing for some other reason.
    const onScreen: ProjectDoc = { ...deckDoc(), rows: CARDS.filter((card) => card.id === 'k4') }
    const [plain, fromScreen] = await Promise.all([measure(deckDoc()), measure(deckDoc(), { view: 'filtered', deck: onScreen })])

    expect(fromScreen.width).not.toEqual(plain.width)
    // Named, not merely different: the one card left on screen says "Ge 2 mynt", so `body` asks
    // for a fraction of what the deck asks for and the slack lands somewhere else entirely.
    expect(fromScreen.width.body!).toBeLessThan(plain.width.body!)
  }, 60_000)
})

// A deck with one sentence in it that no desk width could hold: whatever the slack, `body` ends
// up on its own floor and the value runs past the edge of the cell.
const TOO_LONG =
  'När det här kortet spelas ur handen får varje motståndare välja mellan att kasta två kort ur sin egen hand eller att lägga tillbaka det översta kortet i draghögen underst, och den som väljer det senare drar ett kort ur marknaden innan turen går vidare till nästa spelare.'
function cutDoc(): ProjectDoc {
  const doc = deckDoc()
  return { ...doc, rows: doc.rows.map((row) => (row.id === 'k3' ? { ...row, fields: { ...row.fields, body: TOO_LONG } } : row)) }
}

type Cue = {
  // Every cell the table marked as cut, as `card/column`.
  cut: string[]
  // The last 40 px of the long cell, painted — once as the page opens, and once with that very
  // cell holding the caret.
  atRest: Buffer
  focused: Buffer
}

// The ground at the right-hand edge of the long cell, read the way the felt reads its ellipsis
// (join-layout) and the way the pin's own fade is read (#53): painted twice and compared. A cue
// that is really drawn shows up as a difference between two pictures; one the stylesheet only
// asks for does not.
async function cue(doc: ProjectDoc, extra = ''): Promise<Cue> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  try {
    await page.setContent(shellOf(markupOf(doc), extra), { waitUntil: 'load' })
    const facts = await page.evaluate(
      ({ deck, decide }) => {
        const box = document.querySelector('.byd-data-scroll') as HTMLElement
        new Function('box', 'deck', `(${decide})(box, deck)`)(box, deck)
        const marked = [...box.querySelectorAll('tbody td[data-cut="true"]')]
        const long = box.querySelector('tr[data-card-ref="k3"] td[data-col="body"]') as HTMLElement
        const seen = long.getBoundingClientRect()
        return {
          cut: marked.map((cell) => `${cell.closest('tr')?.getAttribute('data-card-ref') ?? '?'}/${cell.getAttribute('data-col')}`),
          clip: { x: seen.right - 40, y: seen.top, width: 40, height: seen.height },
        }
      },
      { deck: deckValues(doc, sv), decide: String(fitColumns) },
    )
    const atRest = await page.screenshot({ clip: facts.clip })
    // The caret put in the very cell being read, and sent to the end of the value — which is where
    // an input scrolls to, and the moment `text-overflow` on an input has nothing left to say.
    await page.evaluate(() => {
      const field = document.querySelector('tr[data-card-ref="k3"] td[data-col="body"] input') as HTMLInputElement
      field.focus()
      field.setSelectionRange(field.value.length, field.value.length)
    })
    return { cut: facts.cut, atRest, focused: await page.screenshot({ clip: facts.clip }) }
  } finally {
    await page.close()
  }
}

// What a value that does not fit says for itself (#46). Once the widths are measured this is the
// exception and not the rule — six cards over `id art title body cost antal` have nothing cut at
// 1280 or at 1024 — which turns the question round: the cue has to be honest, it does not have to
// be beautiful, and there is already a gesture in the tool for it. #53 drew it: a value going
// under the pinned × fades out rather than stopping mid-word. This is the same fade at the same
// width over the same ground, at the edge of the cell rather than the edge of the pin.
const FORCED = { off: '.byd-data td[data-cut="true"] input { mask-image: none !important; -webkit-mask-image: none !important; }' }

describe('a value that does not fit says so (#46)', () => {
  it('is marked on the cells that really are cut, and on no others', async () => {
    const [long, fits] = await Promise.all([cue(cutDoc()), cue(deckDoc())])

    // The one card whose rules text no desk width could hold is marked, in the column that holds
    // it. Two other columns are squeezed onto their floors to pay for it, and the cards whose
    // words are short are not marked at all.
    expect(long.cut).toContain('k3/body')
    expect(long.cut.filter((at) => at.endsWith('/cost') || at.endsWith('/antal'))).toEqual([])

    // And the case the measurement is actually for: with six cards and the same six columns,
    // nothing anywhere in the table is cut. A cue that were on all the time would say nothing.
    expect(fits.cut).toEqual([])
  }, 60_000)

  it('is painted at the edge of the cell, and is still painted while that cell holds the caret', async () => {
    const [shown, bare] = await Promise.all([cue(cutDoc()), cue(cutDoc(), FORCED.off)])

    // At rest: the ground at the cell's edge is painted differently from the same ground with the
    // cue taken back.
    expect(shown.atRest.equals(bare.atRest)).toBe(false)

    // And with the caret in that very cell, which is the whole reason the cue is drawn on the
    // cell and not on the input inside it.
    expect(shown.focused.equals(bare.focused)).toBe(false)
  }, 60_000)

  it('is not what an input can say for itself: its own ellipsis goes silent the moment the cell takes the caret', async () => {
    // The cheapest possible answer, measured rather than argued about: the cue taken back and
    // `text-overflow: ellipsis` put on the cell's own input in its place. It works — and only
    // while nobody is reading it.
    const cheap = await cue(cutDoc(), `${FORCED.off} .byd-data input { text-overflow: ellipsis; }`)
    const bare = await cue(cutDoc(), FORCED.off)

    // Unfocused it does say something: the ellipsis is painted where the value stops.
    expect(cheap.atRest.equals(bare.atRest)).toBe(false)
    // Focused it says nothing at all. The input has scrolled to the caret and the ellipsis is
    // gone, so the two pictures are the bare ground twice over — which is the finding that put
    // the cue on the cell.
    expect(cheap.focused.equals(bare.focused)).toBe(true)
  }, 60_000)
})
