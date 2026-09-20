import { CARD_STANDARD_63x88, type ComponentTypeDef } from '@byd/engine'

// The card's two physical facts as the editor's pixels, in one place: how wide the card is when
// it is drawn at full size, and how far in its corners are cut. Both are read off the component
// type and neither is written down — 63 mm is the card's fact, not this file's.

// The card at full size, in CSS pixels, so a width in pixels can be asked of `CardPreview` as
// the zoom it actually takes.
export const CARD_PX = (CARD_STANDARD_63x88.physical.widthMm / 25.4) * 96

// The card's corner, converted the way the press converts it (#332, L28).
//
// A corner is a physical length: the card is cut at so many millimetres, and that cut is the same
// cut whether the card is held in a hand, printed, or drawn 90 px wide on the wall. The wall used
// to write `border-radius: 8px` instead, which is not a radius but a number — at the standard
// card's 63 mm drawn 150 px it happens to land on 3.4 mm, close enough to the 3 mm the standard
// card is cut at that nobody looked again. Every other card it is simply wrong about: a deck cut
// square is drawn with rounded corners and printed with sharp ones, and a 6 mm corner is drawn at
// 8 px where 14.3 px is what the press will give.
//
// So the millimetres are read off the component type — the same object `CardPreview` compiles
// every card against, where `physical.cornerRadiusMm` is the card's own fact — and the pixels
// come from the width the card is actually drawn at, which the density says (#128).
export function cornerPx(widthPx: number, type: ComponentTypeDef = CARD_STANDARD_63x88): number {
  const mm = type.physical.cornerRadiusMm ?? 0
  if (mm <= 0) return 0
  // Hundredths of a pixel: enough that the ladder's six widths each get their own corner, and
  // few enough that the number in the stylesheet can be read.
  return Math.round(((widthPx * mm) / type.physical.widthMm) * 100) / 100
}
