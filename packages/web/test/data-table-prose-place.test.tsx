// @vitest-environment jsdom
// Var prosamärkets utfällning står (L43, #362, #394). L43 valde variant C därför att den «kostar
// ingenting i vila», och utfällningen är beslutets enda kostnad när den väl är framme. Den
// kostnaden får vara raderna under rubriken. Den får inte vara rubriken själv, grannkolumnen,
// den egna dragkanten eller den egna fokusringen — alla fyra ligger i huvudet, och en utfällning
// som hänger *ur* rubriken har ingenting där att göra.
//
// jsdom lägger ingenting ut, så var någonting står och vad som ligger överst mäts i en riktig
// motor med den riktiga stilmallen, precis som fliktens övriga geometri (#32, #46).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { chromium, type Browser } from 'playwright'
import { DataTable } from '../src/editor/DataTable.js'
import { deckValues, fitColumns, markValues } from '../src/editor/columns.js'
import { translate, type T } from '../src/i18n/index.js'
import { projectDoc } from './project-doc.js'

const sv: T = (key, params) => translate('sv', key, params)
const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const FIT = `(box, deck) => { (${String(fitColumns)})(box, deck); (${String(markValues)})(box) }`
const VIEW = { w: 1280, h: 800 }

// Rubriken med pekaren på sig, som markup. `pointerEnter` är vad handen gör, och `data-prose`
// på cellen är vad rubriken svarar — så markupen bär utfällningen utan att något här vet hur
// den öppnas.
function markup(field: string): { html: string; deck: Record<string, string[]> } {
  const { container, unmount } = render(
    <DataTable
      doc={projectDoc()}
      selectedRow={null}
      onSelectRow={() => undefined}
      onCell={() => undefined}
      onAddRow={() => undefined}
      onRemoveRow={() => undefined}
      onReplaceRows={() => undefined}
      onAddField={() => undefined}
      onRemoveField={() => undefined}
      onMoveField={() => undefined}
      onProse={() => undefined}
    />,
  )
  const th = container.querySelector(`.byd-data thead th[data-col="${field}"]`)!
  fireEvent.pointerEnter(th)
  const html = container.innerHTML
  unmount()
  return { html, deck: deckValues(projectDoc(), sv) }
}

let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser.close()
}, 60_000)

const shellOf = (html: string) =>
  read('index.html')
    .replace('<script type="module" src="/src/main.tsx"></script>', '')
    .replace('</head>', `<style>${read('src/editor/editor.css')}\n${read('src/buttons.css')}</style></head>`)
    .replace('<div id="root"></div>', `<div id="root"><div class="byd-editor" data-page="editor" data-mode="table"><main><div role="tabpanel">${html}</div></main></div></div>`)

type Box = { x: number; y: number; w: number; h: number }
type Reach = {
  // Vad som faktiskt ligger överst i mitten av en punkt, som en pekare hittar den.
  onTop: string
  // Och om det som ligger överst är målet självt eller något inuti det.
  hits: boolean
}
type Seen = {
  panel: Box
  hoveredInk: Box
  neighbourSort: Reach
  ownPull: Reach
  // Rubrikcellen, och den ring editorn faktiskt ritar runt dess knapp — bredd och avstånd lästa
  // av sidan i ett riktigt tangentbordsfokus, aldrig nedskrivna här. En siffra här hade varit
  // sann på maskinen som skrev den.
  hoveredCell: Box
  ring: Box | null
}

