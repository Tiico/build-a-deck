// @vitest-environment jsdom
// Kamerans hörn, mätt (C5, #325).
//
// Klungan bor i filtens nedre högra hörn och går att fälla undan men aldrig att stänga. Vad den
// är bred och var den står är en layoutfråga, och jsdom svarar på ingen av dem — så den riktiga
// renderarens markup mäts i riktig Chromium mot de ark som skeppas, med filtens egen skärning
// först i kaskaden (#95). Utan den skulle textens bredd vara den här maskinens och inte
// produktens: DejaVu Sans ritar samma ord 12–14 % bredare än SF Pro.
//
// Prototypen mätte 318 px framme och 170 px fälld i maskinens eget `system-ui`. Produkten ritar
// samma form i filtens egen skärning och blir 300 och 152: arton pixlar smalare på båda, vilket
// är vad «Visa hela bordet» är i den ena skärningen mot den andra. Skillnaden mellan de två
// lägena är 148 px i båda mätningarna, och det är den som är beslutet — de två zoomstegen och
// nivån mellan dem är vad som fälls undan, och vägen hem är vad som aldrig gör det.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ReactElement } from 'react'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { chromium, type Browser, type Page } from 'playwright'
import { TableRenderer } from '../src/table/TableRenderer.js'
import { TvChrome } from '../src/table/TvChrome.js'
import { FELT_FONT, feltOf, sceneOf, sheet } from './felt-labels.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
// `camera-hand.css` står med, och står med *för att* det inte är i det blockerande arket (#325):
// klungan och markeringen hämtas med sin egen chunk när vyn blir egen, så den som mäter dem
// klistrar in båda arken precis som produkten har båda när klungan väl står där.
const SHEETS = [FELT_FONT, 'src/table/table.css', 'src/table/camera-hand.css', 'src/table/texture.css', 'src/table/keyboard.css', 'src/buttons.css', 'src/a11y.css']
// En TV, i TV:ns egna mått, som prototypen mättes i.
const FRAME = { w: 1920, h: 1080 }

let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser.close()
}, 60_000)

