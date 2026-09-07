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
        <aside class="byd-canvas-layers">
          <ul role="listbox">
            <li role="option" aria-selected="true" tabindex="0" data-stop="the selected layer"><span class="byd-layer-kind">text</span> <span>title</span></li>
          </ul>
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
        <table class="byd-data"><tbody><tr aria-selected="true"><td><input data-stop="a cell" /></td><td><button data-stop="a row's delete">Ta bort</button></td></tr></tbody></table>
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
      'the selected layer',
      'a property field',
      'a property choice',
      'the table panel',
      'the CSV import',
      'the CSV export',
      'the search field',
      'a type chip',
      'the clear-filter button',
      'a cell',
      "a row's delete",
      'the add-row button',
    ])
    const dim = stops.filter((s) => s.style === 'none' || !(s.width >= 2) || contrastRatio(s.color, s.on) < 3)
    expect(dim.map((s) => s.what)).toEqual([])
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
