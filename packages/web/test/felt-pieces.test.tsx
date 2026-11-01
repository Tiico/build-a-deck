// @vitest-environment jsdom
// A wooden piece reads on the green felt, measured on the painted pixels and not on the declarations
// (#1475, prototype #1472). No seat colour reaches 3:1 against the felt by itself (1.59–2.77 in the
// middle, 2.53 for the purple at the rim), so every figure carries a hairline of the felt's chalk,
// and that hairline is what has to hold — read out of a photograph of the felt, at every seat's
// colour, in the felt's middle where a piece moved out lies and at its rim where the piles lie.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { chromium, type Browser } from 'playwright'
import { DISC, MEEPLE, STANDARD_TYPES, TypeRegistry, initialState, project, type SetupDef } from '@byd/engine'
import { SWEDISH_WORDS, openingSetup } from '@byd/server/doc'
import type { Snapshot } from '@byd/protocol'
import { TableRenderer } from '../src/table/TableRenderer.js'
import { seatColor } from '../src/table/seatColor.js'
import { contrastRatio } from '../src/player/contrast.js'
import { painted, type Spot } from './painted.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const FACE = /url\('(\.\/[^']+\.woff2)'\)/g
const sheet = (rel: string): string => read(rel).replace(FACE, (_a, file: string) => `url('data:font/woff2;base64,${readFileSync(join(import.meta.dirname, '..', dirname(rel), file)).toString('base64')}')`)
const SHEETS = ['src/fonts/felt-font.css', 'src/table/table.css', 'src/table/texture.css', 'src/buttons.css', 'src/a11y.css']

const registry = new TypeRegistry(STANDARD_TYPES)
const FRAME = { w: 1280, h: 800 }
const SEATS = 8
const CHALK = '#f3e9d6'

// Eight seats, and for each a meeple out in the middle of the felt and a disc near the rim, in the
// seat's colour. Nothing else lies near them, so the ground round each is the felt.
function scene(): Snapshot {
  const setup = openingSetup({ players: SEATS, counters: [] }, SWEDISH_WORDS)
  const floor = setup.zones.find((z) => z.id === setup.floor)!.geometry
  const def: SetupDef = {
    seats: setup.seats,
    floor: setup.floor,
    zones: setup.zones.map((z) => ({ id: z.id, kind: z.kind, name: z.name, visibility: z.visibility, geometry: z.geometry, ...(z.owner ? { owner: z.owner } : {}), ...(z.returnTo ? { returnTo: z.returnTo } : {}) })),
    components: setup.seats.flatMap((seat, i) => [
      { type: { id: MEEPLE.id, version: MEEPLE.version }, cardRef: seat, zone: setup.floor, face: 'standing', x: floor.w / 2 - 280 + i * 70, y: floor.h / 2 + 120 },
      { type: { id: DISC.id, version: DISC.version }, cardRef: seat, zone: setup.floor, face: 'front', x: floor.w / 2 - 280 + i * 70, y: 40 },
    ]),
  }
  const view = project(initialState('pieces', def, registry), registry, null)
  return { ...view, seats: view.seats.map((s) => ({ ...s, name: s.name ?? s.id })) }
}

let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser.close()
}, 60_000)

describe('a wooden piece on the green felt, read off the pixels (#1475)', () => {
  it(
    'holds 3:1 against the felt in every seat’s colour, by its chalk hairline',
    async () => {
      const view = scene()
      const { container, unmount } = render(<TableRenderer view={view} mode="table" size={FRAME} />)
      const html = container.innerHTML
      unmount()
      const page = await browser.newPage({ viewport: { width: FRAME.w, height: FRAME.h } })
      try {
        const shell = read('index.html')
          .replace('<script type="module" src="/src/main.tsx"></script>', '')
          .replace('</head>', `<style>${SHEETS.map(sheet).join('\n')}</style></head>`)
          .replace('<div id="root"></div>', `<div id="root" style="width:${FRAME.w}px;height:${FRAME.h}px">${html}</div>`)
        await page.setContent(shell, { waitUntil: 'load' })
        const pieces = view.components.map((c, i) => ({ c, seat: Math.floor(i / 2) }))
        const spots: Spot[] = [
          { what: 'filten', inside: '[data-table]', avoid: '.byd-piece, .byd-zone, .byd-hand, .byd-pile, .byd-seat-name' },
          ...pieces.map(({ c }) => ({ what: c.id, inside: `[data-piece="${c.id}"] svg`, inset: 0 })),
        ]
        const grounds = await painted(page, spots)
        const felt = grounds['filten']!
        expect(felt.points).toBeGreaterThan(0)
        // The ground is the green felt, and not the dark one of the room's television.
        for (const shade of felt.shades) {
          const [r, g, b] = [1, 3, 5].map((k) => parseInt(shade.slice(k, k + 2), 16))
          expect(g!, `filten målad i ${shade}`).toBeGreaterThan(r! + 15)
          expect(g!).toBeGreaterThan(b!)
        }
        for (const { c, seat } of pieces) {
          const ground = grounds[c.id]!
          expect(ground.points, c.id).toBeGreaterThan(0)
          const hairline = ground.shades[2]
          // The lightest of the piece is the chalk, not the seat's colour and not the felt.
          // The lightest of the piece is the chalk, antialiased into the felt on a band this thin, and
          // nearer the chalk than the seat's own colour is.
          expect(contrastRatio(hairline, CHALK), `${c.type.id} i ${seatColor(seat)}: ljusast ${hairline}`).toBeLessThan(contrastRatio(seatColor(seat), CHALK))
          for (const shade of felt.shades) expect(contrastRatio(hairline, shade), `${c.type.id} i ${seatColor(seat)} mot ${shade}`).toBeGreaterThanOrEqual(3)
        }
        // And the colour alone did not carry it: at least one seat's colour falls under 3:1 on this
        // felt, which is why the hairline is there at all.
        const weakest = Math.min(...Array.from({ length: SEATS }, (_, i) => contrastRatio(seatColor(i), felt.shades[1])))
        expect(weakest).toBeLessThan(3)
      } finally {
        await page.close()
      }
    },
    60_000,
  )
})