async function look(field: string, neighbour: string): Promise<Seen> {
  const page = await browser.newPage({ viewport: { width: VIEW.w, height: VIEW.h } })
  try {
    await page.setContent(shellOf(markup(field).html), { waitUntil: 'load' })
    // Markupen bär utfällningen, men stilmallen lyfter rubriken ur huvudets målningsordning på
    // `:hover` — och utan en riktig pekare på rubriken målas grannen ovanpå panelen, vilket är
    // en ordning som aldrig finns i editorn. Så pekaren ställs där handen har den.
    const at = (await page.evaluate((col) => {
      const r = document.querySelector(`.byd-data thead th[data-col="${col}"]`)!.getBoundingClientRect()
      return { x: r.x + 8, y: r.y + r.height / 2 }
    }, field)) as { x: number; y: number }
    await page.mouse.move(at.x, at.y)
    // Tangentbordsfokus på rubrikens knapp, med riktiga Tabb-tryck: `:focus-visible` ritas inte
    // av ett `focus()` i Chromium, så en ring mätt efter ett sådant hade varit en ring som inte
    // finns. Tio tryck räcker med marginal genom huvudets början.
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab')
      const there = await page.evaluate((col) => document.activeElement?.closest('th')?.getAttribute('data-col') === col && document.activeElement?.tagName === 'BUTTON', field)
      if (there) break
    }
    return (await page.evaluate(
      ({ deck, fit, field, neighbour }) => {
        new Function('box', 'deck', `(${fit})(box, deck)`)(document.querySelector('.byd-data-scroll'), deck)
        const box = (el: Element): Box => {
          const r = el.getBoundingClientRect()
          return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
        }
        const reach = (el: Element): Reach => {
          const r = el.getBoundingClientRect()
          const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
          return { onTop: top ? `${top.tagName.toLowerCase()}.${top.className || '(namnlös)'}` : '(ingenting)', hits: top !== null && (top === el || el.contains(top)) }
        }
        const th = (col: string) => document.querySelector(`.byd-data thead th[data-col="${col}"]`)!
        return {
          panel: box(document.querySelector('.byd-prose-why')!),
          hoveredInk: box(th(field).querySelector('button')!),
          neighbourSort: reach(th(neighbour).querySelector('button')!),
          ownPull: reach(th(field).querySelector('.byd-data-pull')!),
          hoveredCell: box(th(field)),
          ring: (() => {
            const el = document.activeElement
            if (!(el instanceof HTMLElement) || el.closest('th') !== th(field)) return null
            const cs = getComputedStyle(el)
            const out = parseFloat(cs.outlineWidth) + parseFloat(cs.outlineOffset)
            if (!(out > 0)) return null
            const r = box(el)
            return { x: r.x - out, y: r.y - out, w: r.w + 2 * out, h: r.h + 2 * out }
          })(),
        }
      },
      { deck: deckValues(projectDoc(), sv), fit: FIT, field, neighbour },
    )) as Seen
  } finally {
    await page.close()
  }
}

const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

describe('utfällningen hänger ur rubriken och lägger sig inte i huvudet (L43, #394)', () => {
  it('lämnar grannkolumnens rubrik åtkomlig för pekaren', async () => {
    const seen = await look('title', 'body')
    // Provet är värt noll om utfällningen inte är framme: den står på sidan och är bredare än
    // kolumnen den hör till, vilket är varför den kan nå grannen alls.
    expect(seen.panel.w).toBeGreaterThan(0)
    expect(seen.neighbourSort.hits, `grannens sorteringsknapp låg under ${seen.neighbourSort.onTop}`).toBe(true)
  }, 60_000)

  // #46:s kant bor inne i rubriken och är tio pixlar bred. En panel som täcker den tar bort den
  // enda pekarvägen till en kolumnbredd — och gör det tyst: ett drag på den täckta delen ändrade
  // ingenting och sade ingenting.
  it('lämnar den egna dragkanten åtkomlig hela sin höjd', async () => {
    const seen = await look('title', 'body')
    expect(seen.ownPull.hits, `dragkanten låg under ${seen.ownPull.onTop}`).toBe(true)
  }, 60_000)

  // Fokusringen är det enda som säger var tangentbordet står. Att utfällningen öppnas av fokus är
  // L43:s åtagande och är rätt; att den lägger sig över den ring som just svarade på frågan är
  // det inte. Ringen ritas runt en knapp som sitter inne i rubrikcellen, så villkoret är att
  // panelen börjar under cellen — då är både ordet och ringen hela, utan att något mått på dem
  // behöver skrivas ner.
  it('hänger under rubrikens ord, så ordet och dess fokusring är hela', async () => {
    const seen = await look('title', 'body')
    expect(seen.ring, 'ingen ring att mäta: fokus nådde aldrig rubrikens knapp').not.toBeNull()
    // Ringen ligger utanför knappen, så villkoret ställs på ringen och inte på ordet: den som
    // är hel har ordet hel med sig.
    expect(seen.panel.y).toBeGreaterThanOrEqual(seen.ring!.y + seen.ring!.h)
    expect(overlaps(seen.panel, seen.ring!), 'utfällningen låg över fokusringen').toBe(false)
    expect(overlaps(seen.panel, seen.hoveredInk), 'utfällningen låg över rubrikens eget ord').toBe(false)
    // Och den står fortfarande där den ska stå: inne i rubrikcellens spalt, inte någon annanstans
    // på sidan.
    expect(seen.panel.x).toBe(seen.hoveredCell.x)
  }, 60_000)
})
