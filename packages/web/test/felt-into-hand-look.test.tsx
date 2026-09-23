// @vitest-environment jsdom
// Att bandet faktiskt målas, mätt på pixlarna och inte på deklarationerna (#444, K24).
//
// De andra grindarna säger att elementet finns, var dess rektangel ligger och vilka färger paret
// är deklarerat i. Ingen av dem hade märkt att bandet ritades under filten, klipptes bort eller
// täcktes av något annat — och ett band ingen ser är precis det fel den här markeringen finns
// för att inte vara. Så sidan fotograferas och färgen läses ur bilden, med `painted.ts`, som
// redan gör det åt knappspråket på just den här filten.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { chromium, type Browser } from 'playwright'
import { CARD_STANDARD_63x88, STANDARD_TYPES, TypeRegistry, initialState, project, type SetupDef } from '@byd/engine'
import { SWEDISH_WORDS, openingSetup } from '@byd/server/doc'
import type { Snapshot } from '@byd/protocol'
import { TableRenderer } from '../src/table/TableRenderer.js'
import { seatColor } from '../src/table/seatColor.js'
import { painted, type Spot } from './painted.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const FACE = /url\('(\.\/[^']+\.woff2)'\)/g
const sheet = (rel: string): string => read(rel).replace(FACE, (_a, file: string) => `url('data:font/woff2;base64,${readFileSync(join(import.meta.dirname, '..', dirname(rel), file)).toString('base64')}')`)
const SHEETS = ['src/fonts/felt-font.css', 'src/table/table.css', 'src/table/texture.css', 'src/table/keyboard.css', 'src/buttons.css', 'src/a11y.css']

const registry = new TypeRegistry(STANDARD_TYPES)
const CARD = { id: CARD_STANDARD_63x88.id, version: 1 }
const FRAME = { w: 1280, h: 800 }
// En skala i stället för en inpassning: i TV:ns avbildning är en klientpixel då en bordsmillimeter
// gånger skalan, och draget kan siktas på en millimeter fast jsdom inte lägger ut något.
const SCALE = 0.6

function scene(): Snapshot {
  const setup = openingSetup({ players: 4, counters: [{ name: 'Poäng', start: 0 }] }, SWEDISH_WORDS)
  const def: SetupDef = {
    seats: setup.seats,
    floor: setup.floor,
    zones: setup.zones.map((z) => ({ id: z.id, kind: z.kind, name: z.name, visibility: z.visibility, geometry: z.geometry, ...(z.owner ? { owner: z.owner } : {}), ...(z.returnTo ? { returnTo: z.returnTo } : {}), ...(z.shortcut ? { shortcut: z.shortcut } : {}) })),
    components: [
      ...Array.from({ length: 20 }, (_, i) => ({ type: CARD, cardRef: `Kort ${i + 1}`, zone: setup.deckZone, face: 'back' as const })),
      ...setup.seats.flatMap((s) => Array.from({ length: 5 }, (_, i) => ({ type: CARD, cardRef: `H${s}${i}`, zone: `hand:${s}`, face: 'back' as const }))),
      { type: CARD, cardRef: 'Skogsvakten', zone: setup.floor, x: 520, y: 180, face: 'front' as const },
    ],
  }
  return project(initialState('v1', def, registry), registry, null)
}

let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser.close()
}, 60_000)

