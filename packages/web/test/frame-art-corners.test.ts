// Bildens hörn i startramarna (#1224), mätta på målade bildpunkter.
//
// Classic-ramens linje har rundade hörn med 3 mm radie, medan bilden innanför den hade fyrkantiga.
// Bilden ligger över linjen, så dess övre hörn ritades ut över linjens hörnbåge: uppe till höger på
// sheriffen i prototypen för #1208, på skärmen och som en synlig kant i tryck. Den mörka ramen hade
// samma fel mot sin egen bildplatta, som är rundad medan bilden på den var fyrkantig, så en tom ruta
// och en fylld hade olika form.
//
// Påståendet gäller det som målas och inte det mallen säger. Kortet kompileras med utfall, som
// `printExportOf` gör, med en bild som fyller rutan i en färg som ingen ram bär, och fotograferas i
// Chromium. Sedan räknas bildpunkterna i varje hörn. Ingenting här beror på ett typsnitt: i hörnen
// står ingen text, kostnaden är tom så cirkeln uppe till höger ritas inte, och varje läge räknas fram
// ur elementens egna rutor i sidan och ur mallens millimetrar, aldrig skrivet som en pixel.
//
// Samma mätning görs på ett spel som skapades före rättelsen (#1238), så som det lagrades och så
// som det läses genom dörren: det är vad varje äldre version av ett sådant spel ritas som.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser, type Page } from 'playwright'
import { CARD_STANDARD_63x88 } from '@byd/engine'
import { compile, liftTemplate, type Element } from '@byd/template'
import { capture, hostDocument } from '@byd/render'
import { columnOf, defaultFields, FRAMES } from '../src/wizard/frames.js'
import { translate, type T } from '../src/i18n/index.js'

type Shape = Extract<Element, { kind: 'shape' }>
type Rgb = { r: number; g: number; b: number }
type Box = { x: number; y: number; w: number; h: number }
// En hörnbåge i bildpunkter: medelpunkt, radie och åt vilket håll hörnet ligger från medelpunkten.
type Arc = { cx: number; cy: number; r: number; sx: -1 | 1; sy: -1 | 1 }

const t: T = (key, params) => translate('sv', key, params)
// Magenta finns inte i någon ram, så varje bildpunkt i den färgen är bilden.
const ART: Rgb = { r: 255, g: 0, b: 255 }
const PICTURE = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#ff00ff"/></svg>')}`
// Kortet ritas som tryckpressen ritar det (`renderTexture`): dokumentet förstoras med `zoom` och
// skärmen har skalan 1, så en CSS-pixel i den förstorade sidan är en bildpunkt. Med en förstorad
// skärm i stället (`deviceScaleFactor`) rundar Chromium bildens ruta till hela CSS-pixlar, en
// kvarts millimeter vid den här storleken, och det var rundningen som mättes och inte hörnet.
// Åtta gånger är nog för att en tiondels millimeter ska vara tre bildpunkter, så att det som
// räknas aldrig är kantutjämningen.
const SCALE = 8
const PX_PER_MM = (96 / 25.4) * SCALE
// Kantutjämningens bredd: en bildpunkt så här nära en båge räknas inte åt något håll.
const EDGE = 0.12 * PX_PER_MM
const FAR = 1e6

const hex = (colour: string): Rgb => ({ r: parseInt(colour.slice(1, 3), 16), g: parseInt(colour.slice(3, 5), 16), b: parseInt(colour.slice(5, 7), 16) })

// En rundad rutas fyra hörnbågar.
const arcsOf = (box: Box, r: number): Arc[] =>
  ([[-1, -1], [1, -1], [-1, 1], [1, 1]] as const).map(([sx, sy]) => ({
    cx: sx < 0 ? box.x + r : box.x + box.w - r,
    cy: sy < 0 ? box.y + r : box.y + box.h - r,
    r,
    sx,
    sy,
  }))

