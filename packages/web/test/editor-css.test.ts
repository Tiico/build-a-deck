import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser } from 'playwright'
import { contrastRatio } from '../src/player/contrast.js'

// Every keyboard stop in the editor has to say where it is, in all three modes (UX-KONTROLLER:
// "komplett … tangentbordsinteraktion samt synlig fokusmarkering"). Only an engine that knows
// `:focus-visible` can answer that, so the shipped stylesheet is measured in one.
const css = readFileSync(new URL('../src/editor/editor.css', import.meta.url), 'utf8')

// The editor's controls as they ship: the header, and one panel per mode with what can be
// reached inside it.
const SHELL = `
<div class="byd-editor" data-page="editor">
  <header>
    <strong>Skogens herrar</strong>
    <nav role="tablist" aria-label="Editorlägen">
      <button role="tab" aria-selected="true" data-stop="the open tab">Kortvägg</button>
      <button role="tab" aria-selected="false" tabindex="-1">Mall</button>
    </nav>
    <span class="byd-editor-spacer"></span>
    <button data-stop="Spara">Spara</button>
    <button class="byd-editor-primary" data-stop="Uppdatera bordet">Uppdatera bordet</button>
  </header>
  <main>
    <div role="tabpanel" tabindex="0" data-stop="the wall panel">
      <div class="byd-wall"><div class="byd-wall-card" aria-selected="true"></div></div>
    </div>
    <div role="tabpanel" tabindex="0" data-stop="the template panel">
      <div class="byd-canvas">
        <aside class="byd-canvas-tools" role="toolbar" aria-label="Verktyg">
          <button data-stop="a tool" tabindex="0"><span>T</span>Text</button>
          <button tabindex="-1"><span>▣</span>Bild</button>
        </aside>
        <aside class="byd-canvas-layers">
          <ul role="listbox">
            <li role="option" aria-selected="true" tabindex="0" draggable="true" data-stop="the selected layer"><span class="byd-layer-kind">text</span> <span>title</span></li>
          </ul>
          <label class="byd-canvas-grid-toggle"><input type="checkbox" data-stop="the grid toggle" />Rutnät 1 mm</label>
          <p class="byd-canvas-hint">Dra ett lager för att ändra ordningen, eller håll Alt och tryck pil upp eller ner.</p>
        </aside>
        <aside class="byd-canvas-props">
          <div class="byd-props">
            <label>X (mm)<input type="number" data-stop="a property field" /></label>
            <label>Vikt<select data-stop="a property choice"><option>400</option></select></label>
          </div>
        </aside>
      </div>
    </div>
    <div role="tabpanel" tabindex="0" data-stop="the table panel">
      <div class="byd-table-wrap">
        <div class="byd-data-tools"><label>Importera CSV<input type="file" data-stop="the CSV import" /></label><a href="#" data-stop="the CSV export">Exportera CSV</a></div>
        <div class="byd-data-filter">
          <input type="search" class="byd-data-search" data-stop="the search field" />
          <div class="byd-data-chips" role="group"><button class="byd-data-chip" aria-pressed="false" data-stop="a type chip">fälla</button></div>
          <p class="byd-data-count">1 av 3 kort</p>
          <button class="byd-data-clear" data-stop="the clear-filter button">Rensa filter</button>
        </div>
        <div class="byd-data-bulk" role="toolbar">
          <label>Sätt<select data-stop="the bulk column"><option>typ</option></select></label>
          <input data-stop="the bulk value" />
          <button data-stop="the bulk set">Sätt typ på 2 kort</button>
          <button data-stop="the bulk duplicate">Duplicera 2 kort</button>
          <button data-kind="danger" data-stop="the bulk delete">Ta bort 2 kort</button>
          <button data-kind="quiet" data-stop="the unmark">Avmarkera alla</button>
        </div>
        <table class="byd-data">
          <thead><tr><th class="byd-data-check"><input type="checkbox" data-stop="the header checkbox" /></th></tr></thead>
          <tbody><tr aria-selected="true"><td class="byd-data-check"><input type="checkbox" data-stop="a row's checkbox" /></td><td><input data-stop="a cell" /></td><td><button data-stop="a row's delete">Ta bort</button></td></tr></tbody>
        </table>
        <button class="byd-data-add" data-stop="the add-row button">Lägg till kort</button>
      </div>
    </div>
  </main>
</div>`

type Stop = { what: string; style: string; width: number; color: string; on: string }

let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser.close()
})

