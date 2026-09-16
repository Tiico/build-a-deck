// @vitest-environment jsdom
// The editor is an application on the web and not a page (UX-KONTROLLER, L12): the window itself
// never scrolls, and a panel's own tools never leave with the work. `editor-viewport.test.tsx`
// already holds the editor to not scrolling *sideways*; the audit of 2026-09-16 found that nobody
// was holding it to the other axis, and that the Bord tab scrolled the whole window — the header,
// the modes and Uppdatera bordet went off the top of the screen and a blank page showed under the
// app (issue #126).
//
// Two rules, measured in Chromium against the stylesheet the editor actually ships:
//
//   1. The document is exactly the window. Nothing scrolls the page, on either axis.
//   2. `main` is exactly the room it was given. A panel that is taller than `main` would scroll
//      its own crown — the vision filters, the import row, the zone list — off the screen with
//      the work, which is issue #128. The work scrolls; the panel does not.
//
// Both are measured on a deck the size of a real one. The three-row fixture the other editor
// tests use fits on any screen, so it could never have caught either of these: the wall has to
// have more cards than a screen holds before "the tools scroll away" is a thing that can happen.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { chromium, type Browser, type Page } from 'playwright'
import type { ProjectDoc } from '@byd/server'
import { EditorPage } from '../src/editor/EditorPage.js'
import { template } from './project-doc.js'
import { recipeSetup, startServer, type Running } from './fixture.js'
import { atWidth } from './viewport.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const shell = read('index.html')
const css = `${read('src/editor/editor.css')}\n${read('src/buttons.css')}\n${read('src/a11y.css')}`

const document_ = (html: string) =>
  shell
    .replace('<script type="module" src="/src/main.tsx"></script>', '')
    .replace('</head>', `<style>${css}</style></head>`)
    .replace('<div id="root"></div>', `<div id="root">${html}</div>`)

// A deck the size of one someone would actually take to a printer, on a table the wizard would
// actually lay out: sixty cards in five types, four seats, a counter at every seat. This is what
// the audit measured, and it is the smallest fixture that can tell a surface that fits from one
// that only fits because there is nothing in it.
const TYPES = ['Playcard', 'Location', 'Effect', 'Event', 'Trap'] as const
export function fullDeckDoc(): ProjectDoc {
  const { zones, seats, floor } = recipeSetup(4, [{ name: 'Guld', start: 0 }])
  return {
    name: 'Skogens herrar',
    template: template(),
    rows: Array.from({ length: 60 }, (_, i) => ({
      id: `card-${i}`,
      fields: {
        title: `Kort ${i + 1}`,
        body: 'En mening som är ungefär så lång som en riktig korttext brukar bli när den har fått plats.',
        typ: TYPES[i % TYPES.length]!,
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

// Every surface the editor can be showing at a desk width, by the name of the tab that opens it.
//
// Bord is taken with a table actually running, because that is the state a designer is in whenever
// this tab is worth opening — and because an empty list is a list that cannot push anything off
// the screen. `TablesTab` renders a single line of "hämtar…" until its fetch lands, so the tab is
// waited for rather than grabbed: a snapshot of the loading line would have measured nothing.
async function surfaces(width: number): Promise<Record<string, string>> {
  atWidth(width)
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  const { unmount } = render(<EditorPage />)
  try {
    await screen.findByText('Skogens herrar')
    const out: Record<string, string> = {}
    const tabs = () => [...document.querySelectorAll<HTMLElement>('[role="tablist"][aria-label="Editorlägen"] [role="tab"]')]
    for (let i = 0; i < tabs().length; i++) {
      const tab = tabs()[i]!
      const name = tab.textContent?.trim() ?? String(i)
      fireEvent.click(tab)
      if (name === 'Bord') await screen.findByRole('list', { name: 'Spelets bord' })
      out[name] = document.querySelector('.byd-editor')!.outerHTML
    }
    return out
  } finally {
    unmount()
  }
}

async function measure<T>(width: number, height: number, read_: (page: Page) => Promise<T>): Promise<Record<string, T>> {
  const marked = await surfaces(width)
  const page = await browser.newPage({ viewport: { width, height } })
  try {
    const out: Record<string, T> = {}
    for (const [name, html] of Object.entries(marked)) {
      await page.setContent(document_(html), { waitUntil: 'load' })
      out[name] = await read_(page)
    }
    return out
  } finally {
    await page.close()
  }
}

const nothing = <T,>(measured: Record<string, T>, empty: T) => Object.fromEntries(Object.keys(measured).map((name) => [name, empty]))

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
  await run.projects.create(run.projectId, fullDeckDoc())
  // A table is running, because that is the state the Bord tab is worth opening in — and because
  // an empty list is a list that cannot push anything off the screen.
  const started = await fetch(`${run.http}/projects/${run.projectId}/sessions`, { method: 'POST' })
  if (!started.ok) throw new Error(`could not start the fixture's table: ${started.status}`)
})
afterEach(async () => {
  await run.stop()
})

// The desk, at the two widths the audit binds the editor to and the one it is usually read at.
const DESKS = [
  [1024, 768],
  [1280, 800],
  [1440, 900],
] as const

describe.each(DESKS)('the editor on a %ix%i desk', (width, height) => {
  it('never scrolls the window', async () => {
    const measured = await measure(width, height, (page) =>
      page.evaluate(() => {
        const de = document.documentElement
        const down = de.scrollHeight - de.clientHeight
        const across = de.scrollWidth - de.clientWidth
        return [...(down > 1 ? [`${down}px down`] : []), ...(across > 1 ? [`${across}px across`] : [])]
      }),
    )
    expect(measured).toEqual(nothing(measured, [] as string[]))
  }, 120_000)

  it('keeps the work inside the panel, so a panel never scrolls its own tools away', async () => {
    const measured = await measure(width, height, (page) =>
      page.evaluate(() => {
        const main = document.querySelector('.byd-editor > main')!
        const down = main.scrollHeight - main.clientHeight
        const across = main.scrollWidth - main.clientWidth
        return [...(down > 1 ? [`${down}px down`] : []), ...(across > 1 ? [`${across}px across`] : [])]
      }),
    )
    expect(measured).toEqual(nothing(measured, [] as string[]))
  }, 120_000)
})
