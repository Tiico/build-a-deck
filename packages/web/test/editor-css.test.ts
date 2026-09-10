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
    <a class="byd-editor-home" href="#" data-stop="the way out of the editor">Mina spel</a>
    <strong>Skogens herrar</strong>
    <span class="byd-editor-rev">rev 12</span>
    <span class="byd-editor-saved" data-unsaved="true">Osparade ändringar</span>
    <nav role="tablist" aria-label="Editorlägen">
      <button role="tab" aria-selected="true" data-stop="the open tab">Kortvägg</button>
      <button role="tab" aria-selected="false" tabindex="-1">Mall</button>
      <button role="tab" aria-selected="false" tabindex="-1">Bord</button>
    </nav>
    <span class="byd-editor-spacer"></span>
    <button data-stop="Spara">Spara</button>
    <button data-stop="Nytt bord">Nytt bord</button>
    <button class="byd-editor-primary" data-stop="Uppdatera bordet">Uppdatera bordet</button>
    <span class="byd-editor-split">
      <button class="byd-editor-primary byd-editor-caret" aria-expanded="false" data-stop="the table shortcut">▾</button>
    </span>
  </header>
  <div class="byd-editor-leave" role="alertdialog">
    <p>Osparade ändringar i Skogens herrar. Vad vill du göra innan du lämnar editorn?</p>
    <button data-kind="keep" data-stop="saving on the way out">Spara och lämna</button>
    <button data-kind="danger" data-stop="leaving the work behind">Lämna utan att spara</button>
    <button data-stop="the way back into the editor">Avbryt</button>
  </div>
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
        <div class="byd-data-tools"><label>Importera CSV…<input type="file" data-stop="the CSV import" aria-describedby="import-note" /></label><span id="import-note">Import ersätter korten i tabellen. Spara när resultatet ser rätt ut.</span><a href="#" data-stop="the CSV export">Ladda ner CSV</a></div>
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
        <div class="byd-data-bulk" role="alertdialog">
          <p>Ta bort kortet drake ur leken?</p>
          <button data-kind="danger" data-stop="the yes to removing a card">Ja, ta bort</button>
          <button data-stop="the way out of removing a card">Avbryt</button>
        </div>
        <table class="byd-data">
          <thead><tr><th class="byd-data-check"><input type="checkbox" data-stop="the header checkbox" /></th></tr></thead>
          <tbody><tr aria-selected="true"><td class="byd-data-check"><input type="checkbox" data-stop="a row's checkbox" /></td><td><input data-stop="a cell" /></td><td><button data-stop="a row's delete">Ta bort</button></td></tr></tbody>
        </table>
        <button class="byd-data-add" data-stop="the add-row button">Lägg till kort</button>
      </div>
    </div>
    <div role="tabpanel" tabindex="0" data-stop="the tables panel">
      <div class="byd-tables">
        <p class="byd-tables-lead">Varje bord hör till det här spelet.</p>
        <ul>
          <li class="byd-table-row" data-stale="true">
            <div class="byd-tables-mini"></div>
            <div class="byd-tables-info">
              <p class="byd-tables-head"><strong>rev-2</strong><em class="byd-tables-stale">ligger efter rev-3</em><span>Ada spelar</span><span>senaste drag 19:41</span></p>
              <div class="byd-tables-ways">
                <a class="byd-editor-primary" href="#" data-stop="the TV view">Öppna TV-vyn</a>
                <a href="#" data-stop="the table mode">Bordsläge</a>
                <a href="#" data-stop="playing from here">Spela härifrån</a>
                <a href="#" data-stop="watching">Titta på</a>
                <button aria-expanded="true" data-stop="the QR toggle">QR för telefoner</button>
                <button data-kind="quiet" data-stop="ending the table">Avsluta bordet</button>
              </div>
              <div class="byd-tables-qr"><a href="#" data-stop="the join link">Anslutningssidan</a></div>
              <div class="byd-tables-question" role="alertdialog">
                <p>Avsluta bordet 1a2b3c4d?</p>
                <button data-kind="danger" data-stop="the yes to ending">Ja, avsluta</button>
                <button data-stop="the way out of ending">Avbryt</button>
              </div>
            </div>
          </li>
        </ul>
        <button class="byd-tables-new" data-stop="the new-table button">Nytt bord från rev 3</button>
      </div>
    </div>
  </main>
