// @vitest-environment jsdom
// Whether a folded sheet leaves its room behind is a layout question, and jsdom answers none: the
// column is a grid track and the sheet a row in it. So the Bord tab's markup — folded and unfolded,
// out of a real mount — is measured in a real engine against the stylesheet the editor ships
// (#301). Every number below is read back from the page; the file pins no width of its own.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { chromium, type Browser } from 'playwright'
import { EditorPage } from '../src/editor/EditorPage.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { atWidth } from './viewport.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const SHEETS = ['src/table/table.css', 'src/editor/editor.css', 'src/buttons.css', 'src/a11y.css']
// The desk the issue was reported at, and the narrower desk where the rails give way first.
const DESKS = [
  { w: 1440, h: 900 },
  { w: 1100, h: 800 },
] as const

let browser: Browser
let run: Running
beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser.close()
}, 60_000)
beforeEach(async () => {
  run = await startServer()
  await run.projects.create(run.projectId, projectDoc())
})
afterEach(async () => {
  await run.stop()
})

// The Bord tab as the editor mounts it, folded and then unfolded, as markup.
async function bordTab(width: number): Promise<{ folded: string; shown: string }> {
  atWidth(width)
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  const { unmount } = render(<EditorPage />)
  try {
    await screen.findByText('Skogens herrar')
    fireEvent.click(screen.getByRole('tab', { name: 'Bord' }))
    const folded = document.querySelector('.byd-editor')!.outerHTML
    fireEvent.click(screen.getByRole('button', { name: 'Visa spelarvyn' }))
    const shown = document.querySelector('.byd-editor')!.outerHTML
    return { folded, shown }
  } finally {
    unmount()
  }
}

type Box = { top: number; bottom: number; left: number; right: number; height: number; width: number }
type Seen = { fold: Box; sheet: Box; preview: Box | null; list: Box; felt: Box; gap: number }

async function measure(html: string, desk: { w: number; h: number }): Promise<Seen> {
  const page = await browser.newPage({ viewport: { width: desk.w, height: desk.h } })
  try {
    const shell = read('index.html')
      .replace('<script type="module" src="/src/main.tsx"></script>', '')
      .replace('</head>', `<style>${SHEETS.map(read).join('\n')}</style></head>`)
      .replace('<div id="root"></div>', `<div id="root">${html}</div>`)
    await page.setContent(shell, { waitUntil: 'load' })
    return await page.evaluate(() => {
      const box = (el: Element | null): Box => {
        if (!el) throw new Error('missing')
        const r = el.getBoundingClientRect()
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height, width: r.width }
      }
      const beside = document.querySelector('.byd-setup-beside')!
      const sheet = beside.querySelector('.byd-setup-sheet')!
      return {
        fold: box(sheet.querySelector('[aria-controls]')),
        sheet: box(sheet),
        preview: sheet.querySelector('[data-sheet-preview]') ? box(sheet.querySelector('[data-sheet-preview]')) : null,
        list: box(sheet.nextElementSibling),
        felt: box(document.querySelector('.byd-setup-felt')),
        gap: parseFloat(getComputedStyle(beside).rowGap),
      }
    })
  } finally {
    await page.close()
  }
}

describe.each(DESKS)('the folded sheet in the Bord tab at $w×$h (#301)', (desk) => {
  it('takes only its own row, hands the rest of the column to the list of tables, and is a tap high', async () => {
    const { folded, shown } = await bordTab(desk.w)
    const hidden = await measure(folded, desk)
    // Folded: the row is the button alone, and the list starts one gap under it — no empty
    // panel keeps the room the sheet had.
    expect(hidden.preview).toBeNull()
    expect(hidden.sheet.height).toBe(hidden.fold.height)
    expect(hidden.list.top).toBe(hidden.sheet.bottom + hidden.gap)
    expect(hidden.fold.height).toBeGreaterThanOrEqual(44)
    // Unfolded: the sheet lies between the button and the list, in the same column, and the
    // felt beside them is not asked to move for it.
    const open = await measure(shown, desk)
    expect(open.preview).not.toBeNull()
    expect(open.preview!.top).toBeGreaterThanOrEqual(open.fold.bottom)
    expect(open.list.top).toBe(open.sheet.bottom + open.gap)
    expect(open.preview!.left).toBeGreaterThanOrEqual(open.fold.left)
    expect(open.felt).toEqual(hidden.felt)
  }, 60_000)
})
