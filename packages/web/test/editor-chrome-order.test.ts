import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser, type Page } from 'playwright'

// The chrome the editor says things in: the header, then one strip per thing that wants saying,
// then the work. Every strip is absent most of the time, and each of them comes and goes while a
// designer is looking at the page — the line breaks, a role is learned, a table is started, the
// way out is questioned. Where a strip lands is therefore not a detail of the stylesheet: it is
// what the page does under someone's hands, and a strip that lands somewhere else when its
// neighbour happens to be up moves the work by the height of itself. Only an engine with the real
// box model can answer where they land, so the shipped stylesheet is measured in one (#5).
// The surface and the shared button language over it — the editor that ships is both.
const css = [new URL('../src/editor/editor.css', import.meta.url), new URL('../src/buttons.css', import.meta.url)]
  .map((at) => readFileSync(at, 'utf8'))
  .join('\n')

// Every strip the editor can put between its header and the work, in the order `EditorPage`
// writes them. `stagebar` is not one of them: it stands below the work, in thumb's reach.
const STRIPS = [
  { cls: 'byd-editor-narrow', html: '<p class="byd-editor-narrow">Kortmallen läggs ut på en bredare skärm.</p>' },
  { cls: 'byd-editor-leave', html: '<div class="byd-editor-leave" role="alertdialog"><p>Osparade ändringar.</p><button>Spara och lämna</button></div>' },
  { cls: 'byd-editor-table-link', html: '<div class="byd-editor-table-link" role="status">Bordet är startat i version 3.</div>' },
  { cls: 'byd-editor-offline', html: '<p class="byd-editor-offline" role="status">Ingen förbindelse med spelet.</p>' },
  { cls: 'byd-editor-readonly', html: '<p class="byd-editor-readonly" role="status">Du kan läsa spelet men inte ändra det.</p>' },
] as const

const page_ = (up: readonly string[]) => `<!doctype html><meta charset="utf-8"><style>html,body{margin:0}${css}</style>
<div class="byd-editor" data-page="editor" data-mode="table" data-room="desk">
  <header><a class="byd-editor-home" href="#">Mina spel</a><strong>Skogens herrar</strong></header>
  ${up.join('\n  ')}
  <main><div role="tabpanel" tabindex="0">Kortväggen</div></main>
  <div class="byd-editor-stagebar"><nav role="tablist" aria-label="Editorns etapper"><button role="tab">Kort</button></nav></div>
</div>`

// Every combination of strips there is, because the bug was not in any one of them: it was in
// what one did when another happened to be up beside it.
const combinations = <T,>(all: readonly T[]): T[][] =>
  all.reduce<T[][]>((out, one) => [...out, ...out.map((some) => [...some, one])], [[]])

let browser: Browser
let chrome: Page
beforeAll(async () => {
  browser = await chromium.launch()
  chrome = await browser.newPage({ viewport: { width: 1280, height: 800 } })
}, 60_000)
afterAll(async () => {
  await browser.close()
}, 60_000)

type Box = { top: number; bottom: number }
async function lay(up: readonly (typeof STRIPS)[number][]): Promise<Record<string, Box>> {
  await chrome.setContent(page_(up.map((s) => s.html)))
  return chrome.evaluate(() => {
    const out: Record<string, { top: number; bottom: number }> = {}
    for (const el of document.querySelectorAll('.byd-editor > *')) {
      const box = el.getBoundingClientRect()
      const name = el.tagName === 'HEADER' || el.tagName === 'MAIN' ? el.tagName.toLowerCase() : el.className
      out[name] = { top: Math.round(box.top), bottom: Math.round(box.bottom) }
    }
    return out
  })
}

describe('the strips the editor says things in', () => {
  it.each(combinations([...STRIPS]).map((up) => [up.map((s) => s.cls).join(' + ') || 'inga', up] as const))(
    'stand between the header and the work, in the order they are written: %s',
    async (_name, up) => {
      const box = await lay(up)
      const order = ['header', ...up.map((s) => s.cls), 'main']
      for (const name of order) expect(box[name], `${name} is on the page`).toBeTruthy()
      // Each one begins where the one before it ended: nothing is jumped over, nothing overlaps,
      // and nothing has fallen past the work to the bottom of the window.
      for (let i = 1; i < order.length; i++) {
        expect(box[order[i]!]!.top, `${order[i]} follows ${order[i - 1]}`).toBe(box[order[i - 1]!]!.bottom)
      }
      expect(box['byd-editor-stagebar']!.top, 'the stage strip stands below the work').toBe(box['main']!.bottom)
    },
    60_000,
  )

  // The one a live line puts up and takes down again by itself. Wherever it lands it moves the
  // work by its own height, so it has to land in the same place every time: what a designer sees
  // move must be the strip arriving, never the strip arriving somewhere new.
  it('gives the same place to a line that has gone, whatever else is up beside it', async () => {
    const lonely = await lay([STRIPS[3]!])
    const crowded = await lay([STRIPS[0]!, STRIPS[1]!, STRIPS[2]!, STRIPS[3]!, STRIPS[4]!])
    const height = (box: Record<string, Box>) => box['byd-editor-offline']!.bottom - box['byd-editor-offline']!.top
    expect(height(lonely)).toBe(height(crowded))
    // In both, it is the strip immediately above the work it is about.
    expect(lonely['byd-editor-offline']!.bottom).toBe(lonely['main']!.top)
  }, 60_000)
})
