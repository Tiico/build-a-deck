// @vitest-environment jsdom
// The editor is an application on the web: the window itself never scrolls (UX-KONTROLLER, L12).
//
// `editor-tables-layout.test.tsx` holds the Bord tab's own boxes inside the window and
// `editor-viewport.test.tsx` holds the page to not scrolling sideways. Neither asks the other
// question — whether the *document* is taller than the window — and two boxes nobody can see were
// making it so:
//
//   `.byd-offscreen`, the line only a screen reader reads, is `position: absolute` with no `top`
//   or `left`. Such a box keeps its *static* position: wherever the flow would have put it, which
//   is the very end of the open tab. On Bord, while that tab was still two screens tall, it put a
//   1 px box at y = 1036, and `.byd-editor` grew to follow it even though `main` clipped
//   everything else — 137 px of window scroll, the header off the top of the screen and a blank
//   page under the app (#126). One screen later it still stood 7 px past a 768 px window.
//
//   `.byd-setup`'s single implicit row was `auto`, so the track took the tallest column's
//   max-content — the zone list, 738 px on a four-seat table — rather than the height the tab had.
//
// Measured at 1024 × 768, the shortest desk the editor is held to and the one both showed up at.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { chromium, type Browser } from 'playwright'
import { EditorPage } from '../src/editor/EditorPage.js'
import type { ProjectDoc } from '@byd/server'
import { template } from './project-doc.js'
import { recipeSetup, startServer, type Running } from './fixture.js'
import { atWidth } from './viewport.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const shell = read('index.html')
const css = `${read('src/editor/editor.css')}\n${read('src/buttons.css')}\n${read('src/a11y.css')}`

// A deck and a table of the size someone actually works on: sixty cards, four seats, a counter at
// each. The three-row, two-seat fixture the other editor tests use is shorter than any window on
// every tab, so it could not have caught either box.
function fourSeatDoc(): ProjectDoc {
  const { zones, seats, floor } = recipeSetup(4, [{ name: 'Guld', start: 0 }])
  return {
    name: 'Skogens herrar',
    template: template(),
    rows: Array.from({ length: 60 }, (_, i) => ({
      id: `card-${i}`,
      fields: { title: `Kort ${i + 1}`, body: 'En mening ungefär så lång som en riktig korttext brukar bli.', antal: (i % 4) + 1 },
    })),
    icons: {},
    fonts: {
      'sans-serif': { stack: 'sans-serif', asset: `asset:${'a'.repeat(64)}` },
      'system-ui': { stack: 'system-ui', asset: `asset:${'b'.repeat(64)}` },
    },
    setup: { zones, seats, floor, deckZone: 'draw' },
  }
}

const document_ = (html: string) =>
  shell
    .replace('<script type="module" src="/src/main.tsx"></script>', '')
    .replace('</head>', `<style>${css}</style></head>`)
    .replace('<div id="root"></div>', `<div id="root">${html}</div>`)

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
  await run.projects.create(run.projectId, fourSeatDoc())
  // A table is running, because that is the state Bord is worth opening in — and because the list
  // of tables is what makes the third column tall enough for the boxes below to show up.
  const started = await fetch(`${run.http}/projects/${run.projectId}/sessions`, { method: 'POST' })
  if (!started.ok) throw new Error(`could not start the fixture's table: ${started.status}`)
})
afterEach(async () => {
  await run.stop()
})

describe('the editor at 1024 × 768', () => {
  it('never makes the window scroll, on any tab', async () => {
    atWidth(1024)
    history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
    const { unmount } = render(<EditorPage />)
    const marked: Record<string, string> = {}
    try {
      await screen.findByText('Skogens herrar')
      const tabs = () => [...document.querySelectorAll<HTMLElement>('[role="tablist"][aria-label="Editorlägen"] [role="tab"]')]
      for (let i = 0; i < tabs().length; i++) {
        const tab = tabs()[i]!
        const name = tab.textContent?.trim() ?? String(i)
        fireEvent.click(tab)
        // The list of running tables arrives from the server; the rest of Bord is up at once, and
        // it is the zone list beside the felt that this measures. A table nobody has played is
        // behind a fold (#176), so what is waited for is whichever of the two arrives.
        if (name === 'Bord') await waitFor(() => expect(document.querySelector('.byd-table-row, .byd-tables-fold')).not.toBeNull())
        marked[name] = document.querySelector('.byd-editor')!.outerHTML
      }
    } finally {
      unmount()
    }

    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } })
    try {
      const scrolled: Record<string, string[]> = {}
      for (const [name, html] of Object.entries(marked)) {
        await page.setContent(document_(html), { waitUntil: 'load' })
        scrolled[name] = await page.evaluate(() => {
          const de = document.documentElement
          const down = de.scrollHeight - de.clientHeight
          const across = de.scrollWidth - de.clientWidth
          return [...(down > 0 ? [`${down}px down`] : []), ...(across > 0 ? [`${across}px across`] : [])]
        })
      }
      expect(scrolled).toEqual(Object.fromEntries(Object.keys(scrolled).map((name) => [name, []])))
    } finally {
      await page.close()
    }
  }, 120_000)
})