</div>`

// What a stop says about itself: the ring outside it, the mark inside it, and the background both
// have to be seen against. A field is a stop the reader types into; the rest are controls.
type Stop = { what: string; style: string; width: number; color: string; on: string; inside: string | null; typed: boolean }

let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser.close()
}, 60_000)

// Walks the whole tab order and reports the focus ring at every stop, with the background it has
// to be seen against.
async function tabThrough(): Promise<Stop[]> {
  const page = await browser.newPage()
  try {
    await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body>${SHELL}</body></html>`, { waitUntil: 'load' })
    const stops: Stop[] = []
    for (let i = 0; i < 60; i++) {
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
        const inside = /(rgba?\([^)]*\))/.exec(style.boxShadow.includes('inset') ? style.boxShadow : '')?.[1] ?? null
        const typed = el.matches('textarea, input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=button]):not([type=submit]):not([type=reset])')
        return { what: el.getAttribute('data-stop') ?? el.tagName.toLowerCase(), style: style.outlineStyle, width: parseFloat(style.outlineWidth), color: style.outlineColor, on, inside, typed }
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
      'the way out of the editor',
      'the open tab',
      'Spara',
      'Nytt bord',
      'Uppdatera bordet',
      'the table shortcut',
      'saving on the way out',
      'leaving the work behind',
      'the way back into the editor',
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
      'the yes to removing a card',
      'the way out of removing a card',
      'the header checkbox',
      "a row's checkbox",
      'a cell',
      "a row's delete",
      'the add-row button',
      'the tables panel',
      'the TV view',
      'the table mode',
      'playing from here',
      'watching',
      'the QR toggle',
      'ending the table',
      'the join link',
      'the yes to ending',
      'the way out of ending',
      'the new-table button',
    ])
    // A control says where the keyboard is with a ring outside itself.
    const controls = stops.filter((s) => !s.typed)
    const dim = controls.filter((s) => s.style === 'none' || !(s.width >= 2) || contrastRatio(s.color, s.on) < 3)
    expect(dim.map((s) => s.what)).toEqual([])

    // A field says it inside its own box instead (#34). A ring around a table cell is read as a
    // marked cell rather than as focus, and the card table is nothing but fields.
    const fields = stops.filter((s) => s.typed)
    expect(fields.map((s) => s.what)).toContain('a cell')
    const unmarked = fields.filter((s) => s.inside === null || contrastRatio(s.inside, s.on) < 3)
    expect(unmarked.map((s) => s.what)).toEqual([])
    const ringed = fields.filter((s) => s.style !== 'none')
    expect(ringed.map((s) => s.what)).toEqual([])
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
      <tr id="looked-at" aria-selected="true"><td class="byd-data-check"><input type="checkbox" checked /></td><td class="byd-data-id">alv</td><td><input id="cell" value="Alv" /></td></tr>
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

      // Focus and marking are two facts about the same row, so they are said in two channels: the
      // field marks itself inside, the row keeps its own background (#34). A focused cell must not
      // repaint the row, or the reader cannot tell "I am here" from "I picked this".
      await page.focus('#cell')
      const [rowNow, cell] = await page.evaluate(() => {
        const input = document.querySelector('#cell')!
        return [getComputedStyle(document.querySelector('#looked-at')!).backgroundColor, getComputedStyle(input).boxShadow]
      })
      expect(rowNow).toBe(lookedAt)
      expect(cell).toContain('inset')
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

// On a desk the header is one 56 px row — tall enough for a 44 px target — and it carries the
// four tabs, the two actions and the shortcut beside "Uppdatera bordet" (#19). Below 1024 px the
// modes and the actions are the stage strip at the bottom of the screen instead (L10), so this
// is the desk's question: nothing in the row may wrap, because a header that wraps does not push
// the panel down, it spills over it.
describe('the editor header on a desk', () => {
  it.each([1024, 1280])('keeps every control inside its row at %i px', async (width) => {
    const page = await browser.newPage({ viewport: { width, height: 700 } })
    try {
      await page.setContent(`<!doctype html><html><head><style>body{margin:0}${css}</style></head><body>${SHELL}</body></html>`, { waitUntil: 'load' })
      const wrapped = await page.evaluate(() =>
        [...document.querySelectorAll('.byd-editor > header strong, .byd-editor > header button, .byd-editor-rev')]
          .filter((el) => {
            const range = document.createRange()
            range.selectNodeContents(el)
            // Two line boxes mean the text broke in two, which a 48 px row has no room for.
            // (Clipped text reports several rects on the same line; those are one line.)
            const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top)))
            return lines.size > 1 || el.getBoundingClientRect().bottom > 56
          })
          .map((el) => el.textContent?.trim().slice(0, 20)),
      )
      expect(wrapped).toEqual([])
    } finally {
      await page.close()
    }
  }, 60_000)
})
