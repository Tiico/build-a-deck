import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { contrastRatio } from '../../../web/src/player/contrast.js'
import { standing } from '../../support/surface.js'

// Every keyboard stop in the editor has to say where it is, in all three modes (UX-KONTROLLER:
// "komplett … tangentbordsinteraktion samt synlig fokusmarkering"). Only an engine that knows
// `:focus-visible` can answer that, so the shipped stylesheet is measured in one.
//
// Migrated from `packages/web/test/editor-css.test.ts`, which pasted `editor.css` and
// `buttons.css` into a document of its own — the editor that ships is the surface *and* the shared
// button language over it, and the honest way to have both in the right order is to open the route
// that links them. The editor's sheet is a chunk of its own (#186), so it is waited for by a token
// only it declares.
//
// The bare document also had to say `body{margin:0}` for the measurements that are about filling
// the window. The app's own shell says `html, body, #root { margin: 0; height: 100% }`, so
// standing in it is that baseline rather than a reconstruction of it.

// The editor declares its own tokens on `.byd-editor`; this is the one to wait for.
const EDITOR = { on: '.byd-editor', token: '--byd-editor-primary-mark' }

const SHELL = `
<div class="byd-editor" data-page="editor">
  <header>
    <a class="byd-editor-home" href="#" data-stop="the way out of the editor">Mina spel</a>
    <strong>Skogens herrar</strong>
    <span class="byd-editor-rev">rev 12</span>
    <span class="byd-editor-saved" data-unsaved="true">Osparat</span>
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
      <div class="byd-wall-view">
        <div class="byd-crown">
          <input type="search" class="byd-crown-search" aria-label="Sök i alla fält" data-stop="the wall's search" />
          <button class="byd-crown-box" aria-expanded="false" data-stop="the eyes box">Ögon: Som du ser det ▾</button>
          <button class="byd-crown-box" aria-expanded="false" data-stop="the guides box">Guider (0) ▾</button>
          <div class="byd-crown-step" role="group"><button data-stop="packing the wall closer">−</button><button data-stop="larger cards">+</button></div>
          <button class="byd-crown-box" aria-expanded="false" data-stop="the grouping box">Grupperad efter: typ ▾</button>
          <button class="byd-crown-fold" aria-expanded="true" data-stop="folding the jump column"><span>⟨</span>Fäll ihop hoppspalten</button>
          <button class="byd-crown-box byd-crown-end" aria-expanded="false" data-stop="the checks box">Fysisk kontroll (1) ▾</button>
        </div>
        <div class="byd-wall-work" data-fold="open">
          <nav class="byd-wall-jump" aria-label="Grupper i leken">
            <h2>Leken</h2>
            <div class="byd-wall-jump-scroll">
              <button data-jump="varelse" aria-current="true" data-stop="the band the wall is standing in"><span>varelse</span><small>132</small></button>
              <button data-jump="fälla" aria-current="false" tabindex="-1"><span>fälla</span><small>8</small></button>
            </div>
          </nav>
          <div class="byd-wall-deck"><div class="byd-wall"><div class="byd-wall-card" aria-selected="true"></div></div></div>
        </div>
        <div class="byd-crown-foot"><span>3 kort · 150 px breda</span></div>
      </div>
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
        <main class="byd-canvas-stage">
          <div class="byd-preview"><div class="byd-drag-layer">
            <div class="byd-drag-box" role="button" tabindex="0" data-stop="an element on the card"><i class="byd-drag-handle" data-handle="nw" aria-hidden="true"></i></div>
            <div class="byd-drag-box" role="button" tabindex="0" data-moving data-stop="an element in move mode"></div>
          </div></div>
        </main>
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
        <div class="byd-crown">
          <input type="search" class="byd-data-search" data-stop="the search field" />
          <div class="byd-crown-rail">
            <div class="byd-crown-rail-scroll" role="group">
              <div class="byd-data-chips" role="group"><button class="byd-data-chip byd-choice" aria-pressed="false" data-stop="a type chip">fälla</button></div>
            </div>
          </div>
          <button class="byd-data-clear" data-stop="the clear-filter button">Rensa filter</button>
          <button class="byd-crown-box byd-crown-end" aria-expanded="true" data-stop="the import box">Importera ▾</button>
        </div>
        <div class="byd-crown-drawer" data-crown-drawer role="group">
          <div class="byd-data-tools"><label>Importera CSV…<input type="file" data-stop="the CSV import" aria-describedby="import-note" /></label><span id="import-note">Import ersätter korten i tabellen. Spara när resultatet ser rätt ut.</span><a href="#" data-stop="the CSV export">Ladda ner CSV</a></div>
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
        <div class="byd-crown-foot">
          <p class="byd-data-count">1 av 3 kort</p>
          <p class="byd-data-sort">Osorterat: kortens ordning i spelet</p>
        </div>
      </div>
    </div>
    <div role="tabpanel" tabindex="0" data-stop="the tables panel">
      <div class="byd-tables">
        <p class="byd-tables-lead">Varje bord hör till det här spelet.</p>
        <section class="byd-tables-group" data-group="played">
          <h3 class="byd-tables-heading">Bord som spelas</h3>
          <ul class="byd-tables-list">
            <li class="byd-table-row" data-state="played" data-stale="true">
              <div class="byd-tables-mini"></div>
              <div class="byd-tables-info">
                <p class="byd-tables-head"><strong>rev-2</strong><span class="byd-tables-state" data-state="played">i spel</span><em class="byd-tables-stale">ligger efter rev-3</em></p>
                <p class="byd-tables-line">Ada spelar</p>
                <p class="byd-tables-line">senaste drag 19:41</p>
              </div>
              <div class="byd-tables-go">
                <a class="byd-secondary" href="#" data-stop="playing from here">Spela härifrån</a>
                <button class="byd-tables-more" aria-haspopup="menu" aria-expanded="true" data-stop="the row's menu">▾</button>
                <div class="byd-tables-menu" role="menu">
                  <a class="byd-tables-way" role="menuitem" href="#" data-stop="the TV view">Öppna TV-vyn</a>
                  <a class="byd-tables-way" role="menuitem" href="#" data-stop="the table mode">Bordsläge</a>
                  <a class="byd-tables-way" role="menuitem" href="#" data-stop="watching">Titta på</a>
                  <button class="byd-tables-way" role="menuitem" aria-expanded="true" data-stop="the QR toggle">QR för telefoner</button>
                  <hr class="byd-tables-cut" />
                  <button class="byd-tables-way byd-tables-way-apart" role="menuitem" data-stop="ending the table">Avsluta bordet</button>
                </div>
              </div>
              <div class="byd-tables-qr"><a href="#" data-stop="the join link">Anslutningssidan</a></div>
              <div class="byd-tables-question" role="alertdialog">
                <p>Avsluta bordet 1a2b3c4d?</p>
                <button data-kind="danger" data-stop="the yes to ending">Ja, avsluta</button>
                <button data-stop="the way out of ending">Avbryt</button>
              </div>
            </li>
          </ul>
        </section>
        <section class="byd-tables-group" data-group="untouched">
          <button class="byd-tables-fold" aria-expanded="false" data-stop="the fold over the untouched tables"><span class="byd-tables-caret">▸</span>Startade, aldrig spelade · 4</button>
        </section>
        <button class="byd-tables-new" data-stop="the new-table button">Nytt bord från rev 3</button>
      </div>
    </div>
  </main>
</div>`

