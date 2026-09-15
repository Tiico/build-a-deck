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
import { deckValues, fitColumns, markValues } from '../src/editor/columns.js'
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
      onMoveField={() => undefined}
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
  // And every column holding a value that did not fit at the width it came out at, which is the
  // other half of the same question: a width is only right if what stands in it can be read.
  cut: string[]
}

// The table laid out in a real engine at `width`, with the editor's own measurement run on the
// page. `fit: false` leaves it unmeasured, which is what every control case below needs.
async function measure(doc: ProjectDoc, { width = 1280, fit = true, extra = '', view = 'plain' as View, deck = doc, html = '' } = {}): Promise<Measured> {
  const page = await browser.newPage({ viewport: { width, height: 800 } })
  try {
    await page.setContent(shellOf(html || markupOf(doc, view), extra), { waitUntil: 'load' })
    return (await page.evaluate(
      ({ deck, fit, decide, mark }) => {
        const box = document.querySelector('.byd-data-scroll') as HTMLElement
        // The editor's own decisions, run on the page rather than described by the test: the
        // widths, and then — at those widths — which values did not fit.
        if (fit) new Function('box', 'deck', `(${decide})(box, deck)`)(box, deck)
        // Which values did not fit is asked at the widths the measurement made, and only there:
        // the cue the mark turns on has a padding of its own, so asking it of the control case —
        // the auto layout, which is sized by the cells — would be measuring the question.
        if (fit) new Function('box', `(${mark})(box)`)(box)
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
          cut: [...new Set([...table.querySelectorAll('tbody td[data-cut="true"]')].map((cell) => cell.getAttribute('data-col') ?? '?'))],
        }
      },
      { deck: deckValues(deck, sv), fit, decide: String(fitColumns), mark: String(markValues) },
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

    // Named rather than counted, and by how much: the floor is 80, and both number columns are
    // under it — `antal` since the padlock beside its word moved to the head's own door and gave
    // the column its nineteen pixels back (#46 on #32).
    expect([...new Set(over.spill.map((c) => c.col))]).toEqual(['cost', 'antal'])
    expect(over.spill.every((c) => c.px === 80 - over.width[c.col]!)).toBe(true)
    expect(over.spill.length).toBe(CARDS.length * 2)
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
// The prototype hit this and laid it at the door of `.byd-editor`, asking it for a column track
// of its own. The editor was never in danger from that, and what stops it is that nothing on the
// way down takes its width from what is standing in it: `.byd-editor > main` scrolls, and a scroll
// container has a min-content of nought, so nothing under it can push the document sideways however
// wide it gets — and the chrome above it is a column whose children are laid across it and not
// sized by it, so `main` is the width of the window whatever it holds. Either of those alone is
// enough, which is why the control below has to undo both to make the page move at all.
//
// It really is not the table's own scroller. That was named alongside `main` here once and that
// was wrong — taken away on its own, the page still does not move a pixel, because the boxes above
// have already refused to grow. The pair of them were taken away together by a single control,
// which could not tell the two apart and would have read the same if only one of them had ever
// mattered. So each is taken away on its own, and the claim is as narrow as the fact.
//
// 768 is not a width the editor is designed at (L12); it is the floor at which nothing may break,
// and a deck that runs off the screen is breaking.
describe('the table is measured against the room it really has (#46)', () => {
  it('keeps a deck too wide for 768 inside the window, scrolling the box and never the page', async () => {
    const [held, noMain, noBox] = await Promise.all([
      measure(crowdedDoc(), { width: 768 }),
      // The boxes that really carry it, taken away together: `main` no longer scrolls, and it is
      // allowed to take its width from what stands in it rather than from the window. Nothing else
      // changes: the same markup, the same measurement, at the same width. If this did not run
      // away, everything below would be measuring the browser rather than the stylesheet.
      measure(crowdedDoc(), { width: 768, extra: '.byd-editor > main { overflow: visible; width: max-content; }' }),
      // And the box that does not, taken away on its own beside it.
      measure(crowdedDoc(), { width: 768, extra: '.byd-data-scroll { overflow: visible; }' }),
    ])

    // The control, and it is the prototype's finding exactly: with nothing above the box refusing
    // to grow, the box is as wide as the table and the table is as wide as the box, the two settle
    // far outside a 768 px window, and the page scrolls to reach them.
    expect(noMain.scroll).toBe(noMain.table)
    expect(noMain.table).toBeGreaterThan(768)
    expect(noMain.page).toBeGreaterThan(0)

    // And its twin, which is what says the claim belongs to the chrome and to nothing else: with
    // the table's own scroller opened up instead — so the table really does stand at its full
    // width inside it — the page still does not move.
    expect(noBox.table).toBeGreaterThan(768)
    expect(noBox.page).toBe(0)

    // The table as it ships: the box is inside the window, the table is wider than the box —
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

// What a heading holds, and what it costs the column it names (#46 on #32).
//
// A heading used to carry two things besides its word: the × that took the column away, and — on
// the two columns nobody made — a padlock saying why there was none. Both are behind the head's
// own door now, where the table already said what it had to say about its columns as columns, and
// a heading is the word and the way it sorts. The arithmetic that made the first of those hard is
// gone with it: nothing in a heading has to be handed out in turn any more, because there is only
// one thing there to hand out.
describe("a heading is the column's name and the way it sorts (#46 on #32)", () => {
  it('carries no other control, in any column, and no column pays for one', async () => {
    const { heads, width } = await measure(deckDoc())

    // The head really has both kinds of column, so this is not a guard that matches nothing.
    expect(heads.map((h) => h.col)).toEqual(['id', 'art', 'title', 'body', 'cost', 'antal'])
    // And not one of them carries an × or a mark: no control, and no hole where one was.
    expect(heads.filter((h) => h.canRemove || h.badge > 0 || h.says !== '')).toEqual([])

    // What that buys is the width, and it is the width the issue was about: the two machine
    // columns are well inside what a number column has to be able to reach, and `antal` is no
    // longer paying the nineteen pixels the padlock beside it took.
    expect(width.id!).toBeLessThanOrEqual(80)
    expect(width.antal!).toBeLessThanOrEqual(80)
  }, 60_000)
})

// A width the designer set herself (#46).
//
// The measurement is the right answer about the deck and it is not an answer about the person
// reading it: one designer is working on the rules text and wants `body` wide whatever `art`
// asked for. So a column can be pulled to a width of its own, and the whole of what that means is
// measured here — the column takes exactly what it was given, it is not in the sharing out at
// all, and everything else goes on sharing what is left as if that column were not there.
//
// The pull itself is a pointer on a heading's edge, made in the document before the markup is
// taken: what the table declares on the column is what the measurement reads, so the two halves
// of the feature meet here on the real page rather than in a number this file made up.
function pulledMarkup(doc: ProjectDoc, field: string, by: number): string {
  const { container, unmount } = render(<Table doc={doc} />)
  const grip = container.querySelector(`thead th[data-col="${field}"] .byd-data-pull`) as HTMLElement
  fireEvent.pointerDown(grip, { pointerId: 1, button: 0, clientX: 0 })
  fireEvent.pointerMove(grip, { pointerId: 1, clientX: by })
  fireEvent.pointerUp(grip, { pointerId: 1, clientX: by })
  const html = container.innerHTML
  unmount()
  return html
}

describe('a column the designer pulled to a width of her own (#46)', () => {
  it('is drawn at exactly that width, and the rest share what is left as if it were not there', async () => {
    const [measured, pulled] = await Promise.all([measure(deckDoc()), measure(deckDoc(), { html: pulledMarkup(deckDoc(), 'body', 320) })])

    // The deck really does ask for something else, so this is not a guard over a width that was
    // going to come out at 320 anyway.
    expect(measured.width.body).not.toBe(320)
    // And what she asked for is what she got, to the pixel.
    expect(pulled.width.body).toBe(320)

    // The columns that share the rest have shared the rest: `art` and `title` are the two other
    // sentences, and both are wider than they were, because 320 is less than `body` was taking.
    expect(pulled.width.art!).toBeGreaterThan(measured.width.art!)
    expect(pulled.width.title!).toBeGreaterThan(measured.width.title!)
    // A number is a number wide whatever else happens, pulled column or no pulled column.
    expect(pulled.width.cost).toBe(measured.width.cost)
    expect(pulled.width.antal).toBe(measured.width.antal)

    // The row still ends where the last field ends, and the page still does not run sideways.
    expect(Object.values(pulled.width).reduce((a, b) => a + b, 0)).toBe(pulled.table)
    expect(pulled.table).toBe(pulled.scroll)
    expect(pulled.page).toBe(0)
  }, 60_000)

  it('does not take room off the others for a table that cannot fit anyway', async () => {
    const wide = await measure(deckDoc(), { html: pulledMarkup(deckDoc(), 'body', 1100) })

    // 1100 px for `body` alone leaves the table wider than the window whatever everybody else
    // gives up, so the box scrolls — which is the honest answer and the case the pinned × was
    // drawn for (#53).
    expect(wide.table).toBeGreaterThan(wide.scroll)
    // And then there is nothing to buy by taking the room off the sentences that are still
    // measuring themselves. It was taken anyway: `art` was pushed down to what its own heading
    // needs and its values were cut, inside a table that was going to scroll either way.
    expect(wide.cut).toEqual([])
  }, 60_000)

  it('keeps its width when there is less room, where a measured column would give some back', async () => {
    const [wide, narrow] = await Promise.all([
      measure(deckDoc(), { html: pulledMarkup(deckDoc(), 'body', 320) }),
      measure(deckDoc(), { width: 1024, html: pulledMarkup(deckDoc(), 'body', 320) }),
    ])

    // A narrower window takes its 256 px out of the sentences that are still measuring themselves
    // — and not out of the one that was told what it is. That is the whole difference between a
    // width the deck asked for and a width the designer set.
    expect(narrow.width.body).toBe(320)
    expect(narrow.width.art!).toBeLessThan(wide.width.art!)
    expect(narrow.width.title!).toBeLessThan(wide.width.title!)
    expect(narrow.table).toBe(narrow.scroll)
  }, 60_000)
})

// What a thumb aimed at the middle of the narrowest heading lands on. Read with
// `elementFromPoint` rather than argued about, because that is the question the browser itself
// answers when the click comes.
//
// Two tap targets never did fit side by side in a column a number wide — 44 and 44 do not go into
// 64 — and the heading used to hand them out in turn: at rest the whole heading sorted, and with
// the pointer on it the × took its 44 px and left the sort control ten. That was the honest answer
// to the question as it stood, and the question has since been taken away: the × is behind the
// head's own door (#46 on #32), so the heading is one control at every width, in every state.
type Reach = {
  // The column, and how wide it came out.
  width: number
  // The sort control's own box, and what the browser finds at the middle of it — `self` when that
  // is the control itself, otherwise what is standing in the way.
  sort: { w: number; h: number; at: string }
  // Anything else in the heading at all, which is the other half of the same answer.
  others: number
}

async function reach(doc: ProjectDoc, { hover = false } = {}): Promise<Reach> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  try {
    await page.setContent(shellOf(markupOf(doc), ''), { waitUntil: 'load' })
    await page.evaluate(
      ({ deck, decide }) => {
        const box = document.querySelector('.byd-data-scroll') as HTMLElement
        new Function('box', 'deck', `(${decide})(box, deck)`)(box, deck)
      },
      { deck: deckValues(doc, sv), decide: String(fitColumns) },
    )
    // The pointer really put on the heading, so `:hover` is the browser's own and not a class the
    // test wrote. Aimed at the heading's left edge, which is the part that is the word.
    if (hover) {
      const th = (await page.$('th[data-col="cost"]'))!
      const seen = (await th.boundingBox())!
      await page.mouse.move(seen.x + 3, seen.y + seen.height / 2)
    }
    return (await page.evaluate(() => {
      const th = document.querySelector('th[data-col="cost"]') as HTMLElement
      const el = th.querySelector('button') as HTMLElement
      const seen = el.getBoundingClientRect()
      const hit = document.elementFromPoint(seen.left + seen.width / 2, seen.top + seen.height / 2)
      const name = hit === el ? 'self' : `${hit?.tagName ?? '(nothing)'}${(hit as HTMLElement | null)?.className ? `.${(hit as HTMLElement).className}` : ''}`
      return {
        width: Math.round(th.getBoundingClientRect().width),
        sort: { w: Math.round(seen.width), h: Math.round(seen.height), at: name },
        others: th.querySelectorAll('button, a, input, select').length - 1,
      }
    })) as Reach
  } finally {
    await page.close()
  }
}

describe('what a tap on the narrowest heading lands on (#46 on #32)', () => {
  it('gives the whole heading to the one control in it, pointed at or not', async () => {
    const [atRest, pointed] = await Promise.all([reach(deckDoc()), reach(deckDoc(), { hover: true })])

    // The column really is the narrow one the issue exists to make, and narrower than two tap
    // targets — without that this is a guard over a heading with room for both.
    expect(atRest.width).toBeLessThan(2 * 44)
    // One control, and it answers for its own middle.
    expect(atRest.others).toBe(0)
    expect(atRest.sort.at).toBe('self')

    // And the pointer changes nothing. The heading used to be two different shapes depending on
    // where the hand was resting; it is one shape now.
    expect(pointed.sort).toEqual(atRest.sort)
    expect(pointed.others).toBe(0)
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

// The deck with a sentence half written into it: the longest rules text in it — the one the whole
// column's width is taken from — with a clause being added to it a character at a time.
function typedDoc(chars: number): ProjectDoc {
  const doc = deckDoc()
  const grown = `${CARDS[2]!.fields.body}${' och sedan en gång till'.slice(0, chars)}`
  return { ...doc, rows: doc.rows.map((row) => (row.id === 'k3' ? { ...row, fields: { ...row.fields, body: grown } } : row)) }
}

// The same fact as the filter's, reached through the other door — and the one that actually moves
// the table under the designer's hands, because she is *in* the cell while it happens.
//
// The slack is handed out in proportion to what each column asked for, so when `body`'s widest
// value grows by seven pixels a character, `art` and `title` give up a pixel or two each and every
// boundary to their right moves. That includes the right-hand edge of the cell being typed in: the
// caret creeps away under the hand writing at it. So the widths are measured from the deck as it
// was when the caret arrived, and settle when it leaves — which is what the table already does
// with the row order, for the same reason.
describe('a width does not move while its own cell is being typed in (#46)', () => {
  it('draws every boundary where it stood, however many characters have gone into the cell', async () => {
    const held = deckDoc()
    const typed = await Promise.all([0, 1, 2, 3, 5, 8, 13, 21].map((chars) => measure(typedDoc(chars), { deck: held })))

    // The cell really is growing — the markup differs from keystroke to keystroke — and the table
    // does not. Every column is the width it was before the first character.
    const first = typed[0]!
    for (const at of typed) expect(at.width).toEqual(first.width)
    expect(typed.at(-1)!.table).toBe(first.table)
  }, 60_000)

  it('is a real condition: measure on the keystroke instead and every boundary moves, one character at a time', async () => {
    const [before, after] = await Promise.all([measure(typedDoc(0)), measure(typedDoc(21))])

    // Named rather than merely different: the sentence being written takes the room, and it takes
    // it from the other two text columns — which is what pushes the boundary the caret stands at.
    expect(after.width.body!).toBeGreaterThan(before.width.body!)
    expect(after.width.art!).toBeLessThan(before.width.art!)
    expect(after.width.title!).toBeLessThan(before.width.title!)
  }, 60_000)
})

// A deck with nothing in it that wants a sentence's room: four numbers and the card's own key.
// Nothing here gives or takes, so the whole handing-out of the slack is skipped and every column
// is drawn at exactly what it asked for — which is the case where the table's own declared floor
// is the only thing left with an opinion about its width.
function numbersDoc(): ProjectDoc {
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
          base: ['cost', 'styrka', 'liv'].map((field, i) => ({
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
    rows: [
      { id: 'k1', fields: { cost: 3, styrka: 2, liv: 5, antal: 2 } },
      { id: 'k2', fields: { cost: 2, styrka: 4, liv: 1, antal: 4 } },
      { id: 'k3', fields: { cost: 5, styrka: 1, liv: 3, antal: 1 } },
    ],
  }
}

// What the measured total is worth if the stylesheet is still allowed to overrule it.
//
// `min-width: 100%` was written for the layout the measurement replaced, and under `table-layout:
// fixed` it does not merely widen the table — it hands the difference back out across every
// column, numbers included. A deck with a text column hides that completely: the sentences absorb
// the slack until the total is the room anyway, so the floor never bites. A deck with no text
// column has nothing to absorb it, and every column stretches in proportion. That is the issue's
// own opening symptom, back again, on the one shape of deck no test covered.
describe('the measured total is the table (#46)', () => {
  it('leaves a deck of numbers at the widths it measured, and ends the row where the last field ends', async () => {
    const at = await measure(numbersDoc())

    // Nothing in this deck gives or takes, so this really is the case with no sentence to absorb
    // the slack — and there is a great deal of slack: the table is far inside a 1280 px box.
    expect(at.columns.map((c) => c.head)).toEqual(['check', 'id', 'cost', 'styrka', 'liv', 'antal', 'remove'])
    expect(at.table).toBeLessThan(at.scroll - 400)
    // Every column is a number's width, and the sum of them is the table.
    for (const col of ['cost', 'styrka', 'liv', 'antal']) expect(at.width[col]!).toBeLessThanOrEqual(96)
    expect(Object.values(at.width).reduce((a, b) => a + b, 0)).toBe(at.table)
  }, 60_000)

  it('is a real condition: let the table keep its old floor and every column stretches, numbers and all', async () => {
    const at = await measure(numbersDoc(), { extra: '.byd-data { min-width: 100% !important; }' })

    // The table fills the box because it was told to, and it pays for it out of the columns the
    // measurement had just made narrow.
    expect(at.table).toBe(at.scroll)
    expect(at.width.cost!).toBeGreaterThan(96)
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
  // The value itself rather than the cue beside it: the stretch of the cell the last characters
  // stand in, photographed with the caret at the end and one more character just typed. That is
  // where the cue has no business being, and it is the picture the old one failed.
  written: Buffer
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
      ({ deck, decide, mark }) => {
        const box = document.querySelector('.byd-data-scroll') as HTMLElement
        // Both of the editor's own decisions, in the order it makes them: the widths, and then —
        // at those widths — which values did not fit.
        new Function('box', 'deck', `(${decide})(box, deck)`)(box, deck)
        new Function('box', `(${mark})(box)`)(box)
        const marked = [...box.querySelectorAll('tbody td[data-cut="true"]')]
        const long = box.querySelector('tr[data-card-ref="k3"] td[data-col="body"]') as HTMLElement
        const seen = long.getBoundingClientRect()
        return {
          cut: marked.map((cell) => `${cell.closest('tr')?.getAttribute('data-card-ref') ?? '?'}/${cell.getAttribute('data-col')}`),
          clip: { x: seen.right - 40, y: seen.top, width: 40, height: seen.height },
          // The text's own ground, stopping short of the strip the cue stands in. Nothing the cue
          // does may show up here.
          ink: { x: seen.right - 48, y: seen.top, width: 24, height: seen.height },
        }
      },
      { deck: deckValues(doc, sv), decide: String(fitColumns), mark: String(markValues) },
    )
    const atRest = await page.screenshot({ clip: facts.clip })
    // The caret put in the very cell being read, and sent to the end of the value — which is where
    // an input scrolls to, and the moment `text-overflow` on an input has nothing left to say.
    await page.evaluate(() => {
      const field = document.querySelector('tr[data-card-ref="k3"] td[data-col="body"] input') as HTMLInputElement
      field.focus()
      field.setSelectionRange(field.value.length, field.value.length)
    })
    const focused = await page.screenshot({ clip: facts.clip })
    // And one more character written at that caret, which is the moment the question is really
    // about: an input scrolls to the cursor, so what has just been typed is what stands nearest
    // the edge of the cell — under whatever the cell has drawn there.
    await page.keyboard.type('M')
    return { cut: facts.cut, atRest, focused, written: await page.screenshot({ clip: facts.ink }) }
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
// `off` takes the whole cue back — the fade out of the value and the mark beside it — and nothing
// else: the room the cue stands in is still reserved, so the value is drawn in exactly the same
// place with the cue on as with it off. That is what makes "the value is painted identically"
// a statement about the cue and not about the layout. `erasing` is the cue as it was first
// written, laid over the value with no room reserved at all.
const FORCED = {
  off: '.byd-data td[data-cut="true"] input { mask-image: none !important; -webkit-mask-image: none !important; } .byd-data td[data-cut="true"]::after { content: none !important; }',
  erasing:
    '.byd-data td[data-cut="true"]::after { content: none !important; } .byd-data td[data-cut="true"] input, .byd-data td[data-cut="true"] input:focus { padding-right: 10px !important; mask-image: linear-gradient(to right, #000 calc(100% - 24px), rgb(0 0 0 / 0%)) !important; -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 24px), rgb(0 0 0 / 0%)) !important; }',
}

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

  it('never touches what is being written: a character typed at the end of a cut cell is painted whole', async () => {
    const [shown, bare] = await Promise.all([cue(cutDoc()), cue(cutDoc(), FORCED.off)])

    // The value, with the caret at its end and a character just added, is painted exactly as it is
    // with the cue taken away altogether. The cue stands beside the writing; it is not over it.
    expect(shown.written.equals(bare.written)).toBe(true)
  }, 60_000)

  it('is a real condition: laid over the value instead, the cue rubs out the character just typed', async () => {
    // The cue as it was first written — a fade taken out of the value itself, over the last 24 px,
    // with no room reserved. An input scrolls to the caret, so in a cut cell the cursor sits about
    // ten pixels from the edge, at something like four tenths of an alpha: what the designer is
    // typing fades away as she types it. The assertion above would pass for a cue that did nothing
    // at all, so this is what says it does not.
    const [erasing, bare] = await Promise.all([cue(cutDoc(), FORCED.erasing), cue(cutDoc(), FORCED.off)])

    expect(erasing.written.equals(bare.written)).toBe(false)
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

// What the button that makes a column does when the pointer arrives on it (#46).
//
// It stands in the head's last cell (#32), and that cell is a `th` like every other — so the rule
// that hands a heading's right-hand 44 px to the × reaches this one too, and here there is nothing
// to hand over: the cell *is* 44 px wide. `max-width: calc(100% - var(--byd-tap) + head-pad)`
// leaves the `+` ten pixels the moment it is pointed at. The pointer is then standing beside the
// button rather than on it, the hover it caused ends, the button grows back to 44, the pointer is
// on it again — and that is the flicker the designer sees, as fast as the browser can draw it, for
// as long as the hand rests there.
//
// Measured from the pointer's side and not the stylesheet's: the button's own box with the mouse
// really on it, and what `elementFromPoint` finds in its middle.
type Plus = { w: number; h: number; left: number; at: string }

async function plus(doc: ProjectDoc, { hover = false } = {}): Promise<Plus> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  try {
    await page.setContent(shellOf(markupOf(doc), ''), { waitUntil: 'load' })
    await page.evaluate(
      ({ deck, decide }) => {
        const box = document.querySelector('.byd-data-scroll') as HTMLElement
        new Function('box', 'deck', `(${decide})(box, deck)`)(box, deck)
      },
      { deck: deckValues(doc, sv), decide: String(fitColumns) },
    )
    const button = (await page.$('thead .byd-data-remove > button'))!
    if (hover) {
      const seen = (await button.boundingBox())!
      await page.mouse.move(seen.x + seen.width / 2, seen.y + seen.height / 2)
    }
    return (await page.evaluate(() => {
      const el = document.querySelector('thead .byd-data-remove > button') as HTMLElement
      const seen = el.getBoundingClientRect()
      const hit = document.elementFromPoint(seen.left + seen.width / 2, seen.top + seen.height / 2)
      return {
        w: Math.round(seen.width),
        h: Math.round(seen.height),
        left: Math.round(seen.left),
        at: hit === el ? 'self' : `${hit?.tagName ?? '(nothing)'}${(hit as HTMLElement | null)?.className ? `.${(hit as HTMLElement).className}` : ''}`,
      }
    })) as Plus
  } finally {
    await page.close()
  }
}

describe('the button that makes a column, with the pointer on it (#46, #32)', () => {
  it('is the same button pointed at as at rest: same size, same place, and its own middle', async () => {
    const [atRest, pointed] = await Promise.all([plus(deckDoc()), plus(deckDoc(), { hover: true })])

    // At rest it is what the head's last cell is: a tap across and a tap down.
    expect(atRest.w).toBe(44)
    expect(atRest.at).toBe('self')

    // And the pointer changes none of it. A control that shrinks out from under the hand that
    // reached for it cannot be pressed on purpose.
    expect(pointed.w).toBe(atRest.w)
    expect(pointed.h).toBe(atRest.h)
    expect(pointed.left).toBe(atRest.left)
    expect(pointed.at).toBe('self')
  }, 60_000)
})