// Walks the whole tab order and reports the focus ring at every stop, with the background it has
// to be seen against.
async function tabThrough(): Promise<Stop[]> {
  const page = await browser.newPage()
  try {
    await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body>${SHELL}</body></html>`, { waitUntil: 'load' })
    const stops: Stop[] = []
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab')
      const stop = await page.evaluate(() => {
        const el = document.activeElement
        if (!el || el === document.body || el === document.documentElement) return null
        const style = getComputedStyle(el)
        let node: HTMLElement | null = el.parentElement
        let on = 'rgb(255, 255, 255)'
        while (node) {
          const colour = getComputedStyle(node).backgroundColor
          if (!/,\s*0\)$/.test(colour) && colour !== 'transparent') {
            on = colour
            break
          }
          node = node.parentElement
        }
        return { what: el.getAttribute('data-stop') ?? el.tagName.toLowerCase(), style: style.outlineStyle, width: parseFloat(style.outlineWidth), color: style.outlineColor, on }
      })
      if (!stop) break
      stops.push(stop)
    }
    return stops
  } finally {
    await page.close()
  }
}

describe('the editor under a keyboard', () => {
  it('draws a visible focus ring on every stop in every mode', async () => {
    const stops = await tabThrough()
    expect(stops.map((s) => s.what)).toEqual([
      'the open tab',
      'Spara',
      'Uppdatera bordet',
      'the wall panel',
      'the template panel',
      'a tool',
      'the selected layer',
      'the grid toggle',
      'a property field',
      'a property choice',
      'the table panel',
      'the CSV import',
      'the CSV export',
      'the search field',
      'a type chip',
      'the clear-filter button',
      'the bulk column',
      'the bulk value',
      'the bulk set',
      'the bulk duplicate',
      'the bulk delete',
      'the unmark',
      'the header checkbox',
      "a row's checkbox",
      'a cell',
      "a row's delete",
      'the add-row button',
    ])
    const dim = stops.filter((s) => s.style === 'none' || !(s.width >= 2) || contrastRatio(s.color, s.on) < 3)
    expect(dim.map((s) => s.what)).toEqual([])
  }, 60_000)
})

// A marked row (#17) has to be visible as marked from across the table, not only by the tick in
// its first cell: the eye checks "did I get the right four cards" on the rows, not the boxes.
const MARKED = `
<div class="byd-editor" data-page="editor" data-mode="table">
  <main><div role="tabpanel"><div class="byd-table-wrap">
    <table class="byd-data"><tbody>
      <tr id="plain" aria-selected="false"><td class="byd-data-check"><input type="checkbox" /></td><td class="byd-data-id">drake</td></tr>
      <tr id="marked" aria-selected="false"><td class="byd-data-check"><input type="checkbox" checked /></td><td class="byd-data-id">grop</td></tr>
      <tr id="looked-at" aria-selected="true"><td class="byd-data-check"><input type="checkbox" checked /></td><td class="byd-data-id">alv</td></tr>
    </tbody></table>
  </div></div></main>
</div>`

describe('the table under a selection', () => {
  it('draws a marked row differently from one that is not', async () => {
    const page = await browser.newPage()
    try {
      await page.setContent(`<!doctype html><html><head><style>body{margin:0}${css}</style></head><body>${MARKED}</body></html>`, { waitUntil: 'load' })
      const [plain, marked, lookedAt] = await page.evaluate(() =>
        ['#plain', '#marked', '#looked-at'].map((sel) => getComputedStyle(document.querySelector(sel)!).backgroundColor),
      )
      expect(marked).not.toBe(plain)
      // The card on the preview keeps its own colour whether it is marked or not.
      expect(lookedAt).not.toBe(marked)
      expect(lookedAt).not.toBe(plain)
    } finally {
      await page.close()
    }
  }, 60_000)
})

// The template mode is a full-height three-column canvas; if the panel stops short, the layer
// and property columns end in mid-air.
const TEMPLATE = (link: boolean) => `
<div class="byd-editor" data-page="editor" data-mode="template">
  <header><strong>Skogens herrar</strong></header>
  ${link ? '<div class="byd-editor-table-link">Nytt bord startat</div>' : ''}
  <main>
    <div role="tabpanel" tabindex="0"><div class="byd-canvas"><aside class="byd-canvas-layers"></aside><main class="byd-canvas-stage"></main><aside class="byd-canvas-props"></aside></div></div>
  </main>
</div>`

describe('the editor fills the window', () => {
  it('gives the open mode every pixel under the header, with or without a table link', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 700 } })
    try {
      const measured: Record<string, number[]> = {}
      for (const link of [false, true]) {
        await page.setContent(`<!doctype html><html><head><style>body{margin:0}${css}</style></head><body>${TEMPLATE(link)}</body></html>`, { waitUntil: 'load' })
        measured[link ? 'with a table link' : 'on its own'] = await page.evaluate(() =>
          ['.byd-editor > main', '[role="tabpanel"]', '.byd-canvas-layers'].map((sel) => Math.round(document.querySelector(sel)!.getBoundingClientRect().bottom)),
        )
      }
      expect(measured).toEqual({ 'on its own': [700, 700, 700], 'with a table link': [700, 700, 700] })
    } finally {
      await page.close()
    }
  }, 60_000)
})