async function onPage<T>(html: string, look: (page: Page) => Promise<T>): Promise<T> {
  const page = await browser.newPage({ viewport: { width: FRAME.w, height: FRAME.h } })
  try {
    const shell = read('index.html')
      .replace('<script type="module" src="/src/main.tsx"></script>', '')
      .replace('</head>', `<style>${SHEETS.map(sheet).join('\n')}</style></head>`)
      .replace('<div id="root"></div>', `<div id="root" style="width:${FRAME.w}px;height:${FRAME.h}px">${html}</div>`)
    await page.setContent(shell, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
    return await look(page)
  } finally {
    await page.close()
  }
}

const scene = sceneOf(feltOf(4))
const tv = (body: ReactElement) => (
  <TvChrome view={scene} activity={[]} roomCode="KX7P" title="Kameran" version="rev-1">
    {body}
  </TvChrome>
)
function markupOf(node: ReactElement): string {
  const { container, unmount } = render(node)
  const html = container.innerHTML
  unmount()
  return html
}

// Filten som TV:n ger den, i den ruta TV:ns eget krom lämnar över (K8, K9).
async function mainBox(): Promise<{ w: number; h: number }> {
  return await onPage(markupOf(tv(<div />)), (page) =>
    page.evaluate(() => {
      const r = document.querySelector('[data-tv] > main')!.getBoundingClientRect()
      return { w: Math.round(r.width), h: Math.round(r.height) }
    }),
  )
}

// Filten med en egen vy på: hjulet dras in, och klungan finns därför att vyn är manuell. Med
// `fold` fälls den undan först, vilket är det andra av de två lägen den har.
// Klungan hämtas med sin egen chunk, så den väntas in innan markupen plockas ut — väntan ligger
// i det som ställer upp provet och aldrig i påståendet.
async function manualMarkup(main: { w: number; h: number }, fold: boolean): Promise<string> {
  const { container, unmount } = render(tv(<TableRenderer view={scene} mode="tv" camera="follow" size={main} glideMs={0} onAct={() => undefined} />))
  try {
    fireEvent.wheel(document.querySelector('.byd-table-frame')!, { deltaY: -900, clientX: main.w / 2, clientY: main.h / 2 })
    if (fold) fireEvent.click(await screen.findByRole('button', { name: 'Fäll undan kamerakontrollerna' }))
    else await screen.findByRole('button', { name: 'Fäll undan kamerakontrollerna' })
    return container.innerHTML
  } finally {
    unmount()
  }
}

type Box = { x: number; y: number; w: number; h: number }
const boxes = (page: Page, wanted: Record<string, string>) =>
  page.evaluate((selectors) => {
    const of = (sel: string): { x: number; y: number; w: number; h: number } | null => {
      const el = document.querySelector(sel)
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
    }
    return Object.fromEntries(Object.entries(selectors).map(([name, sel]) => [name, of(sel)]))
  }, wanted) as Promise<Record<string, Box | null>>

describe('klungan i hörnet (#325)', () => {
  it('är bredare framme än fälld, och fälld bär fortfarande vägen hem', async () => {
    const main = await mainBox()
    const out = await onPage(await manualMarkup(main, false), (page) =>
      boxes(page, { klunga: '.byd-camera-controls', hem: '.byd-camera-whole', fall: '.byd-camera-fold', niva: '.byd-camera-level' }),
    )
    const folded = await onPage(await manualMarkup(main, true), (page) =>
      boxes(page, { klunga: '.byd-camera-controls', hem: '.byd-camera-whole', fall: '.byd-camera-fold' }),
    )
    // Framme mot fälld. Skillnaden är de två zoomstegen, nivån mellan dem och luften omkring
    // dem, och ingenting annat: 148 px, samma tal som prototypens 318 mot 170.
    expect({ framme: out['klunga']!.w, fälld: folded['klunga']!.w }).toEqual({ framme: 300, fälld: 152 })
    expect(out['klunga']!.w - folded['klunga']!.w).toBe(318 - 170)
    // Fälld är vägen hem kvar, lika bred som förut, och vägen tillbaka till knapparna med den.
    expect(folded['hem']!.w).toBe(out['hem']!.w)
    expect(folded['fall']).not.toBeNull()
    expect(out['niva']!.w).toBeGreaterThanOrEqual(42)
  }, 90_000)

  it('står i filtens nedre högra hörn, ovanför det som redan står där', async () => {
    const main = await mainBox()
    const out = await onPage(await manualMarkup(main, false), (page) =>
      boxes(page, { ram: '.byd-table-frame', klunga: '.byd-camera-controls', hjälp: '.byd-shortcut-help' }),
    )
    const frame = out['ram']!
    const cluster = out['klunga']!
    const help = out['hjälp']!
    // Hörnet: samma sextonde pixel in från högerkanten som hjälpens skiva står på.
    expect(frame.x + frame.w - (cluster.x + cluster.w)).toBe(16)
    // Och ovanför skivan, som är det som redan står i det hörnet: ingen överlappning alls.
    expect(cluster.y + cluster.h).toBeLessThanOrEqual(help.y)
  }, 90_000)
})

describe('kantmarkeringen (#325)', () => {
  it('börjar ovanför docken nedtill, och når sin egen kant på de tre andra sidorna', async () => {
    const main = await mainBox()
    const out = await onPage(await manualMarkup(main, false), async (page) => {
      // Alla fyra sidorna på en gång: markeringen ritas bara där något faktiskt ligger utanför,
      // så den som mäter formen lägger dit alla fyra själv, med renderarens egna klassnamn.
      await page.evaluate(() => {
        const frame = document.querySelector('.byd-table-frame')!
        for (const side of ['left', 'right', 'top', 'bottom']) {
          if (frame.querySelector(`.byd-camera-edge[data-side="${side}"]`)) continue
          const el = document.createElement('div')
          el.className = 'byd-camera-edge'
          el.setAttribute('data-side', side)
          frame.appendChild(el)
        }
      })
      return boxes(page, {
        ram: '.byd-table-frame',
        vänster: '.byd-camera-edge[data-side="left"]',
        höger: '.byd-camera-edge[data-side="right"]',
        över: '.byd-camera-edge[data-side="top"]',
        under: '.byd-camera-edge[data-side="bottom"]',
        hjälp: '.byd-shortcut-help',
      })
    })
    const frame = out['ram']!
    const bottom = frame.y + frame.h
    // De tre andra möter sin egen bildkant.
    expect(out['vänster']!.x).toBe(frame.x)
    expect(out['höger']!.x + out['höger']!.w).toBe(frame.x + frame.w)
    expect(out['över']!.y).toBe(frame.y)
    // Den nedre gör det inte: den börjar 74 px upp, ovanför docken och ovanför hjälpens skiva,
    // eftersom en pil ritad över en plats pekar på fel sak.
    expect(bottom - (out['under']!.y + out['under']!.h)).toBe(74)
    expect(out['under']!.y + out['under']!.h).toBeLessThanOrEqual(out['hjälp']!.y)
  }, 90_000)
})
