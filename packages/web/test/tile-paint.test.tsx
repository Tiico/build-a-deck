// @vitest-environment jsdom
// Brickan i sin form på filten (#1485, variant A i #1474): texturen målas inom brickans kontur,
// och kartongens kant syns under den. Mätt på målade pixlar i Chromium med de stilmallar som
// skeppas, som andelar av brickans egen ruta och som färger, aldrig en Macs pixlar.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { ReactElement } from 'react'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { chromium, type Browser, type Page } from 'playwright'
import { STANDARD_TYPES, TILE_COIN, TILE_HEX, TypeRegistry, initialState, project, type DeckFacts, type SetupDef } from '@byd/engine'
import { TableRenderer } from '../src/table/TableRenderer.js'
import { twoSeatSetup } from './fixture.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const FACE = /url\('(\.\/[^']+\.woff2)'\)/g
const sheet = (rel: string): string =>
  read(rel).replace(FACE, (_all, file: string) => `url('data:font/woff2;base64,${readFileSync(join(import.meta.dirname, '..', dirname(rel), file)).toString('base64')}')`)
const SHEETS = ['src/fonts/felt-font.css', 'src/table/table.css', 'src/table/texture.css', 'src/table/keyboard.css', 'src/buttons.css', 'src/a11y.css']

const registry = new TypeRegistry(STANDARD_TYPES)
const FACES = 'http://faces.test'
// A red picture: every face the felt fetches.
const RED = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64')
const hex = { id: TILE_HEX.id, version: TILE_HEX.version }
const coin = { id: TILE_COIN.id, version: TILE_COIN.version }

// A hexagon and a coin face up on the felt, and a hidden bag of hexagons.
function scene() {
  const base = twoSeatSetup()
  const setup: SetupDef = {
    ...base,
    zones: [...base.zones, { id: 'bag', kind: 'pile', name: 'Landskap', visibility: 'none', geometry: { x: 0, y: -150, w: 0, h: 0, rot: 0 } }],
    components: [
      ...base.components,
      ...['Granskog', 'Tjärn', 'Fjäll'].map((cardRef) => ({ type: hex, cardRef, zone: 'bag', face: 'back' as const })),
      { type: hex, cardRef: 'Rågåker', zone: 'table', face: 'front' as const, x: 150, y: 150 },
      { type: coin, cardRef: 'Guld', zone: 'table', face: 'front' as const, x: 400, y: 150 },
    ],
  }
  const faces: DeckFacts['faces'] = Object.fromEntries(['Granskog', 'Tjärn', 'Fjäll', 'Rågåker', 'Guld'].map((r) => [r, { front: `f-${r}`, back: 'baksida' }]))
  return project(initialState('v1', setup, registry), registry, null, { faces })
}

let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser.close()
}, 60_000)

function markupOf(node: ReactElement): string {
  const { container, unmount } = render(node)
  const html = container.innerHTML
  unmount()
  return html
}

async function onPage<T>(html: string, size: { w: number; h: number }, look: (page: Page) => Promise<T>): Promise<T> {
  const page = await browser.newPage({ viewport: { width: size.w, height: size.h } })
  try {
    await page.route(`${FACES}/faces/**`, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: RED }))
    const shell = read('index.html')
      .replace('<script type="module" src="/src/main.tsx"></script>', '')
      .replace('</head>', `<style>${SHEETS.map(sheet).join('\n')}</style></head>`)
      .replace('<div id="root"></div>', `<div id="root" style="width:${size.w}px;height:${size.h}px">${html}</div>`)
    await page.setContent(shell, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
    // Static markup never hears its images load: what is measured is the felt once they are there.
    await page.evaluate(() => document.querySelectorAll('.byd-texture-state').forEach((s) => s.remove()))
    return await look(page)
  } finally {
    await page.close()
  }
}

// What is painted at points of a box, as shares of its width and height.
const PAINT = `(async () => {
  const img = new Image()
  img.src = 'data:image/png;base64,' + window.__shot
  await img.decode()
  const canvas = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height })
  const ink = canvas.getContext('2d')
  ink.drawImage(img, 0, 0)
  const at = (r, fx, fy) => Array.from(ink.getImageData(Math.round(r.left + r.width * fx), Math.round(r.top + r.height * fy), 1, 1).data.slice(0, 3))
  const look = (el) => {
    const r = el.getBoundingClientRect()
    return { middle: at(r, 0.5, 0.5), corner: at(r, 0.06, 0.06), side: at(r, 0.02, 0.5), under: at(r, 0.5, 1.02), w: r.width, h: r.height }
  }
  const tile = (ref) => [...document.querySelectorAll('.byd-card[data-component]')].find((el) => el.getAttribute('data-shape') !== null && el.textContent.includes(ref))
  return {
    hex: look(tile('Rågåker')),
    coin: look(tile('Guld')),
    bag: look(document.querySelector('.byd-pile[data-zone="bag"] .byd-pile-top')),
  }
})()`
type Look = { middle: number[]; corner: number[]; side: number[]; under: number[]; w: number; h: number }
const red = (rgb: number[]) => rgb[0]! > 200 && rgb[1]! < 60 && rgb[2]! < 60
// The cardboard's edge: dark and brown, nothing like the felt's green or the texture's red.
const board = (rgb: number[]) => !red(rgb) && rgb[0]! >= rgb[1]! && rgb[1]! >= rgb[2]! && rgb[0]! < 120

describe('a tile on the felt is drawn in its shape (#1485)', () => {
  it('paints its texture inside its outline, and its cardboard edge under it', async () => {
    const frame = { w: 1280, h: 800 }
    const got = await onPage(markupOf(<TableRenderer view={scene()} mode="tv" scale={1.4} faces={FACES} onAct={() => undefined} />), frame, async (page) => {
      const shot = (await page.screenshot()).toString('base64')
      await page.evaluate((s) => ((window as unknown as { __shot: string }).__shot = s), shot)
      return (await page.evaluate(PAINT)) as { hex: Look; coin: Look; bag: Look }
    })
    // The hexagon's box is the type's 52 × 60 mm, its picture in the middle and not in the corners
    // a hexagon with a point up leaves, nor at the middle of its flat sides' outside.
    expect(got.hex.w / got.hex.h).toBeCloseTo(52 / ((52 * 2) / Math.sqrt(3)), 2)
    expect({ middle: red(got.hex.middle), corner: red(got.hex.corner), edge: board(got.hex.under) }).toEqual({ middle: true, corner: false, edge: true })
    // The coin is a disc: nothing painted in the corners of its square.
    expect(got.coin.w).toBeCloseTo(got.coin.h, 1)
    expect({ middle: red(got.coin.middle), corner: red(got.coin.corner) }).toEqual({ middle: true, corner: false })
    // A hidden bag of hexagons is a stack of hexagons: its back in the shape, and its edge under it.
    expect(got.bag.w / got.bag.h).toBeCloseTo(got.hex.w / got.hex.h, 2)
    expect({ middle: red(got.bag.middle), corner: red(got.bag.corner), edge: board(got.bag.under) }).toEqual({ middle: true, corner: false, edge: true })
  }, 120_000)
})
