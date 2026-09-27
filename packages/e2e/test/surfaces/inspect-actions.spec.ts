import { expect, test } from '@playwright/test'
import { standing } from '../../support/surface.js'

// The verbs under a card held up from in front of the seat (#483, fynd 11). The held card is a
// `div` inside `.byd-inspect`, and the rule that paints it — a card's paper, its size and its shadow —
// was written for every `div` there, so the row of verbs beside it was painted as a second, pink
// card. The rule belongs to the card and to nothing else in the view.
const HELD = `
<div class="byd-inspect" role="dialog" aria-label="Björnen">
  <div data-inspect="c1" data-face="front" style="--hue: 12"><span>Björnen</span></div>
  <div class="byd-mine-actions" data-mine-actions>
    <button type="button" data-act="flip">Vänd ner</button>
    <button type="button" data-act="take">Ta upp</button>
    <button type="button" data-act="play">Spela…</button>
  </div>
  <button class="byd-inspect-close" type="button">Stäng</button>
</div>`

test.use({ viewport: { width: 390, height: 844 } })

test('paints the held card as a card and the verbs beside it as nothing but their buttons', async ({ page }) => {
  await standing(page, HELD, { at: '/play' })
  const look = (selector: string) =>
    page.locator(selector).evaluate((el) => {
      const how = getComputedStyle(el)
      return { background: how.backgroundColor, shadow: how.boxShadow !== 'none', width: Math.round(el.getBoundingClientRect().width) }
    })
  // Not vacuous: the card itself is painted as a card.
  expect((await look('[data-inspect]')).shadow).toBe(true)
  expect(await look('[data-mine-actions]')).toMatchObject({ background: 'rgba(0, 0, 0, 0)', shadow: false })
})
