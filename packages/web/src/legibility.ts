import { CARD_STANDARD_63x88 } from '@byd/engine'
import { PT_TO_MM } from '@byd/template'
import { LIFT_GAP, LIFT_SHARE } from './table/lift-share.js'

// Måttstocken (K26, #506): vad läsbar korttext är på skärm, skrivet på ett ställe.
//
// Ett kort ritas i px och dess text är satt i pt, så textens storlek på skärmen är punktstorleken
// gånger hur brett kortet ritas i förhållande till sina millimetrar. Ingen yta väljer sin storlek på
// kortets ram; den läser här vad ramens text blir, och vilket golv skärmen den står på har.
//
// Modulen bor i produkten sedan editorn behöver den (#512); testernas `test/legibility.ts` läser
// härifrån, så att ytornas grindar och editorns ögon står på samma tal. Ett golv som flyttas flyttas
// här och i DESIGN-BESLUT K26, aldrig i ett enskilt test eller en enskild yta.

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

// Läsvyerna (#507–#509): där varje yta håller upp ett kort för att läsas, på den minsta skärm ytan
// svarar för, och i den bredd den gör det. Editorns ögon ritar kortväggen i de här bredderna (#512).
// Varje yta räknar sin bredd på sitt eget sätt, och varje ytas mätande test säger att den ritar
// talet som står här: `player-viewport` för telefonen, `lift.test` för bordet, `tv-show` för TV:n.
//
// Telefonens läsvy är `--byd-read-w` i `player.css` vid sin smalaste: `clamp(294px, 100vw − 26px,
// 336px)`, där 294 px är där 8,5 pt brödtext når 14 px.
const PHONE_READ_PX = 294
// TV:ns «Visa för alla» (#508) fyller filtens höjd utom en rad bildtext, och stannar vid 938 px:
// `.byd-tv-show` i `table.css` har 24 px luft runt om, en bildtext på 40 px med 16 px emellan.
const TV_SHOW = { airPx: 24, captionPx: 40, gapPx: 16, maxPx: 938 }
export const tvShowWidth = (feltHeightPx: number): number =>
  (Math.min(TV_SHOW.maxPx, feltHeightPx - 2 * TV_SHOW.airPx - TV_SHOW.captionPx - TV_SHOW.gapPx) * CARD_WIDTH_MM) / CARD_STANDARD_63x88.physical.heightMm

export type ReadingView = { key: 'phone' | 'desk' | 'tv'; screen: Screen; window: { w: number; h: number }; width: number }
// The phone's on its own too: it is the view that says no first, and the one the editor warns by (#523).
export const PHONE_READING: ReadingView = { key: 'phone', screen: 'phone', window: { w: 320, h: 568 }, width: PHONE_READ_PX }
export const READING_VIEWS: readonly ReadingView[] = [
  PHONE_READING,
  { key: 'desk', screen: 'desk', window: { w: 1024, h: 768 }, width: (Math.min(768 * LIFT_SHARE, 768 - 2 * LIFT_GAP) * CARD_WIDTH_MM) / CARD_STANDARD_63x88.physical.heightMm },
  { key: 'tv', screen: 'tv', window: { w: 1920, h: 1080 }, width: tvShowWidth(1080) },
]

// Under den här punktstorleken blir text mindre än skärmens golv för all text i läsvyn.
export const minPtIn = (view: ReadingView): number => (SCREENS[view.screen].floorPx * CARD_WIDTH_MM) / (PT_TO_MM * view.width)
// The card width at which `sizePt` becomes `textPx`, unrounded.
const cardPxForTextSize = (textPx: number, sizePt: number): number => (textPx * CARD_WIDTH_MM) / (PT_TO_MM * sizePt)

// How wide a card is held up so that its own smallest text reaches the floor (#523): the view's
// width for the wizard's frame, or wider for a card whose words are smaller than that frame's —
// set so, or shrunk by E6. `smallestPt` is what the renderer found (`/faces/:hash/fit`), null when
// it is not known. The caller caps it at the room the screen has.
export const readingWidth = (base: number, smallestPt: number | null | undefined, screen: Screen): number =>
  smallestPt ? Math.max(base, cardPxForTextSize(SCREENS[screen].floorPx, smallestPt)) : base
