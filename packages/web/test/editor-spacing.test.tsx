// @vitest-environment jsdom
// The edge every tab panel in the editor frames its work with (#132). It was four different
// numbers depending on which tab was open — 12, 16, 20 and 24 — and the jump between 12 and 24 is
// a half gain: it shows when the tab is switched, and it means the next panel is built on a
// number somebody happened to write rather than on a decision.
//
// A distance is a layout question, so it is asked of a real engine against the stylesheet the
// editor actually ships, the way `editor-viewport.test.tsx` asks its own. And every number below
// is read back out of that stylesheet through a probe: this file says "the edge the editor
// declares" and never a number of its own, so the fact stays true when the ladder is retuned.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { chromium, type Browser, type Page } from 'playwright'
import { EditorPage } from '../src/editor/EditorPage.js'
import { MODES, panelId, tabId, type Mode } from '../src/editor/EditorTabs.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { atWidth } from './viewport.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const shell = read('index.html')
const editorCss = read('src/editor/editor.css')
const css = `${editorCss}\n${read('src/buttons.css')}\n${read('src/a11y.css')}\n${read('src/rules/rules.css')}`

const document_ = (html: string) =>
  shell
    .replace('<script type="module" src="/src/main.tsx"></script>', '')
    .replace('</head>', `<style>${css}</style></head>`)
    .replace('<div id="root"></div>', `<div id="root">${html}</div>`)

// The width the audit measured the editor at, and the one the numbers in #132 were taken at. One
// width is enough for an edge: the gutter is declared once and no media query is allowed to say
// anything else about it — which is what the last test in this file is for.
const WIDTH = 1440

// The editor with one tab open, as markup, for every tab there is. Keyed by the mode and not by
// the label on the tab, so the test says nothing about which language the editor is read in.
async function panels(): Promise<Record<string, string>> {
  atWidth(WIDTH)
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  const { unmount } = render(<EditorPage />)
  try {
    await screen.findByText('Skogens herrar')
    const out: Record<string, string> = {}
    for (const [mode] of MODES) {
      fireEvent.click(document.getElementById(tabId(mode))!)
      // The list of running tables comes from the server, so that panel is a loading line until it
      // arrives — and a loading line is not what this file is measuring. Every other panel is on
      // the screen the moment its tab is clicked.
      await waitFor(() => expect(document.querySelector(mode === 'tables' ? '.byd-tables' : `#${panelId(mode)} > *`)).not.toBeNull())
      out[mode] = document.querySelector('.byd-editor')!.outerHTML
    }
    return out
  } finally {
    unmount()
  }
}

