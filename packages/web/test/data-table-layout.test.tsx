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
import { DataTable } from '../src/editor/DataTable.js'
import type { ProjectDoc } from '../src/editor/types.js'
import { projectDoc } from './project-doc.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')

type Box = { x: number; y: number; w: number; h: number }
// `box` is the header cell; `ink` is the control the designer actually reads inside it, which is
// what a row grown taller moves even when the cell's own top stays where it was.
type Head = { row: Box; headings: { name: string; box: Box; ink: Box }[]; form: Box | null; scroll: Box; firstRow: Box }

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

// `extra` is a stylesheet appended after the editor's own, so a rule can be taken back for the
// control case below.
async function measure(html: string, extra = ''): Promise<Head> {
  const page = await browser.newPage({ viewport: { width: VIEW.w, height: VIEW.h } })
  try {
    const shell = read('index.html')
      .replace('<script type="module" src="/src/main.tsx"></script>', '')
      .replace('</head>', `<style>${read('src/editor/editor.css')}${extra}</style></head>`)
      .replace('<div id="root"></div>', `<div id="root"><div class="byd-editor" data-page="editor" data-mode="table"><main><div role="tabpanel">${html}</div></main></div></div>`)
    await page.setContent(shell, { waitUntil: 'load' })
    return (await page.evaluate(() => {
      const box = (el: Element | null): Box | null => {
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
      }
      const headings = [...document.querySelectorAll('.byd-data thead th')]
        .map((th) => ({ name: (th.querySelector('button')?.textContent ?? th.textContent ?? '').trim(), box: box(th)!, ink: box(th.querySelector('button') ?? th)! }))
        .filter((h) => h.name !== '')
      return {
        row: box(document.querySelector('.byd-data thead tr'))!,
        headings,
        form: box(document.querySelector('.byd-newfield')),
        scroll: box(document.querySelector('.byd-data-scroll'))!,
        firstRow: box(document.querySelector('.byd-data tbody tr'))!,
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
