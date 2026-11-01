// @vitest-environment jsdom
// Brädet på filten (#1480, variant A i #1473): brädet ligger under allt annat, och zonerna på det
// ritas som krita med en mörk gloria så att de läses mot vilken bild designern än valt.
//
// Mätt på målade pixlar i Chromium med de stilmallar som skeppas: ett kort lagt mitt på brädet målar
// sitt eget, och brädet runt det målar brädets. Andelar och färger, aldrig en Macs pixlar.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { ReactElement } from 'react'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { chromium, type Browser, type Page } from 'playwright'
import { BOARDS, STANDARD_TYPES, TypeRegistry, initialState, project, type DeckFacts } from '@byd/engine'
import type { Snapshot } from '@byd/protocol'
import { applyRecipe, openingSetup, recipeOf, setupFromProject, type Setup } from '@byd/server/doc'
import { TableRenderer } from '../src/table/TableRenderer.js'
import { TvChrome } from '../src/table/TvChrome.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const FACE = /url\('(\.\/[^']+\.woff2)'\)/g
const sheet = (rel: string): string =>
  read(rel).replace(FACE, (_all, file: string) => `url('data:font/woff2;base64,${readFileSync(join(import.meta.dirname, '..', dirname(rel), file)).toString('base64')}')`)
const SHEETS = ['src/fonts/felt-font.css', 'src/table/table.css', 'src/table/texture.css', 'src/table/keyboard.css', 'src/buttons.css', 'src/a11y.css']

const registry = new TypeRegistry(STANDARD_TYPES)
const ref = (id: string) => {
  const def = BOARDS.find((b) => b.id === id)!
  return { id: def.id, version: def.version }
}
const FACES = 'http://faces.test'
// A red picture, the board's side as the felt fetches it.
const RED = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64')

function boardTable(seats: number): Setup {
  const setup = {
    ...openingSetup({ players: seats, counters: [{ name: 'Liv', start: 20 }] }),
    boards: [
      { id: 'main', type: ref('board.square457'), zone: 'table' },
      { id: 'spelare', type: ref('board.player'), role: 'mine' },
    ],
  }
  const laid = applyRecipe(setup, recipeOf(setup))
  // A zone the designer drew on the board, below and right of its middle.
  const floor = laid.zones.find((z) => z.id === 'table')!.geometry
  const torget: Setup['zones'][number] = { id: 'torget', kind: 'area', name: 'Torget', visibility: 'all', geometry: { x: floor.x + floor.w / 2 + 20, y: floor.y + floor.h / 2 + 40, w: 150, h: 120, rot: 0 } }
  return { ...laid, zones: [...laid.zones, torget] }
}

function sceneOf(setup: Setup): Snapshot {
  const rows = Array.from({ length: 6 }, (_, i) => ({ id: `Kort ${i + 1}`, fields: {} }))
  const table = setupFromProject({ rows, setup })
  // A card lying face up in the middle of the main board.
  const floor = setup.zones.find((z) => z.id === 'table')!.geometry
  table.components.push({ type: { id: 'card.standard.63x88', version: 1 }, cardRef: 'Kort 1', zone: 'table', face: 'front', x: floor.w / 2 - 31.5 - 120, y: floor.h / 2 - 44 })
  const facts: DeckFacts = { ownFaces: { main: { front: 'brade' }, spelare: { front: 'spelarbrade' } } }
  return project(initialState('bord', table, registry), registry, null, facts)
}

function markupOf(node: ReactElement): string {
  const { container, unmount } = render(node)
  const html = container.innerHTML
  unmount()
  return html
}

let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser.close()
}, 60_000)

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
    // Static markup never hears its images load, so the waiting state is taken off by hand: what is
    // measured is the picture the felt paints once the texture is there.
    await page.evaluate(() => document.querySelectorAll('.byd-board .byd-texture-state').forEach((s) => s.remove()))
    return await look(page)
  } finally {
    await page.close()
  }
}

const act = () => undefined
async function feltMarkup(scene: Snapshot, mode: 'tv' | 'table', frame: { w: number; h: number }): Promise<string> {
  if (mode === 'table') return markupOf(<TableRenderer view={scene} mode="table" size={frame} faces={FACES} onAct={act} />)
  const tv = (body: ReactElement) => (
    <TvChrome view={scene} activity={[]} roomCode="KX7P" title="Brädet" version="rev-1">
      {body}
    </TvChrome>
  )
  const main = await onPage(markupOf(tv(<div />)), frame, (page) =>
    page.evaluate(() => {
      const r = document.querySelector('[data-tv] > main')!.getBoundingClientRect()
      return { w: Math.round(r.width), h: Math.round(r.height) }
    }),
  )
  return markupOf(tv(<TableRenderer view={scene} mode="tv" camera="follow" size={main} glideMs={0} faces={FACES} onAct={act} />))
}

// What is painted at the middle of the card on the board, and on the board a card's width beside
// it: the card's own paint on top, and the board's red around it.
const PAINT = `(async () => {
  const shot = window.__shot
  const img = new Image()
  img.src = 'data:image/png;base64,' + shot
  await img.decode()
  const canvas = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height })
  const ink = canvas.getContext('2d')
  ink.drawImage(img, 0, 0)
  const at = (x, y) => Array.from(ink.getImageData(Math.round(x), Math.round(y), 1, 1).data.slice(0, 3))
  const card = document.querySelector('.byd-card[data-component]').getBoundingClientRect()
  const zone = document.querySelector('.byd-zone[data-area="torget"]')
  return {
    boards: document.querySelectorAll('.byd-board[data-board]').length,
    card: at(card.left + card.width / 2, card.top + card.height / 2),
    beside: at(card.left - card.width * 0.6, card.top + card.height / 2),
    onBoard: zone.hasAttribute('data-on-board'),
    zoneLine: getComputedStyle(zone).borderTopStyle,
    mine: document.querySelector('.byd-zone[data-area="mine:A"]')?.getAttribute('data-on-board') ?? null,
    mineLine: getComputedStyle(document.querySelector('.byd-zone[data-area="mine:A"]')).borderTopStyle,
  }
})()`
const red = (rgb: number[]) => rgb[0]! > 200 && rgb[1]! < 60 && rgb[2]! < 60

describe('brädet på filten (#1480)', () => {
  it.each([
    ['tv', { w: 1920, h: 1080 }],
    ['table', { w: 1280, h: 800 }],
  ] as const)('ligger under kortet som ligger på det, i %s-läget vid %o', async (mode, frame) => {
    const scene = sceneOf(boardTable(4))
    const got = await onPage(await feltMarkup(scene, mode, frame), frame, async (page) => {
      const shot = (await page.screenshot()).toString('base64')
      await page.evaluate((s) => ((window as unknown as { __shot: string }).__shot = s), shot)
      return (await page.evaluate(PAINT)) as { boards: number; card: number[]; beside: number[]; onBoard: boolean; zoneLine: string; mine: string | null; mineLine: string }
    })
    // The main board and one player board per seat.
    expect(got.boards).toBe(5)
    expect({ beside: red(got.beside), card: red(got.card) }).toEqual({ beside: true, card: false })
    // A zone drawn on the board is chalk: dashed, with the dark halo the stylesheet gives it.
    expect({ onBoard: got.onBoard, line: got.zoneLine }).toEqual({ onBoard: true, line: 'dashed' })
    // A seat's «Framför» that is its player board's own footprint draws no outline round the board:
    // the board is the zone, and its name stands on the plate (variant A).
    expect({ mine: got.mine, line: got.mineLine }).toEqual({ mine: 'whole', line: 'none' })
  }, 120_000)
})
