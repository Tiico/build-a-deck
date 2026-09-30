// @vitest-environment jsdom
// The icon control in a cell (#140, #593).
//
// The `{ }` that opens the symbol picker was drawn to be a small plate with a warm glyph on it.
// It was in fact 44 × 44 px, transparent and grey, lying on top of the cell's own value — three
// rules colliding in the cascade and nobody choosing any of it. In a 64 px `typ` column it covered
// 61 % of the cell, and a click where the caret belongs wrote a `{` into the card.
//
// #140 answered with a lane: a 26 px column reserved in every cell beside the field, so that the
// two never shared ground. It kept the field clear, but it made the control 26 px wide — under the
// 44 px every target in the editor is held to (L12, #570) — and a 44 px lane would have cost every
// text cell 18 px more, all the time, to hold a control drawn in one cell at a time.
//
// The decision since #593 (beställarens beslut A) is a tab: the control is 44 × 44 px and stands on
// the field's top right corner, over the row above — the row the designer has already left — and
// is drawn only in the cell being worked in. The lane is gone, so the field has the whole cell and
// every text cell got its 26 px back. The field still never moves when the caret arrives, and the
// control still never lies over it.
//
// jsdom lays nothing out, so this is asked of a real engine against the stylesheet the editor
// ships, the way the head of the table is (#32, #46).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { useState } from 'react'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { chromium, type Browser } from 'playwright'
import { DataTable } from '../src/editor/DataTable.js'
import { deckValues, fitColumns, markValues } from '../src/editor/columns.js'
import type { ProjectDoc } from '../src/editor/types.js'
import { translate, type T } from '../src/i18n/index.js'
import { template } from './project-doc.js'
import { twoSeatSetup } from './fixture.js'

const sv: T = (key, params) => translate('sv', key, params)
const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')

// A deck whose columns are the two shapes the issue is about: `typ` and `raritet` hold a word, so
// they are measured narrow and are where a 44 px control does its damage; `title` and `body` hold
// a sentence and are where there is room enough to hide the fault.
const TYPES = ['Playcard', 'Location', 'Effect', 'Shopcard'] as const
const RARITIES = ['Diamant', 'Guld', 'Koppar', 'Silver'] as const
function saloonDoc(): ProjectDoc {
  const { zones, seats, floor } = twoSeatSetup()
  return {
    name: "Sal's Saloon",
    template: template(),
    rows: Array.from({ length: 8 }, (_, i) => ({
      id: `card-${i}`,
      fields: {
        title: ['Juice em Up', "Sal's Saloon", 'Duel', 'Stolen Goods'][i % 4]!,
        body: 'En mening ungefär så lång som en riktig korttext brukar bli när den fått plats.',
        typ: TYPES[i % TYPES.length]!,
        raritet: RARITIES[i % RARITIES.length]!,
        antal: (i % 4) + 1,
      },
    })),
    icons: {},
    fonts: {
      'sans-serif': { stack: 'sans-serif', asset: `asset:${'a'.repeat(64)}` },
      'system-ui': { stack: 'system-ui', asset: `asset:${'b'.repeat(64)}` },
    },
    setup: { zones, seats, floor, deckZone: 'draw' },
  }
}

// Every column the icon path reaches: each of the deck's own, except the one the engine owns.
// `antal` is a count and a brace in it is not a symbol, which is the table's own rule.
const RAILED = ['typ', 'title', 'body', 'raritet'] as const

// What the designer writes in, whichever shape the column gives it. `body` is a writing area
// since L39 (#324) and the others are fields, and the question this file asks is the same of
// both: the control may not lie over the place the caret goes. So the place the caret goes is
// looked up by what it is for and not by what tag it happens to be.
const FIELD = 'input, [role="textbox"]'

// The columns written in a one-line field, which is where the `{ }` control is drawn. `body` is a
// writing area with a toolbar of its own (#324), and the questions below are about this control.
const FIELDS = ['typ', 'title', 'raritet'] as const

function Table() {
  const [doc, setDoc] = useState(saloonDoc)
  return (
    <DataTable
      doc={doc}
      selectedRow={null}
      onSelectRow={() => undefined}
      onCell={(cardRef, field, value) =>
        setDoc((now) => ({ ...now, rows: now.rows.map((r) => (r.id === cardRef ? { ...r, fields: { ...r.fields, [field]: value } } : r)) }))
      }
      onAddRow={() => undefined}
      onRemoveRow={() => undefined}
      onReplaceRows={() => undefined}
      onAddField={() => undefined}
      onRemoveField={() => undefined}
      onMoveField={() => undefined}
      // Without this there is no icon path at all, and the cell has nothing to keep out of the
      // field's way. It is what puts the `{ }` in the cell being worked in.
      onSymbol={async () => 'svärd'}
    />
  )
}