// What a stop says about itself: the ring outside it, the mark inside it, and the background both
// have to be seen against. A field is a stop the reader types into; the rest are controls.
type Stop = { what: string; style: string; width: number; color: string; on: string; inside: string | null; typed: boolean }

// Walks the whole tab order and reports the focus ring at every stop, with the background it has
// to be seen against.
async function tabThrough(page: Page): Promise<Stop[]> {
  await standing(page, SHELL, { at: '/editor', needs: EDITOR })
  {
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
  }
}

test.describe('the editor under a keyboard', () => {
  test('draws a visible focus ring on every stop in every mode', async ({ page }) => {
    const stops = await tabThrough(page)
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
      "the wall's search",
      'the eyes box',
      'the guides box',
      'packing the wall closer',
      'larger cards',
      'the grouping box',
      'folding the jump column',
      'the checks box',
      'the band the wall is standing in',
      'the template panel',
      'a tool',
      'the selected layer',
      'the grid toggle',
      'an element on the card',
      'an element in move mode',
      'a property field',
      'a property choice',
      'the table panel',
      'the search field',
      'a type chip',
      'the clear-filter button',
      'the import box',
      'the CSV import',
      'the CSV export',
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
      'playing from here',
      "the row's menu",
      'the TV view',
      'the table mode',
      'watching',
      'the QR toggle',
      'ending the table',
      'the join link',
      'the yes to ending',
      'the way out of ending',
      'the fold over the untouched tables',
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
  })
})

