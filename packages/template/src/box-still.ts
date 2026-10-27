import { CARD_STANDARD_63x88, boxFaceType, type BoxCard, type BoxFace, type BoxMeasure, type BoxTypeDef, type ComponentTypeDef } from '@byd/engine'
import { compile } from './compile.js'
import type { FaceTemplate, Row } from './model.js'
import type { Motif } from './motif.js'
import { BOX_SCENE_CSS, DECK_GLOSS, GLOSS, REST, lit, poseTransform, showScene, type DeckPart, type Plane, type Pose } from './box-scene.js'

// Länkbilden (#1417, L91): «Visa upp» som stillbild, den sida renderaren fotograferar en gång per
// version. Samma tolv plan som vyn, ur samma geometri (`showScene`), i vilovinkeln (`REST`) och med
// ljuset som vyn räknar det där (`lit`), under vyns egna regler (`BOX_SCENE_CSS`). Varje yta och
// lekens första kort kompileras av den enda kompilatorn (E2), var och en i sitt eget scope; sidan
// ritar ingen yta själv. Bredvid lådan står spelets namn, som i prototypens länkbild (#1406 runda 1).
//
// Sidan är en `[data-card]` på 1200 × 630 CSS-pixlar, så att renderarens raster tar den i exakt de
// pixlarna utan att förstora något: en förstorad plan i 3D vore suddig (#1406, «Hybriden»). Ytorna
// läggs i stället ut i den skala bilden behöver, med `zoom`, som `CardPreview` gör i vyn.

export const BOX_STILL = { width: 1200, height: 630 } as const

export type BoxStillInput = {
  type: BoxTypeDef
  size: BoxMeasure
  card: BoxCard
  deckMm: number
  // Every face of the box as it is drawn: the designer's, or the neutral one (`boxFaceOf`).
  faces: Record<BoxFace, FaceTemplate>
  // The deck's first card, front and back, as the wall draws it.
  cardFront?: FaceTemplate | undefined
  cardBack?: FaceTemplate | undefined
  cardType?: ComponentTypeDef | undefined
  row: Row
  name: string
  icons: Record<string, string>
  palette?: Record<string, string> | undefined
  fonts?: Record<string, { stack: string; src?: string }> | undefined
  motifs?: Record<string, Motif> | undefined
}

const PX_PER_MM = 96 / 25.4
// The half the picture stands in, and how much of it the box and the deck may take, as the view
// leaves air round them (`ROOM_SHARE` in «Visa upp»).
const SCENE = { x: 0, width: 660, share: 0.86 }
const NAME = { x: 680, width: 470 }
const BOX_ORDER: readonly BoxFace[] = ['front', 'back', 'left', 'right', 'lid', 'bottom']
const DECK_ORDER: readonly DeckPart[] = ['face', 'back', 'right', 'left', 'top']

const STILL_CSS = [
  `.byd-box-still{position:relative;width:${BOX_STILL.width}px;height:${BOX_STILL.height}px;overflow:hidden;background:#17191f}`,
  `.byd-box-still-name{position:absolute;left:${NAME.x}px;width:${NAME.width}px;top:50%;transform:translateY(-50%);margin:0;color:#f3e7c9;font-family:Georgia,'DejaVu Serif',serif;font-weight:700;line-height:1.1;overflow-wrap:break-word;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;overflow:hidden}`,
].join('')

export function boxStill(input: BoxStillInput): { html: string; css: string } {
  // The scene in CSS pixels first, to learn how much it must be made smaller or larger to fit, and
  // then laid out again at that measure, so nothing is ever scaled after it is drawn.
  const plain = showScene(input.size, input.card, input.deckMm, PX_PER_MM)
  const k = Math.min((SCENE.width * SCENE.share) / plain.width, (BOX_STILL.height * SCENE.share) / plain.height)
  const zoom = Math.round(k * 10000) / 10000
  const scene = showScene(input.size, input.card, input.deckMm, PX_PER_MM * zoom)
  const css: string[] = [BOX_SCENE_CSS, STILL_CSS]
  const drawn = (id: string, type: ComponentTypeDef, face: FaceTemplate, row: Row): string => {
    const out = compile({
      type,
      face,
      row,
      icons: input.icons,
      scope: `#${id}`,
      ...(input.palette ? { palette: input.palette } : {}),
      ...(input.fonts ? { fonts: input.fonts } : {}),
      ...(input.motifs ? { motifs: input.motifs } : {}),
    })
    css.push(out.css)
    return `<div id="${id}" style="zoom:${zoom};position:relative">${out.html}</div>`
  }
  const lighting = (plane: Plane, gloss: number): string => {
    const { shadow, shine, shift } = lit(plane.normal, REST.rx, REST.ry, gloss)
    return (
      `<span class="byd-box-show-lit"><i class="byd-box-show-shade" style="opacity:${shadow}"></i>` +
      (gloss > 0 ? `<i class="byd-box-show-shine" style="opacity:${shine};transform:translateX(${shift}%)"></i>` : '') +
      `<i class="byd-box-show-wear"></i></span>`
    )
  }
  const placed = (plane: { width: number; height: number }, p: Pose): string =>
    `width:${round(plane.width)}px;height:${round(plane.height)}px;left:${round(-plane.width / 2)}px;top:${round(-plane.height / 2)}px;transform:${poseTransform(p)}`

  const planes: string[] = [`<div class="byd-box-show-floor" style="${placed(scene.floor, scene.floor.pose)}"></div>`]
  for (const f of BOX_ORDER) {
    const plane = scene.box[f]
    planes.push(`<div class="byd-box-show-plane" data-show-face="${f}" style="${placed(plane, plane.pose)}">${drawn(`byd-still-${f}`, boxFaceType(input.type, f, input.size), input.faces[f], {})}${lighting(plane, GLOSS[f])}</div>`)
  }
  if (scene.deck) {
    const edge = Math.max(1.6, input.card.thicknessMm * PX_PER_MM * zoom)
    const cardType = input.cardType ?? CARD_STANDARD_63x88
    for (const part of DECK_ORDER) {
      const plane = scene.deck[part]
      const face = part === 'face' ? input.cardFront : part === 'back' ? input.cardBack : undefined
      const inner = face ? drawn(`byd-still-card-${part}`, cardType, face, input.row) : ''
      planes.push(`<div class="byd-box-show-plane" data-deck="${part}" style="${placed(plane, plane.pose)};--byd-edge:${round(edge)}px">${inner}${lighting(plane, DECK_GLOSS[part])}</div>`)
    }
  }
  const size = input.name.length <= 14 ? 64 : input.name.length <= 28 ? 52 : 42
  const html =
    `<div data-card class="byd-box-still">` +
    `<div class="byd-box-show-ground"></div>` +
    `<div class="byd-box-show-middle" style="left:${SCENE.x + SCENE.width / 2}px;top:${BOX_STILL.height / 2}px">` +
    `<div class="byd-box-show-fit"><div class="byd-box-show-turn" style="transform:rotateX(${REST.rx}deg) rotateY(${REST.ry}deg)">${planes.join('')}</div></div>` +
    `</div>` +
    `<p class="byd-box-still-name" style="font-size:${size}px">${escape(input.name)}</p>` +
    `</div>`
  return { html, css: css.join('\n') }
}

const round = (n: number) => Math.round(n * 100) / 100
const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const escape = (text: string): string => text.replace(/[&<>"']/g, (c) => ENTITIES[c] ?? c)
