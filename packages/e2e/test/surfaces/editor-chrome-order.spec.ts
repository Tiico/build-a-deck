import { expect, test } from '@playwright/test'
import { inject, standing } from '../../support/surface.js'

// The chrome the editor says things in: the header, then one strip per thing that wants saying,
// then the work. Every strip is absent most of the time, and each of them comes and goes while a
// designer is looking at the page — the line breaks, a role is learned, a table is started, the
// way out is questioned. Where a strip lands is therefore not a detail of the stylesheet: it is
// what the page does under someone's hands, and a strip that lands somewhere else when its
// neighbour happens to be up moves the work by the height of itself. Only an engine with the real
// box model can answer where they land, so the shipped stylesheet is measured in one (#5).
//
// Migrated from `packages/web/test/editor-chrome-order.test.ts`, which built a document of its own
// with `editor.css` and `buttons.css` pasted into it. The editor that ships is the surface *and*
// the shared button language over it, and the honest way to have both in the right order is to
// open the route that links them — which is also the only arrangement that can be wrong the way
// the product would be.
// Every strip the editor can put between its header and the work, in the order `EditorPage`
// writes them. `stagebar` is not one of them: it stands below the work, in thumb's reach.
const STRIPS = [
  { cls: 'byd-editor-narrow', html: '<p class="byd-editor-narrow">Kortmallen läggs ut på en bredare skärm.</p>' },
  { cls: 'byd-editor-leave', html: '<div class="byd-editor-leave" role="alertdialog"><p>Osparade ändringar.</p><button>Spara och lämna</button></div>' },
  { cls: 'byd-editor-table-link', html: '<div class="byd-editor-table-link" role="status">Bordet är startat i version 3.</div>' },
  { cls: 'byd-editor-offline', html: '<p class="byd-editor-offline" role="status">Ingen förbindelse med spelet.</p>' },
  { cls: 'byd-editor-readonly', html: '<p class="byd-editor-readonly" role="status">Du kan läsa spelet men inte ändra det.</p>' },
] as const


const CHROME = (up: readonly string[]) => `
<div class="byd-editor" data-page="editor" data-mode="table" data-room="desk">
  <header><a class="byd-editor-home" href="#">Mina spel</a><strong>Skogens herrar</strong></header>
  ${up.join('\n  ')}
  <main><div role="tabpanel" tabindex="0">Kortväggen</div></main>
  <div class="byd-editor-stagebar"><nav role="tablist" aria-label="Editorns etapper"><button role="tab">Kort</button></nav></div>
</div>`

// Every combination of strips there is, because the bug was not in any one of them: it was in
// what one did when another happened to be up beside it.
const combinations = <T,>(all: readonly T[]): T[][] => all.reduce<T[][]>((out, one) => [...out, ...out.map((some) => [...some, one])], [[]])

// The editor declares its own tokens on `.byd-editor`, and its sheet is a chunk of its own (#186).
const EDITOR = { on: '.byd-editor', token: '--byd-editor-primary-mark' }

type Box = { top: number; bottom: number }

const boxes = (page: import('@playwright/test').Page): Promise<Record<string, Box>> =>
  page.evaluate(() => {
    const out: Record<string, { top: number; bottom: number }> = {}
    for (const el of document.querySelectorAll('.byd-editor > *')) {
      const box = el.getBoundingClientRect()
      const name = el.tagName === 'HEADER' || el.tagName === 'MAIN' ? el.tagName.toLowerCase() : el.className
      out[name] = { top: Math.round(box.top), bottom: Math.round(box.bottom) }
    }
    return out
  })

test.use({ viewport: { width: 1280, height: 800 } })

// The route once per test, the arrangements as often as the test asks: every case here is the same
// stylesheet answering about different markup.
test.beforeEach(async ({ page }) => {
  await standing(page, CHROME([]), { at: '/editor', needs: EDITOR })
})

const lay = async (page: import('@playwright/test').Page, up: readonly (typeof STRIPS)[number][]): Promise<Record<string, Box>> => {
  await inject(page, CHROME(up.map((s) => s.html)))
  return boxes(page)
}

test.describe('the strips the editor says things in', () => {
  for (const up of combinations([...STRIPS])) {
    const name = up.map((s) => s.cls).join(' + ') || 'inga'
    test(`stand between the header and the work, in the order they are written: ${name}`, async ({ page }) => {
      const box = await lay(page, up)
      const order = ['header', ...up.map((s) => s.cls), 'main']
      for (const one of order) expect(box[one], `${one} is on the page`).toBeTruthy()
      // Each one begins where the one before it ended: nothing is jumped over, nothing overlaps,
      // and nothing has fallen past the work to the bottom of the window.
      for (let i = 1; i < order.length; i++) expect(box[order[i]!]!.top, `${order[i]} follows ${order[i - 1]}`).toBe(box[order[i - 1]!]!.bottom)
      expect(box['byd-editor-stagebar']!.top, 'the stage strip stands below the work').toBe(box['main']!.bottom)
    })
  }

  // The one a live line puts up and takes down again by itself. Wherever it lands it moves the
  // work by its own height, so it has to land in the same place every time: what a designer sees
  // move must be the strip arriving, never the strip arriving somewhere new.
  test('gives the same place to a line that has gone, whatever else is up beside it', async ({ page }) => {
    const lonely = await lay(page, [STRIPS[3]!])
    const crowded = await lay(page, [STRIPS[0]!, STRIPS[1]!, STRIPS[2]!, STRIPS[3]!, STRIPS[4]!])
    const height = (box: Record<string, Box>) => box['byd-editor-offline']!.bottom - box['byd-editor-offline']!.top
    expect(height(lonely)).toBe(height(crowded))
    // In both, it is the strip immediately above the work it is about.
    expect(lonely['byd-editor-offline']!.bottom).toBe(lonely['main']!.top)
  })
})
