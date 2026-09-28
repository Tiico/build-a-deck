import { PHONE } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// One action reads a card (K26, #506 beslut 2; #507 beslut A). On the phone a tap on a card in the
// hand holds it up at once — no «Läs valt kort» to find first — and the rest of the hand is a step
// away from there instead of three presses a card. The size it is held up at is measured against
// the yardstick in `packages/web/test/player-viewport.test.tsx`; this is the built app, touched the
// way a thumb touches it, at the smallest phone the product answers for.
const SMALL = { ...PHONE, viewport: { width: 320, height: 568 } }

test('reads her own card with one tap, walks the hand from it, and the card read is the one chosen', async ({ tableOf, player, host }) => {
  const table = await tableOf({ players: 2, cards: 8 })
  const ada = await player(table, { name: 'Ada', seat: 'A', device: SMALL })
  const dealer = await host(table)
  await dealer.send([{ v: 'deal', from: 'draw', to: ['hand:A'], each: 3 }])
  const strip = ada.page.locator('.byd-strip[data-hand] [data-hand-card]')
  await expect(strip).toHaveCount(3)
  const ids = await strip.evaluateAll((els) => els.map((el) => el.getAttribute('data-hand-card')))

  await strip.first().tap()
  const held = ada.page.locator('.byd-inspect')
  await expect(held.locator('[data-inspect]')).toHaveAttribute('data-inspect', ids[0]!)
  // It stays up through the click the browser makes of the touch (UX-30).
  await ada.page.waitForTimeout(400)
  await expect(held).toBeVisible()
  // The whole of it is on the screen: the card, the hand's own second press, and the way on.
  const off = await ada.page.evaluate(() =>
    [...document.querySelectorAll('.byd-inspect [data-inspect], .byd-inspect button')]
      .map((el) => ({ el: el.getAttribute('aria-label') ?? el.textContent, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.top < 0 || r.left < 0 || r.bottom > innerHeight || r.right > innerWidth)
      .map(({ el }) => el),
  )
  expect(off).toEqual([])

  await held.getByRole('button', { name: 'Next card' }).tap()
  await expect(held.locator('[data-inspect]')).toHaveAttribute('data-inspect', ids[1]!)
  await held.locator('.byd-inspect-close').tap()
  await expect(held).toHaveCount(0)
  await expect(ada.page.locator(`[data-hand-card="${ids[1]}"]`)).toHaveAttribute('aria-pressed', 'true')
})