const front = (frameId: string): Element[] => FRAMES.find((f) => f.id === frameId)!.front(defaultFields(t), t).base
const shapeIn = (base: Element[], id: string): Shape => {
  const el = base.find((e) => e.kind === 'shape' && e.id === id)
  if (!el) throw new Error(`the frame has no shape ${id}`)
  return el as Shape
}
const PICTURED = FRAMES.filter((f) => front(f.id).some((e) => e.kind === 'image')).map((f) => f.id)

// Ett spel som skapades före #1224 (#1238): ramen gav bilden fyrkantiga hörn och plattan under den
// 2 mm, och så ligger den kvar i spelets dokument och i varje version av det. Den läses genom samma
// dörr som allt lagrat läses genom (`liftTemplate`, via `liftDoc` på servern), och det är vad som
// kommer ut genom dörren som ritas.
const before1224 = (base: Element[]): Element[] =>
  base.map((el) => {
    if (el.kind === 'image' && el.id === 'art') {
      const { radiusMm: _radius, ...square } = el
      return square
    }
    return el.kind === 'shape' && el.id === 'artbg' ? { ...el, radiusMm: 2 } : el
  })
const READS = {
  'a game made now': (frameId: string) => front(frameId),
  'a game made before #1224, read through the door': (frameId: string) => liftTemplate({ base: before1224(front(frameId)), variants: {} }).base,
}

let browser: Browser
let page: Page
beforeAll(async () => {
  browser = await chromium.launch()
  page = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: 2400, height: 3200 } })
}, 60_000)
afterAll(async () => {
  await browser?.close()
}, 60_000)

// Kortet som tryckpaketet ser det, fotograferat, och rutorna för de element som frågas efter, i
// bildpunkter från kortets övre vänstra hörn.
async function painted(base: Element[], ids: string[]): Promise<{ png: string; boxes: Record<string, Box> }> {
  // The frame binds through the columns the game gets, which are the fields' labels (#476).
  const cells: Record<string, string> = { title: 'Sheriffen', body: '', cost: '', art: PICTURE }
  const row = Object.fromEntries(defaultFields(t).map((f) => [columnOf(f), cells[f.key] ?? '']))
  const compiled = compile({ type: CARD_STANDARD_63x88, face: { base, variants: {} }, row, icons: {}, bleed: true })
  await page.setContent(hostDocument(compiled, SCALE), { waitUntil: 'load' })
  await page.evaluate(() => Promise.all(Array.from(document.images, (img) => img.decode())))
  // The boxes as the screen has them, which with the zoom on the document are its own pixels.
  const card = (await page.locator('[data-card]').boundingBox())!
  // The control on the scale: the card with its bleed is 69 mm wide in the picture.
  expect(Math.abs(card.width - 69 * PX_PER_MM)).toBeLessThan(2)
  const boxes: Record<string, Box> = {}
  for (const id of ids) {
    const b = (await page.locator(`[data-element="${id}"]`).boundingBox())!
    boxes[id] = { x: b.x - card.x, y: b.y - card.y, w: b.width, h: b.height }
  }
  return { png: (await capture(page, { clip: card })).toString('base64'), boxes }
}

// Bildpunkterna i varje hörns kvadrant, mellan två avstånd från bågens medelpunkt, som har färgen.
async function count(png: string, arcs: Arc[], from: (arc: Arc) => number, to: (arc: Arc) => number, colour: Rgb, tolerance: number): Promise<number[]> {
  const query = arcs.map((arc) => ({ ...arc, from: from(arc), to: Math.min(to(arc), arc.r * 2) }))
  return page.evaluate(
    async ({ png, query, colour, tolerance }) => {
      const img = new Image()
      img.src = `data:image/png;base64,${png}`
      await img.decode()
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      return query.map(({ cx, cy, r, sx, sy, from, to }) => {
        // Kvadranten: från medelpunkten och två radier ut, åt hörnets håll.
        const x0 = Math.max(0, Math.floor(sx < 0 ? cx - 2 * r : cx))
        const y0 = Math.max(0, Math.floor(sy < 0 ? cy - 2 * r : cy))
        const side = Math.ceil(2 * r)
        const data = ctx.getImageData(x0, y0, side, side).data
        let n = 0
        for (let j = 0; j < side; j++) {
          for (let i = 0; i < side; i++) {
            const px = x0 + i + 0.5
            const py = y0 + j + 0.5
            if ((px - cx) * sx < 0 || (py - cy) * sy < 0) continue
            const d = Math.hypot(px - cx, py - cy)
            if (d < from || d > to) continue
            const k = (j * side + i) * 4
            if (Math.abs(data[k]! - colour.r) <= tolerance && Math.abs(data[k + 1]! - colour.g) <= tolerance && Math.abs(data[k + 2]! - colour.b) <= tolerance) n++
          }
        }
        return n
      })
    },
    { png, query, colour, tolerance },
  )
}

