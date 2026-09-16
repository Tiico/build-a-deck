// @vitest-environment jsdom
// The Bord tab on one screen (#126). It was the one tab in the editor that did not fit: the setup
// and the list of running tables were two panels stacked, each asking for a whole work area, so
// the list began a screenful below the felt and the whole tab scrolled as one. The header, the
// revision, the tabs and **Uppdatera bordet** went with it.
//
// Whether a tab fits, and what scrolls when it does not, are layout questions, so they are asked
// of a real engine against the stylesheet the editor ships — the same way `editor-viewport` and
// `editor-spacing` ask theirs. The widths are the three the audit measured at, each with the
// height it was measured with; a tab that fits at 900 and not at 768 fits nothing.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { chromium, type Browser, type Page } from 'playwright'
import { EditorPage } from '../src/editor/EditorPage.js'
import { panelId, tabId } from '../src/editor/EditorTabs.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { atWidth } from './viewport.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const shell = read('index.html')
const editorCss = read('src/editor/editor.css')
const css = `${editorCss}\n${read('src/buttons.css')}\n${read('src/a11y.css')}`

const document_ = (html: string) =>
  shell
    .replace('<script type="module" src="/src/main.tsx"></script>', '')
    .replace('</head>', `<style>${css}</style></head>`)
    .replace('<div id="root"></div>', `<div id="root">${html}</div>`)

// The three the audit measured, each with its own height (UX-KONTROLLER, L12).
const SCREENS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
] as const

// The Bord tab, open, as markup. The list of running tables comes from the server, so the panel is
// a loading line until it arrives — and a loading line is not what this file is measuring.
async function bord(width: number): Promise<string> {
  atWidth(width)
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  const { unmount } = render(<EditorPage />)
  try {
    await screen.findByText('Skogens herrar')
    fireEvent.click(document.getElementById(tabId('tables'))!)
    await waitFor(() => expect(document.querySelector('.byd-tables')).not.toBeNull())
    return document.querySelector('.byd-editor')!.outerHTML
  } finally {
    unmount()
  }
}

async function measure<T>(screen_: (typeof SCREENS)[number], read_: (page: Page) => Promise<T>): Promise<T> {
  const html = await bord(screen_.width)
  const page = await browser.newPage({ viewport: { width: screen_.width, height: screen_.height } })
  try {
    await page.setContent(document_(html), { waitUntil: 'load' })
    return await read_(page)
  } finally {
    await page.close()
  }
}

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
  await run.projects.create(run.projectId, projectDoc())
})
afterEach(async () => {
  await run.stop()
})

describe.each(SCREENS)('the Bord tab at $width × $height', (screen_) => {
  it('holds the whole tab inside the window, so the editor stays where it was left', async () => {
    const measured = await measure(screen_, (page) =>
      page.evaluate(() => {
        const doc = document.documentElement
        const main = document.querySelector('main')!
        return {
          // The page itself, which is what carries the header out of sight when it gives way.
          page: `${doc.scrollHeight - doc.clientHeight}/${doc.scrollWidth - doc.clientWidth}`,
          // And the work area under it: a tab that scrolls as one is the same fault one box in.
          work: `${main.scrollHeight - main.clientHeight}/${main.scrollWidth - main.clientWidth}`,
        }
      }),
    )
    expect(measured).toEqual({ page: '0/0', work: '0/0' })
  }, 90_000)

  it('gives each column its own scrolling, and puts none of it inside another', async () => {
    const measured = await measure(screen_, (page) =>
      page.evaluate((panel) => {
        const root = document.querySelector<HTMLElement>(`#${panel} > *`)!
        // A box that really scrolls, not one that merely says it may: the tab had three boxes
        // declaring `overflow: auto` inside each other, and what a reader meets is the ones with
        // something to scroll.
        const scrolls = (el: HTMLElement) => /auto|scroll/.test(`${getComputedStyle(el).overflow}${getComputedStyle(el).overflowY}`) && el.scrollHeight - el.clientHeight > 1
        const scrolling = [...root.querySelectorAll<HTMLElement>('*')].filter(scrolls)
        // Which column each one is in. Two scrolling boxes in one column is a reader who has to
        // find out which of them her wheel is over before she can move.
        const column = (el: HTMLElement) => [...root.children].findIndex((c) => c.contains(el))
        const columns = scrolling.map(column)
        return {
          // Nothing scrolls inside something else that scrolls …
          nested: scrolling.filter((el) => scrolling.some((other) => other !== el && other.contains(el))).map((el) => el.className),
          // … nothing scrolls outside a column …
          loose: scrolling.filter((el) => column(el) < 0).map((el) => el.className),
          // … and no column holds two.
          twice: columns.filter((c, i) => columns.indexOf(c) !== i).map((c) => `column ${c}`),
        }
      }, panelId('tables')),
    )
    expect(measured).toEqual({ nested: [], loose: [], twice: [] })
  }, 90_000)

  it('puts the running tables on the first screen, not a screenful below it', async () => {
    const measured = await measure(screen_, (page) =>
      page.evaluate(() => {
        const list = document.querySelector('.byd-tables')!.getBoundingClientRect()
        return { above: Math.round(list.top) < innerHeight, top: Math.round(list.top) }
      }),
    )
    expect(measured.above, `the list of running tables starts at y = ${measured.top}`).toBe(true)
  }, 90_000)
})

// The last of #126's criteria is not a measurement but a habit: a height worked out from a number
// somebody wrote down for how tall the chrome is. `.byd-setup-side` guessed 116 px where the
// header takes 57, and a guess like that is wrong in every window it was not written in.
describe('the height the Bord tab works with', () => {
  it('comes out of the layout and not out of a guess about the chrome', () => {
    // The comments are cut away first: this file's own reason for the rule names the guess it
    // replaced, and a guard that cannot tell a rule from the sentence explaining it would fail on
    // the explanation.
    const rules = editorCss.replaceAll(/\/\*[\s\S]*?\*\//g, '')
    expect([...rules.matchAll(/[^;{}]*calc\(\s*100[dls]*vh\s*-[^;}]*/g)].map((m) => m[0].trim())).toEqual([])
  }, 60_000)

  it('is found at all, so this guard cannot pass by reading an empty file', () => {
    expect(editorCss).toContain('.byd-setup {')
  }, 60_000)
})
