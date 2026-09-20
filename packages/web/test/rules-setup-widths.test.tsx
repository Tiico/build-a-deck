// @vitest-environment jsdom
// Vad uppställningen gör med den bredd den har (#270).
//
// Den godkända formen köps med grupperingen: en plats i taget är vad som gör att 45 zoner med
// långa namn går att läsa i luckan, på TV:n och på en telefon på 320 px. Det är en fråga om
// layout, så den ställs till en riktig motor mot det ark appen skeppar — som `rules-layout` och
// `editor-tables-layout` ställer sina.
//
// Ingen siffra som hör till en maskin står här. CI ritar ett annat typsnitt än en Mac, så det som
// påstås är förhållanden: ingenting rullar i sidled, inget zonnamn är avskuret, och det som ritas
// är gemensamma zoner plus en plats — aldrig alla åtta. De två tal som *är* produktens egna, 44 px
// träffyta och kontrastens 4,5 och 3, står som de tal de är.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fireEvent, render, within } from '@testing-library/react'
import { chromium, type Browser, type Page } from 'playwright'
import type { RenderedRules, SetupSeat, SetupZone } from '@byd/template'
import { Language } from '../src/i18n/index.js'
import { RuleShelf } from '../src/rules/RuleDrawer.js'
import { contrastRatio } from '../src/player/contrast.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const shell = read('index.html')
const css = `${read('src/rules/rules-open.css')}
${read('src/rules/rules.css')}\n${read('src/a11y.css')}`

// En bok med ett enda uppställningsblock i: det är bilden som mäts, och allt annat i boken vore
// bara höjd att skrolla förbi.
const bookOf = (common: SetupZone[], seats: SetupSeat[]): RenderedRules => ({
  title: 'Skogens herrar',
  warnings: [],
  text: 'Så ställs bordet upp',
  blocks: [
    { kind: 'heading', id: 'h1', level: 1, children: [{ type: 'text', text: 'Uppställning' }] },
    { kind: 'setup', id: 's1', caption: 'Så ställs bordet upp', common, seats },
  ],
})

// En liten uppställning, och den täta: 45 zoner med namn så långa en designer rimligen skriver
// dem — fem gemensamma och åtta platser med fem var.
const SMALL = bookOf(
  [
    { id: 'draw', name: 'Draghög' },
    { id: 'discard', name: 'Kasthög' },
  ],
  ['A', 'B'].map((seat) => ({ id: seat, zones: [{ id: `hand:${seat}`, name: 'Hand' }, { id: `mine:${seat}`, name: `Framför ${seat}` }] })),
)
const LONG = ['Kort som lagts åt sidan i rundan', 'Marknaden vid vägkorset', 'Gemensamma marker och mynt', 'Draghög för den långa leken', 'Kasthög som töms mellan rundorna']
const DENSE = bookOf(
  LONG.map((name, i) => ({ id: `common-${i}`, name })),
  'ABCDEFGH'.split('').map((seat) => ({
    id: seat,
    zones: ['Hand', `Framför ${seat}`, `Reserven vid plats ${seat}`, `Vunna kort hos plats ${seat}`, `Kort som väntar på nästa runda vid plats ${seat}`].map((name, i) => ({ id: `z-${seat}-${i}`, name })),
  })),
)
const ZONES_IN_DENSE = 5 + 8 * 5

type Placement = 'table' | 'tv' | 'phone'
// Bilden som den står utfälld, ritad av produktens egen komponent och inte av en avskrift här.
//
// Luckan väntas in innan markupen plockas (#346): sedan dess ark lyftes av den kritiska vägen
// hämtas luckan med sin stilmall, och den finns inte i samma bildruta som knappen. Utan väntan
// vore `container.innerHTML` bara knappen, och Chromium hade fått mäta en tom ruta.
async function markupOf(rules: RenderedRules, placement: Placement): Promise<string> {
  const { container, unmount } = render(
    <Language lang="sv">
      <RuleShelf rules={rules} placement={placement} startOpen />
    </Language>,
  )
  try {
    await within(container).findByRole('dialog', { name: 'Regler' })
    fireEvent.click(within(container).getByRole('button', { name: 'Visa uppställningen' }))
    return container.innerHTML
  } finally {
    unmount()
  }
}

let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser.close()
}, 60_000)

