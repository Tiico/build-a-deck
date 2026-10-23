import { PHONE } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// A card read large from the hand (K26, #506 beslut 2; #507; #1147). A tap marks the card, and
// «Läs stort» in the bar over the tabs holds it up — and the rest of the hand is a step away from
// there. The size it is held up at is measured against the yardstick in
// `packages/web/test/player-viewport.test.tsx`; this is the built app, touched the way a thumb
// touches it, at the smallest phone the product answers for.
const SMALL = { ...PHONE, viewport: { width: 320, height: 568 } }

test('reads her own card from the bar, walks the hand from it, and the marked card stays marked', async ({ tableOf, player, host }) => {
  const table = await tableOf({ players: 2, cards: 8 })
  const ada = await player(table, { name: 'Ada', seat: 'A', device: SMALL })
  const dealer = await host(table)
  await dealer.send([{ v: 'deal', from: 'draw', to: ['hand:A'], each: 3 }])
  const grid = ada.page.locator('[data-hand] [data-hand-card]')
  await expect(grid).toHaveCount(3)
  const ids = await grid.evaluateAll((els) => els.map((el) => el.getAttribute('data-hand-card')))

  await grid.first().tap()
  await ada.page.getByRole('button', { name: 'Read large' }).tap()
  const held = ada.page.locator('.byd-inspect')
  await expect(held.locator('[data-inspect]')).toHaveAttribute('data-inspect', ids[0]!)
  // It stays up through the click the browser makes of the touch (UX-30).
  await ada.page.waitForTimeout(400)
  await expect(held).toBeVisible()
  // The whole of it is on the screen: the card, the hand's own way to play it, and the way on.
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
  // Reading is looking: the card marked is still the one that was, and none other.
  await expect(ada.page.locator(`[data-hand-card="${ids[0]}"]`)).toHaveAttribute('aria-pressed', 'true')
  await expect(ada.page.locator('[data-hand-card][aria-pressed="true"]')).toHaveCount(1)
})
