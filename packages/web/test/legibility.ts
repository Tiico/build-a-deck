import { CARD_STANDARD_63x88 } from '@byd/engine'
import { PT_TO_MM, type FaceTemplate } from '@byd/template'
import { DEFAULT_FRAME, defaultFields } from '../src/wizard/frames.js'
import { translate } from '../src/i18n/index.js'

// Måttstocken (K26, #506): vad läsbar korttext är på skärm, skrivet på ett ställe.
//
// Ett kort ritas i px och dess text är satt i pt, så textens storlek på skärmen är punktstorleken
// gånger hur brett kortet ritas i förhållande till sina millimetrar. Ingen yta väljer sin storlek på
// kortets ram; den läser här vad ramens text blir, och vilket golv skärmen den står på har.
//
// Sidorna 1–6 i #505 mäter mot de här talen och inga egna. Ett golv som flyttas flyttas här och i
// DESIGN-BESLUT K26, aldrig i ett enskilt test.

const CARD_WIDTH_MM = CARD_STANDARD_63x88.physical.widthMm

// Textens höjd i CSS-px när ett kort `cardMm` brett ritas `cardPx` brett: 8,5 pt brödtext blir
// 0,048 × kortbredden och 12 pt titel 0,067 × kortbredden på ett 63 mm-kort.
export const textPxOnCard = (sizePt: number, cardPx: number, cardMm: number = CARD_WIDTH_MM): number => (sizePt * PT_TO_MM * cardPx) / cardMm

// Omvänt: hur brett kortet måste ritas för att `sizePt` ska bli `textPx`, till närmaste hela px.
// Närmaste och inte uppåt, eftersom beslutet skriver 252 px för 12 px och det kortet ger 11,998.
export const cardPxForText = (sizePt: number, textPx: number, cardMm: number = CARD_WIDTH_MM): number => Math.round((textPx * cardMm) / (sizePt * PT_TO_MM))

// Golvet per skärm (beställarens beslut 2026-09-28, #506), i CSS-px. `floorPx` gäller all text som
// ritas för att läsas; `bodyPx` är brödtext man faktiskt ska läsa, alltså det ett kort i läsläge
// når. TV:n räknas vid 1920 × 1080 CSS-px, vilket också är en 4K-TV vid DPR 2.
export const SCREENS = {
  phone: { floorPx: 12, bodyPx: { min: 14, max: 16 } },
  desk: { floorPx: 12, bodyPx: { min: 14, max: 16 } },
  tv: { floorPx: 24, bodyPx: { min: 28, max: 32 } },
} as const

export type Screen = keyof typeof SCREENS

// K9:s golv för ett kort som kontroll på filten, i px på kortsidan: det dras, trycks och pekas på.
// Det är ett mått på ramen och inte på texten, och står här för att det är talet sidorna 1–6 ställer
// textgolven mot — ett kort i 45 px bär 2,1 px brödtext och läses därför bara genom läsgesten.
export const CARD_CONTROL_PX = 45

// Brödtextens punktstorlek i en mall, läst ur elementet och inte antagen. Golvet gäller mallens
// brödtext som den är (K26), så en yta räknar med det här och inte med ett eget 8,5.
export const bodyPtOf = (face: FaceTemplate): number => {
  const body = face.base.find((element) => element.kind === 'text' && element.id === 'body')
  if (body?.kind !== 'text') throw new Error('the face has no body text')
  return body.font.sizePt
}

// Wizardens förvalda ram (L6), som varje nytt spel börjar i: brödtexten ytorna mäts mot när
// ingen annan mall är given.
export const DEFAULT_BODY_PT = bodyPtOf(DEFAULT_FRAME.front(defaultFields((key, params) => translate('sv', key, params))))