// Luckan hänger på filten vid bordet och är fäst vid skärmen på TV:n och telefonen, så bordets
// variant behöver ett rum att hänga i. Rummet är fönstret, vilket är vad filten är.
async function onSurface<T>(rules: RenderedRules, placement: Placement, size: { w: number; h: number }, look: (page: Page) => Promise<T>): Promise<T> {
  const html = await markupOf(rules, placement)
  const page = await browser.newPage({ viewport: { width: size.w, height: size.h } })
  try {
    const document_ = shell
      .replace('<script type="module" src="/src/main.tsx"></script>', '')
      .replace('</head>', `<style>${css}\nbody{margin:0}\n.probe{position:relative;width:${size.w}px;height:${size.h}px}</style></head>`)
      .replace('<div id="root"></div>', `<div id="root"><div class="probe">${html}</div></div>`)
    await page.setContent(document_, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
    return await look(page)
  } finally {
    await page.close()
  }
}

// Allt som kan vara fel med en bredd, läst i ett svep.
const measured = (page: Page) =>
  page.evaluate(() => {
    const over = (el: Element) => Math.round(el.scrollWidth - el.clientWidth)
    const panel = document.querySelector<HTMLElement>('.byd-rules-panel')!
    const body = document.querySelector<HTMLElement>('.byd-rules-body')!
    const rows = [...document.querySelectorAll<HTMLElement>('[data-setup-zone]')]
    const box = panel.getBoundingClientRect()
    const control = (el: HTMLElement) => {
      const r = el.getBoundingClientRect()
      return { height: Math.round(r.height), outside: Math.round(Math.max(0, r.right - box.right, box.left - r.left)) }
    }
    return {
      // Ingenting rullar i sidled: inte sidan, inte luckan, inte bokens egen yta.
      sideways: { page: over(document.documentElement), panel: over(panel), body: over(body) },
      // Inget zonnamn är avskuret eller ligger utanför luckan.
      rows: rows.length,
      clipped: rows.filter((li) => li.scrollWidth - li.clientWidth > 1 || li.getBoundingClientRect().right > box.right + 1).map((li) => li.textContent),
      // Varje rad har verkligen ritats med en bredd att läsa i.
      narrowest: Math.min(...rows.map((li) => Math.round(li.clientWidth))),
      toggle: control(document.querySelector<HTMLElement>('.byd-rules-setup-toggle')!),
      picker: control(document.querySelector<HTMLElement>('.byd-rules-setup-pick select')!),
    }
  })

// De tre ytorna boken läses på, var och en med sin egen bredd. 320 px är den avgörande: det är
// den smalaste telefon produkten håller (L12).
const SURFACES = [
  { what: 'telefonen vid 320 px', placement: 'phone' as const, size: { w: 320, h: 640 } },
  { what: 'telefonen vid 390 px', placement: 'phone' as const, size: { w: 390, h: 844 } },
  { what: 'regelluckan vid bordet', placement: 'table' as const, size: { w: 1024, h: 768 } },
  { what: 'TV:n', placement: 'tv' as const, size: { w: 1280, h: 720 } },
]

describe.each(SURFACES)('uppställningen i boken på $what (#270)', ({ placement, size }) => {
  it('låter 45 zoner med långa namn läsas utan att något rullar i sidled eller skärs av', async () => {
    const seen = await onSurface(DENSE, placement, size, measured)
    expect(seen.sideways).toEqual({ page: 0, panel: 0, body: 0 })
    expect(seen.clipped).toEqual([])
    // Det är grupperingen som köper det: det som står på bordet plus *en* plats, aldrig alla 45.
    expect(seen.rows).toBe(5 + 5)
    expect(seen.rows).toBeLessThan(ZONES_IN_DENSE)
    expect(seen.narrowest).toBeGreaterThan(0)
  }, 90_000)

  it('gör samma sak med en liten uppställning, som är vad de flesta spel har', async () => {
    const seen = await onSurface(SMALL, placement, size, measured)
    expect(seen.sideways).toEqual({ page: 0, panel: 0, body: 0 })
    expect(seen.clipped).toEqual([])
    expect(seen.rows).toBe(2 + 2)
  }, 90_000)

  it('ger både utfällningen och platsväljaren en träffyta på 44 px som ryms i luckan', async () => {
    const seen = await onSurface(DENSE, placement, size, measured)
    expect(seen.toggle.height).toBeGreaterThanOrEqual(44)
    expect(seen.picker.height).toBeGreaterThanOrEqual(44)
    expect({ toggle: seen.toggle.outside, picker: seen.picker.outside }).toEqual({ toggle: 0, picker: 0 })
  }, 90_000)
})

// Kontrasten i de tillstånd tokenproven inte når: en knapp under pekaren är en färg ingen
// färgtabell känner till, och den mäts därför här, på det som verkligen målas.
describe('uppställningens egna tillstånd håller kontrasten (L11)', () => {
  it('håller texten på 4,5:1 och linjen på 3:1, i vila och under pekaren', async () => {
    const readings = await onSurface(DENSE, 'phone', { w: 320, h: 640 }, async (page) => {
      const of = async () =>
        page.evaluate(() => {
          const el = document.querySelector<HTMLElement>('.byd-rules-setup-toggle')!
          const paper = getComputedStyle(document.querySelector<HTMLElement>('.byd-rules-panel')!).backgroundColor
          const style = getComputedStyle(el)
          return { ink: style.color, fill: style.backgroundColor, line: style.borderTopColor, paper }
        })
      const rest = await of()
      await page.hover('.byd-rules-setup-toggle')
      return { rest, hover: await of() }
    })
    for (const [state, seen] of Object.entries(readings)) {
      expect(contrastRatio(seen.ink, seen.fill), `${state}: ordet mot sin egen platta`).toBeGreaterThanOrEqual(4.5)
      // Linjen är det som säger var kontrollen slutar, och en grafik bär 3:1 mot bägge sidor.
      expect(contrastRatio(seen.line, seen.fill), `${state}: linjen mot plattan`).toBeGreaterThanOrEqual(3)
      expect(contrastRatio(seen.line, seen.paper), `${state}: linjen mot bokens papper`).toBeGreaterThanOrEqual(3)
    }
    // Inte tomt prov: pekaren ändrar faktiskt något, annars mäts samma sak två gånger.
    expect(readings.hover.fill).not.toBe(readings.rest.fill)
  }, 90_000)
})
