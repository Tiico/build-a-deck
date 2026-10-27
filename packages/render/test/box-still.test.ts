import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TUCKBOX, type BoxFace } from '@byd/engine'
import { BOX_STILL, boxStill, type FaceTemplate } from '@byd/template'
import { Renderer } from '../src/renderer.js'
import { decodePng } from './fixture.js'

// Länkbilden (#1417, L91) i målade pixlar: sidan `boxStill` bygger, fotograferad av den enda
// renderaren (E2) som rastret på 1200 × 630 som servern köar. Varje yta har en egen ren färg i sin
// mall, så färgen i bilden säger vilken mall som står var: framsidan, högra sidan och locket syns i
// vilovinkeln, med högra sidan till höger om framsidan och locket över den, och baksidan, vänstra
// sidan och botten syns inte alls. Lekens kort är vita och räknas inte.

let renderer: Renderer
beforeAll(async () => {
  renderer = await Renderer.launch()
}, 60_000)
afterAll(async () => {
  await renderer.close()
}, 60_000)

const COLOURS: Record<BoxFace, string> = { front: '#ff0000', right: '#0000ff', lid: '#00ff00', back: '#ffff00', left: '#ff00ff', bottom: '#00ffff' }
const painted = (fill: string): FaceTemplate => ({ base: [{ kind: 'shape', id: 'ground', x: -5, y: -5, w: 300, h: 300, shape: 'rect', fill }], variants: {} })

// Which face a pixel was painted by, read off its hue: light and shadow make it brighter or darker,
// but a red face stays red. A pixel that is no face's hue — the ground, the cards, the name — is none.
function faceOf(r: number, g: number, b: number): BoxFace | null {
  const hi = Math.max(r, g, b)
  if (hi < 40) return null
  const on = (c: number) => c > hi * 0.75
  const off = (c: number) => c < hi * 0.35
  const key = `${on(r) ? 'R' : off(r) ? '' : '?'}${on(g) ? 'G' : off(g) ? '' : '?'}${on(b) ? 'B' : off(b) ? '' : '?'}`
  return ({ R: 'front', B: 'right', G: 'lid', RG: 'back', RB: 'left', GB: 'bottom' } as Record<string, BoxFace>)[key] ?? null
}

describe('länkbilden i målade pixlar (#1417)', () => {
  it('visar framsidan, högra sidan och locket på sina platser, och inga andra sidor', async () => {
    const page = boxStill({
      type: TUCKBOX,
      size: { width: 65, height: 90, depth: 34.5 },
      card: { widthMm: 63, heightMm: 88, thicknessMm: 0.3 },
      deckMm: 32.4,
      faces: Object.fromEntries(Object.entries(COLOURS).map(([f, c]) => [f, painted(c)])) as Record<BoxFace, FaceTemplate>,
      cardFront: painted('#ffffff'),
      cardBack: painted('#ffffff'),
      row: {},
      name: 'Skogens råd',
      icons: {},
    })
    const pic = decodePng(await renderer.renderRaster(page, { format: 'png', widthPx: BOX_STILL.width, heightPx: BOX_STILL.height }))
    expect({ width: pic.width, height: pic.height }).toEqual({ width: 1200, height: 630 })
    const seen = new Map<BoxFace, { n: number; x: number; y: number }>()
    for (let y = 0; y < pic.height; y++) {
      for (let x = 0; x < pic.width; x++) {
        const { r, g, b } = pic.at(x, y)
        const face = faceOf(r, g, b)
        if (!face) continue
        const s = seen.get(face) ?? { n: 0, x: 0, y: 0 }
        seen.set(face, { n: s.n + 1, x: s.x + x, y: s.y + y })
      }
    }
    const share = (f: BoxFace) => (seen.get(f)?.n ?? 0) / (pic.width * pic.height)
    const middle = (f: BoxFace) => {
      const s = seen.get(f)!
      return { x: s.x / s.n, y: s.y / s.n }
    }
    // The front is the largest face in view, the right side narrower beside it, and the lid a thin
    // band over it, since the rest angle looks down on it by twelve degrees.
    expect(share('front')).toBeGreaterThan(0.04)
    expect(share('right')).toBeGreaterThan(0.01)
    expect(share('lid')).toBeGreaterThan(0.002)
    expect(share('front')).toBeGreaterThan(share('right'))
    for (const hidden of ['back', 'left', 'bottom'] as const) expect({ hidden, share: share(hidden) }).toEqual({ hidden, share: 0 })
    expect(middle('right').x).toBeGreaterThan(middle('front').x)
    expect(middle('lid').y).toBeLessThan(middle('front').y)
    // The box stands in the left half, and the name has the right half to itself.
    for (const f of ['front', 'right', 'lid'] as const) expect({ f, left: middle(f).x < 660 }).toEqual({ f, left: true })
  }, 60_000)
})
