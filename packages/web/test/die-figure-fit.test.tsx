// @vitest-environment jsdom
// The side that is up stays on the top face, for every kind of die and every side it has (#1170).
//
// A die's value is drawn on its top face (K28 variant A), and the top face is a different polygon
// for every kind: a d20's is a small triangle, a d10's a kite. «17» on a d20 painted out over the
// triangle's edges while a d10's «10» fitted, so the gate is a geometric one: every painted pixel
// of the figure lies inside the top face's own polygon, read off the SVG the felt draws, with the
// face's edge line kept clear. Nothing here is a pixel count, and the letters are the felt's own
// (K20), shipped with the app — so a Mac and CI's Linux draw the same figures
// (felt-measurements-must-not-pin-mac-pixels).
//
// The figures are read off a photograph of the page, drawn back on a canvas, so the answer is the
// ink the browser painted and not the size the component asked for.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { chromium, type Browser } from 'playwright'
import { DieFace } from '../src/table/Die.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const FACE = /url\('(\.\/[^']+\.woff2)'\)/g
const sheet = (rel: string): string =>
  read(rel).replace(FACE, (_all, file: string) => `url('data:font/woff2;base64,${readFileSync(join(import.meta.dirname, '..', dirname(rel), file)).toString('base64')}')`)
const SHEETS = ['src/fonts/felt-font.css', 'src/table/table.css']

const KINDS = [4, 6, 8, 10, 12, 20] as const
// Every side of every kind, which is also every figure a tumble can show on the way (D4).
const DICE = KINDS.flatMap((faces) => Array.from({ length: faces }, (_, i) => ({ faces, value: i + 1 })))

// Each die drawn large, so one painted pixel is a small share of a unit of the die's 100-unit
// square and the measurement is the shape's and not the rasteriser's.
const PX = 200
const COLUMNS = 10
// How far inside the top face the figure must stay, in the die's own units: the face's edge line
// is two units wide and half of it lies inside the face, so a figure touching it is already
// standing on the line. One more unit of air is what makes it read as written on the face.
const CLEAR = 2
// And the least a figure may be, as the height of its ink in the same units: a figure shrunk until
// it fits every face is a speck nobody reads across the table. Fifteen units is a little under
// what a d20's two-digit side is given inside its triangle with the air round it.
const LEAST_TALL = 15

function markupOf(faces: number, value: number): string {
  const { container, unmount } = render(<DieFace faces={faces} value={value} still />)
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

type Fit = { die: string; inked: number; outside: number; worst: number; tall: number }

async function measure(): Promise<Fit[]> {
  const rows = Math.ceil(DICE.length / COLUMNS)
  const page = await browser.newPage({ viewport: { width: PX * COLUMNS, height: PX * rows } })
  try {
    const cells = DICE.map(
      (d, i) =>
        `<div class="byd-die" data-cell="${i}" data-name="d${d.faces} ${d.value}" style="position:absolute;left:${(i % COLUMNS) * PX}px;top:${Math.floor(i / COLUMNS) * PX}px;width:${PX}px;height:${PX}px">${markupOf(d.faces, d.value)}</div>`,
    ).join('')
    // Only the figures are painted, black on white, so every dark pixel is a figure's ink; the
    // outlines are still laid out, and their points are read off the document below.
    const quiet = `body{margin:0;background:#fff}.byd-die{filter:none}.byd-die svg>:not(text){visibility:hidden}.byd-die text{fill:#000}`
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${SHEETS.map(sheet).join('\n')}${quiet}</style></head><body>${cells}</body></html>`, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
    const loaded = await page.evaluate(() => document.fonts.check('700 40px "Roboto Condensed"'))
    if (!loaded) throw new Error('the felt’s own font did not load, so this would measure a fallback')
    const shot = (await page.screenshot()).toString('base64')
    return await page.evaluate(
      async ([data, px, clear]) => {
        const shown = new Image()
        shown.src = `data:image/png;base64,${data}`
        await shown.decode()
        const canvas = Object.assign(document.createElement('canvas'), { width: shown.width, height: shown.height })
        const ink = canvas.getContext('2d')!
        ink.drawImage(shown, 0, 0)
        const unit = px / 100
        return [...document.querySelectorAll<HTMLElement>('[data-cell]')].map((cell) => {
          // The top face is the shape filled in the die's own colour that is drawn last.
          const top = [...cell.querySelectorAll('polygon, rect')].filter((s) => s.getAttribute('fill') === 'var(--byd-die)').at(-1)!
          const corners: [number, number][] =
            top.tagName === 'rect'
              ? (() => {
                  const [x, y, w, h] = ['x', 'y', 'width', 'height'].map((a) => Number(top.getAttribute(a)))
                  return [
                    [x!, y!],
                    [x! + w!, y!],
                    [x! + w!, y! + h!],
                    [x!, y! + h!],
                  ]
                })()
              : top
                  .getAttribute('points')!
                  .trim()
                  .split(/\s+/)
                  .map((p) => p.split(',').map(Number) as [number, number])
          // Signed distance inside a convex polygon: the least distance to any of its edges,
          // negative once a point is past one of them. Winding is taken from the polygon itself.
          const area = corners.reduce((s, [x, y], i) => {
            const [nx, ny] = corners[(i + 1) % corners.length]!
            return s + (x * ny - nx * y)
          }, 0)
          const turn = Math.sign(area)
          const inside = (x: number, y: number) =>
            Math.min(
              ...corners.map(([ax, ay], i) => {
                const [bx, by] = corners[(i + 1) % corners.length]!
                const len = Math.hypot(bx - ax, by - ay)
                return (turn * ((bx - ax) * (y - ay) - (by - ay) * (x - ax))) / len
              }),
            )
          const box = cell.getBoundingClientRect()
          const pixels = ink.getImageData(Math.round(box.left), Math.round(box.top), px, px)
          let inked = 0
          let outside = 0
          let worst = Infinity
          let [high, low] = [Infinity, -Infinity]
          for (let y = 0; y < px; y++) {
            for (let x = 0; x < px; x++) {
              // Half-dark and darker: the figure's own ink, not the faint fringe of its antialiasing.
              if (pixels.data[(y * px + x) * 4]! > 128) continue
              inked++
              high = Math.min(high, y)
              low = Math.max(low, y + 1)
              const d = inside((x + 0.5) / unit, (y + 0.5) / unit)
              worst = Math.min(worst, d)
              if (d < clear) outside++
            }
          }
          return { die: cell.dataset.name!, inked, outside, worst: Math.round(worst * 10) / 10, tall: Math.round(((low - high) / unit) * 10) / 10 }
        })
      },
      [shot, PX, CLEAR] as const,
    )
  } finally {
    await page.close()
  }
}

describe('a die’s figure stays on its top face (#1170)', () => {
  it('for every kind and every side, the widest two-digit sides included', async () => {
    const fits = await measure()
    // Every die was drawn and every figure painted, so the gate cannot pass by measuring nothing.
    expect(fits.map((f) => f.die)).toEqual(DICE.map((d) => `d${d.faces} ${d.value}`))
    expect(fits.filter((f) => f.inked < 20).map((f) => f.die)).toEqual([])
    expect(fits.filter((f) => f.tall < LEAST_TALL).map((f) => `${f.die}: ${f.tall} units tall`)).toEqual([])
    expect(fits.filter((f) => f.outside > 0).map((f) => `${f.die}: ${f.outside} px past the face, ${f.worst} units from its edge`)).toEqual([])
  }, 120_000)
})
