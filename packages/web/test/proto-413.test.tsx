// @vitest-environment jsdom
/**
 * PROTOTYP — kasta bort. Frågan: förslag A i #413 lägger handens antalsbricka mot handzonens
 * inre linje, mitt för platsen. Platsnamnet ligger i samma grunda remsas andra ände, också mitt
 * för platsen, och de två får inte plats. Vilken av de tre vägarna ut går fri?
 *
 * Mätt med repots egen läsning — `READ` och `NAME_MARGIN` ur `test/felt-labels.ts`, samma 15 %
 * som `felt-names.test.tsx` fäller på — på produktens egen renderare, vid 2–8 platser och alla
 * fyra vridningar. En prototyp som ritade en egen filt hade svarat på fel fråga.
 *
 *   pnpm --filter @byd/web exec tsx scripts/proto-413.tsx
 */
import { afterAll, beforeAll, it } from 'vitest'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { ReactElement } from 'react'
import { render } from '@testing-library/react'
import { chromium, type Browser, type Page } from 'playwright'
import { MAX_PLAYERS } from '@byd/server/doc'
import { TableRenderer } from '../src/table/TableRenderer.js'
import { FELT_FONT, READ, feltOf, namesOf, sceneOf, sheet, type Reading } from '../test/felt-labels.js'

const FRAME = { w: 1280, h: 800 }
const SHEETS = [FELT_FONT, 'src/table/table.css', 'src/table/texture.css', 'src/table/keyboard.css', 'src/editor/editor.css', 'src/buttons.css', 'src/a11y.css']
const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')

// Samma renderingsväg som `felt-names.test.tsx`, och det är inte en detalj: en prototyp som
// renderade på ett annat sätt än grinden svarade på en annan fråga än den som ställdes.
function markupOf(node: ReactElement): string {
  const { container, unmount } = render(node)
  const html = container.innerHTML
  unmount()
  return html
}

/** Vad varje väg lägger ovanpå den byggda filten. Tom sträng = förslag A precis som beslutat. */
const WAYS = {
  'A · som beslutat': '',
  // Namnet ut på träramen: remsan blir fri, brickan står kvar mitt för platsen.
  'A + namnet ut ur remsan': `
    .byd-seat-name[data-edge='S'] { bottom: -26px !important; }
    .byd-seat-name[data-edge='N'] { top: -26px !important; }
    .byd-seat-name[data-edge='E'] { right: -26px !important; }
    .byd-seat-name[data-edge='W'] { left: -26px !important; }`,
  // Brickan längs kanten tills den går fri: den hänger kvar på zonens linje, så den står stilla.
  'A + brickan längs kanten': `
    .byd-hand[data-count-side='above'] .byd-hand-count,
    .byd-hand[data-count-side='below'] .byd-hand-count { translate: 78px 0; }
    .byd-hand[data-count-side='left'] .byd-hand-count,
    .byd-hand[data-count-side='right'] .byd-hand-count { translate: 0 78px; }`,
  // Som i dag, alltså också som #427: brickan hänger utåt förbi kanten, utanför remsan.
  'i dag / #427 · brickan utåt': `
    .byd-hand-count { top: calc(var(--hand-inner, 0px) + 12px) !important; bottom: auto !important; left: 0 !important; right: auto !important; transform: translateX(-50%) !important; }
    .byd-hand[data-count-side='below'] .byd-hand-count { top: auto !important; bottom: calc(var(--hand-inner, 0px) + 12px) !important; }
    .byd-hand[data-count-side='left'] .byd-hand-count { top: 0 !important; left: calc(var(--hand-inner, 0px) + 12px) !important; right: auto !important; transform: translateY(-50%) !important; }
    .byd-hand[data-count-side='right'] .byd-hand-count { top: 0 !important; left: auto !important; right: calc(var(--hand-inner, 0px) + 12px) !important; transform: translateY(-50%) !important; }`,
} as const

const TURNS = [0, 90, 180, 270] as const
const SEATS = Array.from({ length: MAX_PLAYERS - 1 }, (_, i) => i + 2)

let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser.close()
}, 60_000)

async function onPage<T>(html: string, extra: string, look: (page: Page) => Promise<T>): Promise<T> {
  const page = await browser.newPage({ viewport: { width: FRAME.w, height: FRAME.h } })
  try {
    const shell = read('index.html')
      .replace('<script type="module" src="/src/main.tsx"></script>', '')
      .replace('</head>', `<style>${SHEETS.map(sheet).join('\n')}\n${extra}</style></head>`)
      .replace('<div id="root"></div>', `<div id="root" style="width:${FRAME.w}px;height:${FRAME.h}px">${html}</div>`)
    await page.setContent(shell, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
    return await look(page)
  } finally {
    await page.close()
  }
}

const OUT = join(import.meta.dirname, '..', '..', '..', 'docs', 'ux-audits', '2026-09-22', 'prototyper', '04-brickan-och-namnet')

it('mäter de tre vägarna', async () => {
  mkdirSync(OUT, { recursive: true })
  const rows: { way: string; seats: number; turn: number; pairs: string[]; cardPx: number }[] = []

  for (const [way, extra] of Object.entries(WAYS)) {
    for (const seats of SEATS) {
      for (const turn of TURNS) {
        const setup = feltOf(seats, false)
        const html = markupOf(<TableRenderer view={sceneOf(setup)} mode="table" rotate={turn} size={FRAME} />)
        const reading = (await onPage(html, extra, (page) => page.evaluate(READ))) as Reading
        if (reading.names.length === 0) throw new Error(`${way}, ${seats} platser: inga namn lästes — mätningen mäter ingenting`)
        if (namesOf(setup).some((n) => !reading.names.includes(n))) throw new Error(`${way}, ${seats} platser: namn saknas`)
        // Icke-vakuitet, och den viktigaste: brickan måste finnas på filten, annars mäter det
        // här att en bricka som inte ritas inte krockar med någonting.
        if (way === 'A · som beslutat' && seats === 4 && turn === 0) console.log('lästa etiketter:', JSON.stringify(reading.names))
        rows.push({ way, seats, turn, pairs: reading.pairs, cardPx: reading.cardPx })
        if (turn === 0 && (seats === 2 || seats === 4 || seats === 8)) {
          await onPage(html, extra, (page) => page.screenshot({ path: join(OUT, `${way.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${seats}.png`) }))
        }
      }
    }
  }

  const byWay = new Map<string, typeof rows>()
  for (const r of rows) byWay.set(r.way, [...(byWay.get(r.way) ?? []), r])
  const lines = ['| Väg | Krockar (av 28 scener) | Vilka | Kortets kortsida, 4 platser |', '| --- | --- | --- | --- |']
  for (const [way, rs] of byWay) {
    const bad = rs.filter((r) => r.pairs.length > 0)
    const which = [...new Set(bad.flatMap((r) => r.pairs))].slice(0, 4).join(', ')
    const card = rs.find((r) => r.seats === 4 && r.turn === 0)?.cardPx ?? 0
    lines.push(`| **${way}** | ${bad.length === 0 ? '**inga**' : `${bad.length}`} | ${which || '—'} | ${card.toFixed(1)} px |`)
  }
  const table = lines.join('\n')
  writeFileSync(join(OUT, 'matning.md'), `${table}\n`)
  console.log('\n' + table + '\n')
}, 900_000)