// The element on the card is a keyboard stop of its own (#144), and the card under it is the
// designer's: it can be cream, it can be midnight blue, and the ring has to be seen on either. So
// the ring is two rings — one dark at the box's own edge, one light outside it — and the move mode
// wears the same shape in amber, which is a different thing to see than "the keyboard is here".
const ON_THE_CARD = `
<div class="byd-editor" data-page="editor" data-mode="template">
  <main><div role="tabpanel"><div class="byd-canvas"><main class="byd-canvas-stage"><div class="byd-preview">
    <div class="byd-drag-layer">
      <div id="plain" class="byd-drag-box" role="button" tabindex="0"></div>
      <div id="moving" class="byd-drag-box" role="button" tabindex="0" data-moving></div>
    </div>
  </div></main></div></div></main>
</div>`

// Every colour a ring is drawn in, outline and box-shadow together.
const RING = /(rgba?\([^)]*\)|#[0-9a-f]{3,8})/gi

test.describe('an element on the card under a keyboard (#144)', () => {
  test('rings it whatever the card is painted, and shows the move mode as something else again', async ({ page }) => {
    {
      await standing(page, ON_THE_CARD, { at: '/editor', needs: EDITOR })
      await page.focus('#plain')
      const rings = await page.evaluate(() =>
        ['plain', 'moving'].map((id) => {
          const style = getComputedStyle(document.getElementById(id)!)
          return { outline: style.outlineColor, width: parseFloat(style.outlineWidth), style: style.outlineStyle, shadow: style.boxShadow }
        }),
      )
      const [plain, moving] = rings as [{ outline: string; width: number; style: string; shadow: string }, { outline: string; width: number; style: string; shadow: string }]

      // Both are drawn, and the mode is not the same drawing as the focus it always has.
      expect([plain.style, moving.style]).toEqual(['solid', 'solid'])
      expect([plain.width >= 2, moving.width >= 2]).toEqual([true, true])
      expect(moving.outline).not.toBe(plain.outline)

      // And on a card of any colour at all, one of the rings is legible against it.
      const cards = ['#f4ead8', '#2f4068']
      const seen = rings.map((ring) => {
        const colours = [ring.outline, ...(ring.shadow.match(RING) ?? [])]
        return cards.map((card) => Math.max(...colours.map((c) => contrastRatio(c, card))) >= 3)
      })
      expect(seen).toEqual([
        [true, true],
        [true, true],
      ])
    }
  })
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

test.describe('the table under a selection', () => {
  test('draws a marked row differently from one that is not', async ({ page }) => {
    {
      await standing(page, MARKED, { at: '/editor', needs: EDITOR })
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
    }
  })
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

test.describe('the editor fills the window', () => {
  // Seven hundred high, because the numbers below are that window's own.
  test.use({ viewport: { width: 1280, height: 700 } })
  test('gives the open mode every pixel under the header, with or without a table link', async ({ page }) => {
    {
      const measured: Record<string, number[]> = {}
      for (const link of [false, true]) {
        await standing(page, TEMPLATE(link), { at: '/editor', needs: EDITOR })
        measured[link ? 'with a table link' : 'on its own'] = await page.evaluate(() =>
          ['.byd-editor > main', '[role="tabpanel"]', '.byd-canvas-layers'].map((sel) => Math.round(document.querySelector(sel)!.getBoundingClientRect().bottom)),
        )
      }
      expect(measured).toEqual({ 'on its own': [700, 700, 700], 'with a table link': [700, 700, 700] })
    }
  })
})

// On a desk the header is one 56 px row — tall enough for a 44 px target — and it carries the
// four tabs, the two actions and the shortcut beside "Uppdatera bordet" (#19). Below 1024 px the
// modes and the actions are the stage strip at the bottom of the screen instead (L10), so this
// is the desk's question: nothing in the row may wrap, because a header that wraps does not push
// the panel down, it spills over it.
test.describe('the editor header on a desk', () => {
  for (const width of [1024, 1280]) {
  test(`keeps every control inside its row at ${width} px`, async ({ page }) => {
    {
      await page.setViewportSize({ width, height: 700 })
      await standing(page, SHELL, { at: '/editor', needs: EDITOR })
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
    }
  })
  }
})

// The wall's table of contents folded to a strip (#179). Folded it is 66 px wide and the names are
// gone, so what is left has to be hittable and legible on its own: `--tap` holds in *both*
// directions, which is a rule the prototype broke at 43 px before it was fixed. The heights are
// proportional to the groups above that floor, so the strip reads as a cross-section of the deck.
const TILES: readonly (readonly [string, number])[] = [
  ['Playcard', 132],
  ['Character', 44],
  ['Shopcard', 40],
  ['Event', 36],
  ['Location', 20],
  ['Effect', 16],
  ['Trap+', 12],
  ['Trap-', 8],
]
const STRIP = `
<div class="byd-editor" data-page="editor" style="height:700px">
  <main>
    <div role="tabpanel">
      <div class="byd-wall-view">
        <div class="byd-crown"><button class="byd-crown-fold" aria-expanded="false"><span>&#x27E9;</span>Fäll ut hoppspalten</button></div>
        <div class="byd-wall-work" data-fold="folded">
          <nav class="byd-wall-rail" aria-label="Grupper i leken, hopfälld">
            ${TILES.map(
              ([name, n], i) =>
                `<button type="button" data-tile="${name}" aria-current="${i === 0}" aria-label="${name}, ${n} kort" style="flex-grow:${n}">${n}</button>`,
            ).join('')}
          </nav>
          <div class="byd-wall-deck"><div class="byd-wall"></div></div>
        </div>
      </div>
    </div>
  </main>
</div>`

test.describe('the folded jump column (#179)', () => {
  test.use({ viewport: { width: 1280, height: 800 } })
  test('is a 66 px strip of tiles that are a tap target both ways, sized by their groups', async ({ page }) => {
    {
      await standing(page, STRIP, { at: '/editor', needs: EDITOR })
      const measured = await page.evaluate(() => ({
        strip: Math.round(document.querySelector('.byd-wall-rail')!.getBoundingClientRect().width),
        tiles: [...document.querySelectorAll('[data-tile]')].map((el) => {
          const box = el.getBoundingClientRect()
          return { name: el.getAttribute('data-tile'), w: Math.round(box.width), h: Math.round(box.height) }
        }),
      }))
      expect(measured.strip).toBe(66)
      expect(measured.tiles.filter((tile) => tile.w < 44 || tile.h < 44)).toEqual([])
      // The strip is a cross-section and not a menu: a larger group is a taller tile, down to the
      // floor where the tail is pressed flat.
      const heights = measured.tiles.map((tile) => tile.h)
      expect(heights).toEqual([...heights].sort((a, b) => b - a))
      expect(heights[0]!).toBeGreaterThan(44)
    }
  })
})
