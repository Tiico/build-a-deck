import type { FaceTemplate } from '@byd/template'
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

export { textPxOnCard, cardPxForText, SCREENS, type Screen } from '../src/legibility.js'

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