// The same markup in a real engine, measured by `read_`.
async function measure<T>(read_: (page: Page, mode: Mode) => Promise<T>): Promise<Record<string, T>> {
  const marked = await panels()
  const page = await browser.newPage({ viewport: { width: WIDTH, height: 900 } })
  try {
    const out: Record<string, T> = {}
    for (const [mode, html] of Object.entries(marked)) {
      await page.setContent(document_(html), { waitUntil: 'load' })
      out[mode] = await read_(page, mode as Mode)
    }
    return out
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

// What each tab does with the edge. Five of the six frame their work with the gutter. Mall is the
// one that does not, and deliberately: it is a splitter, four columns against each other with a
// line between them, and a frame round the lot would cut those lines short. Its columns are
// panels inside a panel, so the edge that shows there is the inner one — `--byd-s3` — which is
// the row #132's own table gives it.
const FRAMED: readonly Mode[] = MODES.map(([mode]) => mode).filter((mode) => mode !== 'template')

describe(`the edge the editor frames a tab panel with, at ${WIDTH}px`, () => {
  it('is the same on every tab that draws one, and comes out of the stylesheet', async () => {
    const measured = await measure((page, mode) =>
      page.evaluate(
        ({ panel, token, framed }) => {
          // A probe reads the length back out of the stylesheet, so this file never writes one of
          // its own. It has to hang inside the editor to inherit the editor's tokens and must not
          // be laid out by it, so it is taken out of the flow first.
          const probe = document.querySelector('.byd-editor')!.appendChild(document.createElement('span'))
          probe.style.cssText = `position: absolute; top: 0; left: 0; display: block; padding: var(${token})`
          const want = getComputedStyle(probe).padding
          probe.remove()
          const roots = [...document.querySelectorAll<HTMLElement>(`#${panel} > *`)]
          return {
            // A panel with no root at all would otherwise report a clean edge, which is the shape
            // of guard this repo keeps finding it needs.
            roots: roots.length,
            wrong: framed
              ? roots.filter((el) => getComputedStyle(el).padding !== want).map((el) => `${el.className}: ${getComputedStyle(el).padding}, not ${want}`)
              : [],
          }
        },
        { panel: panelId(mode), token: '--byd-gutter', framed: FRAMED.includes(mode) },
      ),
    )
    expect(measured).toEqual({
      wall: { roots: 1, wrong: [] },
      // The splitter has no edge of its own; the test below is the one that speaks for it.
      template: { roots: 1, wrong: [] },
      table: { roots: 1, wrong: [] },
      symbols: { roots: 1, wrong: [] },
      rules: { roots: 1, wrong: [] },
      // One root since #126: the setup is the tab, and the list of running tables stands in its
      // third column rather than as a second panel under it.
      tables: { roots: 1, wrong: [] },
    })
  }, 90_000)

  it('is handed to the columns by the one panel that is a splitter, as the inner edge', async () => {
    // Every tab's markup carries all six panels and only the open one has anything in it, so the
    // splitter is asked about on the page where its own tab is the one that is open.
    const measured = await measure(async (page, mode) =>
      mode !== 'template'
        ? null
        : page.evaluate(
            ({ panel, token }) => {
              const probe = document.querySelector('.byd-editor')!.appendChild(document.createElement('span'))
              probe.style.cssText = `position: absolute; top: 0; left: 0; display: block; padding: var(${token})`
              const want = getComputedStyle(probe).padding
              probe.remove()
              const root = document.querySelector<HTMLElement>(`#${panel} > *`)!
              // A column of the splitter is one that scrolls its own work: the two panels beside
              // the card. The rail of tools and the card itself are not panels and carry no edge.
              const columns = [...root.children].filter((el): el is HTMLElement => getComputedStyle(el).overflow === 'auto')
              return {
                root: getComputedStyle(root).padding,
                columns: columns.length,
                wrong: columns.filter((el) => getComputedStyle(el).padding !== want).map((el) => `${el.className}: ${getComputedStyle(el).padding}, not ${want}`),
              }
            },
            { panel: panelId('template'), token: '--byd-s3' },
          ),
    )
    // The layers on one side of the card and the properties on the other.
    expect(measured.template).toEqual({ root: '0px', columns: 2, wrong: [] })
  }, 90_000)
})

// The ladder itself, read as text. A token nobody can point at is the thing #132 is about, so
// this holds the editor to declaring one — once, on the editor's own root, beside the two lengths
// that were already there.
describe('the spacing ladder', () => {
  // Read as written and not as resolved: whether the gutter points at a rung or repeats the rung's
  // number is the whole question, and `cssCustomProperties` would answer `16px` to both.
  const said = (name: string) => new RegExp(`${name}\\s*:\\s*([^;}]+)`).exec(editorCss)?.[1]?.trim()

  it.each([
    ['--byd-s1', '4px'],
    ['--byd-s2', '8px'],
    ['--byd-s3', '12px'],
    ['--byd-s4', '16px'],
    ['--byd-s5', '24px'],
  ])('declares %s as %s', (name, value) => {
    expect(said(name)).toBe(value)
  }, 60_000)

  it('makes the gutter a rung of the ladder rather than a number of its own', () => {
    expect(said('--byd-gutter')).toBe('var(--byd-s4)')
  }, 60_000)

  // The ladder is about distance. What a thumb has to be able to hit, and how big the box a tick
  // is drawn in is, are not distances and are not the ladder's to move (#132's third criterion).
  it.each([
    ['--byd-tap', '44px'],
    ['--byd-tick', '18px'],
  ])('leaves %s where it was', (name, value) => {
    expect(said(name)).toBe(value)
  }, 60_000)

  it('declares each of them exactly once', () => {
    for (const name of ['--byd-s1', '--byd-s2', '--byd-s3', '--byd-s4', '--byd-s5', '--byd-gutter']) {
      expect(editorCss.split(`${name}:`).length - 1, `${name} is declared more than once`).toBe(1)
    }
  }, 60_000)
})

// Every distance in the editor comes off the ladder, or says in a comment on its own line why it
// cannot. The second half is the point: an exception that has to be written out is an exception
// somebody chose, and the numbers this issue is about were none of anybody's choosing.
describe('every distance in editor.css', () => {
  const SPACING = /\b(padding|margin)(-(top|right|bottom|left|inline|block)(-(start|end))?)?\s*:\s*([^;}]*)/g
  const RUNGS = new Set(['0', '4', '8', '12', '16', '24'])
  const EXCEPTION = /undantag:/

  const off = editorCss
    .split('\n')
    .flatMap((line, i) => {
      if (EXCEPTION.test(line)) return []
      return [...line.matchAll(SPACING)].flatMap((m) => {
        const stray = [...(m[6] ?? '').matchAll(/(-?[\d.]+)px/g)].map((n) => n[1]!).filter((n) => !RUNGS.has(n.replace('-', '')))
        return stray.length > 0 ? [`${i + 1}: ${m[0].trim()}`] : []
      })
    })
    .sort()

  it('is a rung of the ladder, or carries the reason it is not', () => {
    expect(off).toEqual([])
  }, 60_000)

  it('is found at all, so this guard cannot pass by reading an empty file', () => {
    expect([...editorCss.matchAll(SPACING)].length).toBeGreaterThan(100)
  }, 60_000)
})
