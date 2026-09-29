import { TV } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// A card held up for the room covers the felt, the keyboard's focused card too (#560 P-23). The
// focus ring brings a felt card forward so the ring is seen whole, and it came forward over the
// shown card as well, covering part of its text. Only real key presses draw a ring, so the card is
// reached and shown the way the audit did: Tab onto the felt, Enter, «Titta».
test('the shown card lies over the card the keyboard is standing on', async ({ tableOf, host, open }) => {
  const table = await tableOf({ players: 2, counters: [], cards: 4, copies: 1 })
  const dealer = await host(table)
  await dealer.send([{ v: 'draw', from: 'draw', to: 'table', count: 1 }])
  const tv = await open(TV, `${table.tvUrl}&lang=sv`)
  const page = tv.page
  const card = page.locator('.byd-card[data-component][data-kbd]').first()
  await expect(card).toBeVisible()
  // Face up, so «Titta» holds it up for the room rather than a stand-in for a back.
  const id = (await card.getAttribute('data-component'))!
  await dealer.send([{ v: 'flip', component: id, face: 'front' }])
  await expect(card).toHaveAttribute('data-face', 'front')
  for (let i = 0; i < 20 && !(await card.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab')
  await expect(card).toBeFocused()
  await expect(card).toHaveCSS('z-index', '70')

  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Titta' }).press('Enter')
  const shown = page.locator('.byd-tv-show')
  await expect(shown).toBeVisible()
  await expect(card).toBeFocused()

  const box = (await card.boundingBox())!
  const top = await page.evaluate(([x, y]) => {
    const el = document.elementFromPoint(x!, y!)
    return el?.closest('.byd-tv-show') ? 'show' : el?.closest('[data-kbd]') ? 'felt' : el?.className ?? null
  }, [box.x + box.width / 2, box.y + box.height / 2])
  expect(top).toBe('show')
})