// The table's markup with one field's first cell being the one worked in, which is the only
// moment the control is drawn — and `null` for the markup with no cell open at all.
function markup(open: string | null): string {
  const { container, unmount } = render(<Table />)
  try {
    if (open !== null) fireEvent.focus(screen.getByLabelText(`card-0 ${open}`))
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

// The editor's own two decisions about width, run on the page in the order it makes them.
const FIT = `(box, deck) => { (${String(fitColumns)})(box, deck); (${String(markValues)})(box) }`

let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser.close()
}, 60_000)

async function measure<T_>(html: string, width: number, read_: (page: import('playwright').Page) => Promise<T_>): Promise<T_> {
  const page = await browser.newPage({ viewport: { width, height: 800 } })
  try {
    await page.setContent(shellOf(html), { waitUntil: 'load' })
    await page.evaluate(({ deck, fit }) => new Function('box', 'deck', `(${fit})(box, deck)`)(document.querySelector('.byd-data-scroll'), deck), {
      deck: deckValues(saloonDoc(), sv),
      fit: FIT,
    })
    return await read_(page)
  } finally {
    await page.close()
  }
}

// The two desks the editor is held to, and the narrowest it is reviewed at. The fault got worse
// the narrower the column, so the narrow desk is the one that matters most here.
const DESKS = [1024, 1280, 1440] as const

