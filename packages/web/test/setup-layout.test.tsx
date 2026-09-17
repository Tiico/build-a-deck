// @vitest-environment jsdom
// The table stands still while its zones are worked on (#218).
//
// `.byd-setup-canvas` is a flex column: the line of chrome, then the felt at `flex: 1 1 auto`, then
// — only when a pile is selected — the sentences that say what that pile starts with. So selecting
// a pile put a panel into the column under the felt, the felt gave up the room for it, and the
// whole table rescaled: «hela bordet hoppar runt». Every slot opened inside those sentences moved
// it again, because every one of them changes how tall they are.
//
// A layout question, so it is asked of a real engine against the stylesheet the editor ships, the
// way `rules-layout` and `editor-tables-layout` ask theirs. No pixel of it is written down: what is
// claimed is that a rectangle is the same rectangle before and after, which is true at any size and
// in any font.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { chromium, type Browser, type Page } from 'playwright'
import { EditorPage } from '../src/editor/EditorPage.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { atWidth } from './viewport.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const shell = read('index.html')
const css = `${read('src/editor/editor.css')}\n${read('src/buttons.css')}\n${read('src/a11y.css')}`

const document_ = (html: string) =>
  shell
    .replace('<script type="module" src="/src/main.tsx"></script>', '')
    .replace('</head>', `<style>${css}</style></head>`)
    .replace('<div id="root"></div>', `<div id="root">${html}</div>`)

// The Bord tab as markup, with a pile either left alone or opened for its rules.
async function board(width: number, open: boolean): Promise<string> {
  atWidth(width)
  const project = `${run.projectId}-${open ? 'open' : 'shut'}`
  await run.projects.create(project, projectDoc())
  history.replaceState(null, '', `/editor?project=${project}&server=${encodeURIComponent(run.http)}`)
  const { unmount } = render(<EditorPage />)
  try {
    await screen.findByText('Skogens herrar')
    fireEvent.click(screen.getByRole('tab', { name: 'Bord' }))
    await waitFor(() => expect(document.querySelector('[data-setup-editor]')).not.toBeNull())
    if (open) {
      const row = document.querySelector('[data-zone-row="draw"]') as HTMLElement
      fireEvent.click(within(row).getByRole('button', { name: /Draghög/ }))
      await waitFor(() => expect(document.querySelector('[data-zone-actions]')).not.toBeNull())
    }
    return document.querySelector('.byd-editor')!.outerHTML
  } finally {
    unmount()
  }
}

const feltBox = (page: Page) =>
  page.evaluate(() => {
    const felt = document.querySelector<HTMLElement>('.byd-setup-felt')
    if (!felt) throw new Error('no felt in this view')
    const r = felt.getBoundingClientRect()
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
  })

let run: Running
let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser.close()
}, 60_000)
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

async function measure(width: number, height: number, open: boolean) {
  const html = await board(width, open)
  const page = await browser.newPage({ viewport: { width, height } })
  try {
    await page.setContent(document_(html), { waitUntil: 'load' })
    return await feltBox(page)
  } finally {
    await page.close()
  }
}

describe('the felt while a pile’s rules are opened (#218)', () => {
  it('is the same rectangle before and after, at 1440 × 900', async () => {
    const shut = await measure(1440, 900, false)
    const open = await measure(1440, 900, true)
    expect(open).toEqual(shut)
  }, 180_000)

  it('is the same rectangle at 1280 × 800 too', async () => {
    const shut = await measure(1280, 800, false)
    const open = await measure(1280, 800, true)
    expect(open).toEqual(shut)
  }, 180_000)
})