// Filten, med kortet buret till en punkt på seat A:s fläkt och pekaren fortfarande nere.
function carried(): string {
  const view = scene()
  const floor = view.zones.find((z) => z.id === view.floor)!.geometry
  const loose = view.components.find((c) => c.cardRef === 'Skogsvakten')!
  const hand = view.zones.find((z) => z.kind === 'hand' && z.owner === 'A')!.geometry
  // `onAct` behövs bara för att filten ska vara spelbar; vad den skickar prövas på annat håll.
  const sent: unknown[] = []
  const { container, unmount } = render(<TableRenderer view={view} mode="tv" scale={SCALE} size={FRAME} seatNames onAct={(intents) => sent.push(intents)} />)
  const card = container.querySelector(`[data-component="${loose.id}"]`)!
  const cl = (p: { x: number; y: number }) => ({ clientX: (p.x - floor.x) * SCALE, clientY: (p.y - floor.y) * SCALE, pointerId: 1, isPrimary: true, button: 0 })
  fireEvent.pointerDown(card, cl({ x: floor.x + loose.x + 30, y: floor.y + loose.y + 40 }))
  fireEvent.pointerMove(card, cl({ x: -10, y: hand.y + 40 }))
  const html = container.innerHTML
  unmount()
  return html
}

// Hur långt isär två målade färger ligger, som ett avstånd i rå RGB. Ingen kontrastkvot: två
// färger kan ha samma luminans och ändå vara röd och grön, vilket är precis fallet här.
const apart = (a: string, b: string): number => {
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const [x, y] = [rgb(a), rgb(b)]
  return Math.hypot(x[0]! - y[0]!, x[1]! - y[1]!, x[2]! - y[2]!)
}

const SPOTS: readonly Spot[] = [
  // Bandets inre, där bandet är det översta. `inset` är litet: bandet är ett smalt streck, och
  // det är just det smala som ska visa sig ha målats. Fläkten och det burna kortet ligger mitt
  // på bandet och hör inte hit — att de täcker sin del av det är meningen, och resten av
  // platsens 500 mm är det som ska ha en färg.
  { what: 'bandet', inside: '.byd-seat-band', inset: 0.2, avoid: '.byd-card, .byd-hand, .byd-seat-name' },
  // Filten bredvid, utan något som ligger på den: det bandet ska skilja sig från.
  { what: 'filten', inside: '.byd-zone[data-area]', avoid: '.byd-card, .byd-pile, .byd-hand, .byd-seat-band, .byd-seat-name' },
]

describe('bandet som säger att en hand tar emot, läst ur pixlarna (#444, K24)', () => {
  it(
    'målar platsens egen färg på filten, där inget täcker den',
    async () => {
      const page = await browser.newPage({ viewport: { width: FRAME.w, height: FRAME.h } })
      try {
        const shell = read('index.html')
          .replace('<script type="module" src="/src/main.tsx"></script>', '')
          .replace('</head>', `<style>${SHEETS.map(sheet).join('\n')}</style></head>`)
          .replace('<div id="root"></div>', `<div id="root" style="width:${FRAME.w}px;height:${FRAME.h}px">${carried()}</div>`)
        await page.setContent(shell, { waitUntil: 'load' })
        await page.evaluate(() => document.fonts.ready.then(() => undefined))
        const grounds = await painted(page, SPOTS)
        const seat = seatColor(0)
        const [darkest, middle, lightest] = grounds['bandet']!.shades
        // Fyllningen är flat, så halva bandet och uppåt är platsens färg och ingenting annat.
        for (const shade of [middle, lightest]) expect(apart(shade, seat), `bandet målat i ${shade}, platsen är ${seat}`).toBeLessThan(4)
        // Den mörkaste tjugondelen är inte det, och ska inte vara det: det är skuggan under det
        // kort man bär, som faller tvärs över bandet. Den mäts ändå, mot filten — en skugga får
        // dämpa bandet men aldrig göra det till filt igen.
        expect(apart(darkest, seat), `bandet i sin egen skugga, ${darkest}`).toBeLessThan(45)
        expect(apart(darkest, grounds['filten']!.shades[1]), `bandet i sin egen skugga, ${darkest}`).toBeGreaterThan(60)
        // Och filten bredvid är inte platsens färg. Utan den här raden skulle en filt som råkade
        // vara röd få samma mätning att gå igenom.
        for (const shade of grounds['filten']!.shades) expect(apart(shade, seat), `filten målad i ${shade}`).toBeGreaterThan(60)
      } finally {
        await page.close()
      }
    },
    60_000,
  )
})