describe.each(DESKS)('a cell with the icon path, at %ipx', (width) => {
  it('never lets the control lie over the field, in any column', async () => {
    const found: Record<string, string[]> = {}
    for (const field of RAILED) {
      found[field] = await measure(markup(field), width, (page) =>
        page.evaluate(({ f, FIELD }) => {
          const td = document.querySelector<HTMLElement>(`.byd-data tbody tr td[data-col="${f}"]`)
          if (!td) return [`no cell for ${f}`]
          const input = td.querySelector<HTMLElement>(FIELD)
          if (!input) return [`no field in ${f}`]
          const controls = [...td.querySelectorAll('button')]
          // The control has to be there at all, or this reports a clean cell for a cell with
          // nothing in it — which is the shape of guard this repo keeps finding it needs.
          if (controls.length === 0) return [`no control in ${f}`]
          const field_ = input.getBoundingClientRect()
          return controls
            .map((control) => {
              const over = control.getBoundingClientRect()
              const across = Math.min(field_.right, over.right) - Math.max(field_.left, over.left)
              const down = Math.min(field_.bottom, over.bottom) - Math.max(field_.top, over.top)
              return across > 0.5 && down > 0.5 ? `${control.className} covers ${Math.round(across)}×${Math.round(down)} px of the field` : null
            })
            .filter((said): said is string => said !== null)
        }, { f: field, FIELD }),
      )
    }
    expect(found).toEqual(Object.fromEntries(RAILED.map((f) => [f, []])))
  }, 120_000)

  it('answers a press where the caret belongs with the field, and not with the control', async () => {
    const found: Record<string, string> = {}
    for (const field of RAILED) {
      found[field] = await measure(markup(field), width, (page) =>
        page.evaluate(({ f, FIELD }) => {
          const td = document.querySelector<HTMLElement>(`.byd-data tbody tr td[data-col="${f}"]`)!
          const input = td.querySelector<HTMLElement>(FIELD)!
          const at = input.getBoundingClientRect()
          // The middle of the field's right-hand half, which is the press the issue names: where
          // the caret belongs after a short value, and the very press that wrote a `{` into the
          // card. Not the last pixel before the edge — the old control left a 5 px gap there, so
          // a probe aimed at the edge would have agreed with a cell it was covering.
          const hit = document.elementFromPoint(at.left + at.width * 0.75, at.top + at.height / 2)
          // A writing area has the sentence's own elements inside it, so the press lands on a
          // paragraph rather than on the box around it — and that is the caret arriving where it
          // belongs, which is what is being asked. A field has nothing inside it to land on, so
          // for one of those this is the same question it always was.
          return hit !== null && (hit === input || input.contains(hit)) ? 'the field' : `${hit?.tagName.toLowerCase()}.${hit instanceof Element ? [...hit.classList].join('.') : '—'}`
        }, { f: field, FIELD }),
      )
    }
    expect(found).toEqual(Object.fromEntries(RAILED.map((f) => [f, 'the field'])))
  }, 120_000)

  it('leaves every field where it was whether the control is drawn or not, so none moves under the caret', async () => {
    // The control is only ever drawn in the cell being worked in. If drawing it took room from the
    // field, every field in the column would jump the moment the caret arrived — the same fault as
    // the overlap, arriving by movement instead of by paint.
    const widths = (page: import('playwright').Page) =>
      page.evaluate(
        ({ fields, FIELD }) =>
          Object.fromEntries(
            fields.map((f) => {
              const td = document.querySelector(`.byd-data tbody tr td[data-col="${f}"]`)!
              return [f, Math.round(td.querySelector(FIELD)!.getBoundingClientRect().width)]
            }),
          ),
        { fields: [...RAILED], FIELD },
      )
    const closed = await measure(markup(null), width, widths)
    const open = await measure(markup('typ'), width, widths)
    expect(open).toEqual(closed)
  }, 120_000)

  it('draws the control a whole target, 44 × 44 px, standing on the field’s top right corner', async () => {
    const found: Record<string, string> = {}
    for (const field of FIELDS) {
      found[field] = await measure(markup(field), width, (page) =>
        page.evaluate((f) => {
          const td = document.querySelector<HTMLElement>(`.byd-data tbody tr td[data-col="${f}"]`)!
          const control = td.querySelector<HTMLElement>('.byd-data-icon')
          if (!control) return `no control in ${f}`
          const c = control.getBoundingClientRect()
          const at = td.querySelector('input')!.getBoundingClientRect()
          return `${Math.round(c.width)}×${Math.round(c.height)}, ${Math.round(at.right - c.right)} px in from the field's right, ${Math.round(at.top - c.bottom)} px above it`
        }, field),
      )
    }
    expect(found).toEqual(Object.fromEntries(FIELDS.map((f) => [f, "44×44, 0 px in from the field's right, 0 px above it"])))
  }, 120_000)

  it('gives the field the whole cell, with nothing reserved beside it', async () => {
    // The lane the control used to stand in was 26 px of every text cell at rest. Nothing may be
    // kept there now: the field ends where the cell does.
    const kept = await measure(markup(null), width, (page) =>
      page.evaluate((fields) => Object.fromEntries(fields.map((f) => {
        const td = document.querySelector<HTMLElement>(`.byd-data tbody tr td[data-col="${f}"]`)!
        return [f, Math.round(td.getBoundingClientRect().right - td.querySelector('input')!.getBoundingClientRect().right)]
      })), [...FIELDS]),
    )
    expect(kept).toEqual(Object.fromEntries(FIELDS.map((f) => [f, 0])))
  }, 120_000)

  it('can be seen and pressed in the first row, where what is above it is the table’s head', async () => {
    // The head is sticky and painted over the rows; a tab that went under it would be a control
    // that is there and cannot be seen or reached, in the row a new table starts in.
    const found: Record<string, string> = {}
    for (const field of FIELDS) {
      found[field] = await measure(markup(field), width, (page) =>
        page.evaluate((f) => {
          const control = document.querySelector<HTMLElement>(`.byd-data tbody tr:first-child td[data-col="${f}"] .byd-data-icon`)
          if (!control) return `no control in ${f}`
          const c = control.getBoundingClientRect()
          const hit = document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2)
          return hit === control || control.contains(hit) ? 'the control' : `${hit?.tagName.toLowerCase()}`
        }, field),
      )
    }
    expect(found).toEqual(Object.fromEntries(FIELDS.map((f) => [f, 'the control'])))
  }, 120_000)
})

describe('a word-wide column is wide enough for its widest word (#130)', () => {
  it('leaves `typ`, `raritet` and `title` whole at 1280, with the control drawn', async () => {
    // What #130 measured and fixed: `Play…` and `Sal's Sa…`. The control stands above the field
    // now and takes nothing of its width, so the column's own measurement is the whole answer.
    const cut = await measure(markup('typ'), 1280, (page) =>
      page.evaluate(() =>
        ['typ', 'raritet', 'title']
          .map((f) => {
            const input = document.querySelector<HTMLInputElement>(`.byd-data tbody tr td[data-col="${f}"] input`)!
            return input.scrollWidth > input.clientWidth + 1 ? `${f}: ${input.scrollWidth - input.clientWidth}px of its value is cut` : null
          })
          .filter((said): said is string => said !== null),
      ),
    )
    expect(cut).toEqual([])
  }, 120_000)
})
