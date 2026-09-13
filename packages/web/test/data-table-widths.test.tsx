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
        for (const th of table.querySelectorAll('thead > tr > *')) out[named(th)] = Math.round(th.getBoundingClientRect().width)
        return {
          width: out,
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
