import { describe, expect, it } from 'vitest'
import { TUCKBOX, type BoxFace } from '@byd/engine'
import { BOX_SCENE_CSS, BOX_STILL, FACE_NORMALS, GLOSS, REST, boxStill, lit, type FaceTemplate } from '../src/index.js'

// Länkbilden (#1417, L91): «Visa upp» fotograferad av renderaren, en gång per version. Sidan som
// renderaren tar är byggd här av samma geometri, samma ljus och samma regler som vyn, och varje yta
// är kompilatorns (E2). Att rätt yta hamnar på rätt sida visas i målade pixlar i `@byd/render`
// (`box-still.test.ts`); här står hur sidan är byggd.

const SIZE = { width: 65, height: 90, depth: 34.5 }
const CARD = { widthMm: 63, heightMm: 88, thicknessMm: 0.3 }
const FACES: readonly BoxFace[] = ['front', 'back', 'left', 'right', 'lid', 'bottom']
const painted = (fill: string): FaceTemplate => ({ base: [{ kind: 'shape', id: 'ground', x: 0, y: 0, w: 200, h: 200, shape: 'rect', fill }], variants: {} })
const input = (name = 'Skogens råd', deckMm = 32.4) => ({
  type: TUCKBOX,
  size: SIZE,
  card: CARD,
  deckMm,
  faces: Object.fromEntries(FACES.map((f, i) => [f, painted(`#00000${i}`)])) as Record<BoxFace, FaceTemplate>,
  cardFront: painted('#aa0000'),
  cardBack: painted('#00aa00'),
  row: {},
  name,
  icons: {},
})

describe('länkbilden är «Visa upp» som stillbild (#1417)', () => {
  it('är 1200 × 630, och sidans första [data-card] är bilden själv', () => {
    const page = boxStill(input())
    expect(BOX_STILL).toEqual({ width: 1200, height: 630 })
    const first = /<[^>]*data-card[^>]*>/.exec(page.html)?.[0] ?? ''
    expect(first).toContain('byd-box-still')
    expect(page.css).toContain('.byd-box-still{')
    expect(page.css).toContain('width:1200px;height:630px')
  })

  it('bär vyns egna regler för planen och ljuset', () => {
    const page = boxStill(input())
    expect(page.css).toContain(BOX_SCENE_CSS)
    for (const cls of ['byd-box-show-ground', 'byd-box-show-turn', 'byd-box-show-plane', 'byd-box-show-shade', 'byd-box-show-shine', 'byd-box-show-wear', 'byd-box-show-floor']) expect(page.html).toContain(cls)
  })

  it('står i vilovinkeln, med ljuset som vyn räknar det där', () => {
    const page = boxStill(input())
    expect(page.html).toContain(`transform:rotateX(${REST.rx}deg) rotateY(${REST.ry}deg)`)
    for (const f of FACES) {
      const { shadow } = lit(FACE_NORMALS[f], REST.rx, REST.ry, GLOSS[f])
      const plane = new RegExp(`data-show-face="${f}"[\\s\\S]*?byd-box-show-shade" style="opacity:([0-9.]+)`).exec(page.html)
      expect({ f, shadow: Number(plane?.[1]) }).toEqual({ f, shadow })
    }
  })

  it('ritar varje yta och lekens kort med kompilatorn, var och en i sitt eget scope', () => {
    const page = boxStill(input())
    for (const [i, f] of FACES.entries()) {
      expect(page.html).toContain(`id="byd-still-${f}"`)
      expect(page.css).toContain(`#byd-still-${f} [data-card]`)
      expect(page.html).toContain(`#00000${i}`)
    }
    expect(page.html).toContain('id="byd-still-card-face"')
    expect(page.html).toContain('#aa0000')
    expect(page.html).toContain('id="byd-still-card-back"')
  })

  it('står utan lek när leken inte har några kort', () => {
    const page = boxStill(input('Tom', 0))
    expect(page.html).not.toContain('data-deck=')
  })

  it('bär spelets namn som text och aldrig som markup', () => {
    const page = boxStill(input('Kort & <b>kul</b>'))
    expect(page.html).toContain('Kort &amp; &lt;b&gt;kul&lt;/b&gt;')
    expect(page.html).not.toContain('<b>kul</b>')
  })
})
