// Keeping the marked card where the player can see it (#415, decision B of 2026-09-22).
//
// This is an exported function and not a React effect, and deliberately: the strip is measured by
// putting its markup on a real page, where no effect ever runs. A rule that lived in an effect
// could not be measured at all — which is exactly how a scrolling bug survives a green suite.

/**
 * Scrolls `strip` by the least it takes for `card` to lie wholly inside the visible width, and
 * answers where it left it. A card already in view is not moved: the hand must not slide under a
 * finger that is choosing among the cards it can already see, which is the whole reason the hand
 * grows towards the reading direction rather than against it.
 *
 * Measured against the padding box — `clientLeft` and `clientWidth` — because that is the width
 * the player actually sees, and the width the issue measured.
 */
export function keepInView(strip: HTMLElement, card: HTMLElement): number {
  const box = strip.getBoundingClientRect()
  const left = box.left + strip.clientLeft
  const right = left + strip.clientWidth
  const c = card.getBoundingClientRect()
  if (c.left < left) strip.scrollLeft -= left - c.left
  else if (c.right > right) strip.scrollLeft += c.right - right
  return strip.scrollLeft
}