describe('a starter frame’s picture keeps inside the rounded corners round it (#1224)', () => {
  it('measures every frame that has a picture, classic among them', () => {
    expect(PICTURED).toEqual(expect.arrayContaining(['classic', 'dark']))
  }, 60_000)

  for (const [read, faceOf] of Object.entries(READS)) {
    describe(read, () => {
      // Bilden målar ingenting utanför sin bildplattas rundade kontur, och fyller den ända fram till
      // bågen: en tom ruta och en fylld har samma form.
      for (const frameId of PICTURED) {
        it(`paints the ${frameId} frame’s picture inside its plate’s rounded outline`, async () => {
          const base = faceOf(frameId)
          const plate = shapeIn(base, 'artbg')
          expect(plate.radiusMm ?? 0).toBeGreaterThan(0)
          const { png, boxes } = await painted(base, ['artbg'])
          const arcs = arcsOf(boxes['artbg']!, plate.radiusMm! * PX_PER_MM)
          // Kontrollen: bilden är målad, och den fyller hörnen fram till bågen.
          const inside = await count(png, arcs, () => 0, (a) => a.r - EDGE, ART, 24)
          expect(inside.every((n) => n > 100), `the picture inside its corners: ${inside}`).toBe(true)
          expect(await count(png, arcs, (a) => a.r + EDGE, () => FAR, ART, 24), 'the picture outside its plate’s corners').toEqual([0, 0, 0, 0])
        }, 60_000)
      }

      // Classic: bilden ligger innanför ramlinjens inre kant, och linjens hörn är målade i linjens
      // färg och inte överskurna av bilden. Linjen ritas på en bana som är indragen med halva
      // linjebredden (`shapeSvg`, så att linjens yttre kant ligger på rutan), och den banan har
      // mallens radie; den inre kanten ligger alltså en halv linjebredd innanför banans bågar.
      it('keeps the classic picture inside the frame line, and leaves the line’s corners painted', async () => {
        const base = faceOf('classic')
        const line = shapeIn(base, 'frame')
        const s = line.strokeMm! * PX_PER_MM
        const { png, boxes } = await painted(base, ['frame'])
        const box = boxes['frame']!
        const arcs = arcsOf({ x: box.x + s / 2, y: box.y + s / 2, w: box.w - s, h: box.h - s }, line.radiusMm! * PX_PER_MM)
        expect(await count(png, arcs, (a) => a.r - s / 2 + EDGE, () => FAR, ART, 24), 'the picture past the inner edge of the frame line').toEqual([0, 0, 0, 0])
        const onLine = await count(png, arcs, (a) => a.r - s / 4, (a) => a.r + s / 4, hex(line.stroke!), 40)
        expect(onLine.every((n) => n > 50), `the line’s own colour on its corners: ${onLine}`).toBe(true)
      }, 60_000)
    })
  }

  // Det gamla spelet ritas inte bara innanför bågen utan som ett nytt (#1238): det som kommer ut
  // genom dörren är exakt vad ramen ger i dag.
  it('reads a game made before #1224 as the frame makes it today', () => {
    for (const frameId of PICTURED) expect(READS['a game made before #1224, read through the door'](frameId), frameId).toEqual(front(frameId))
  }, 60_000)
})
