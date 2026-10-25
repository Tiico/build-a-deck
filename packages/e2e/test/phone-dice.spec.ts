import { withQuery } from '../support/api.js'
import { PHONE, TV } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// Two dice thrown from the phone (K28, #1138, variant B). The setup lays 2d6 on the table every
// seat shares; the pill among the counters opens the sheet, a tap chooses each die, and «Slå»
// sends both as one envelope (K3). What they came to stands in the sheet with the sum, is said in the
// phone's log, and on the television in the room, and the numbers are the same everywhere because
// the server decided them once (D4). At 375 px, by touch, the way a phone is held.
test('throws 2d6 from the phone in one envelope, and the sheet, the log and the TV say the same throw', async ({ tableOf, player, open }) => {
  const table = await tableOf({ players: 2, dice: [{ faces: 6, count: 2, zone: 'table' }] })
  const ada = await player(table, { name: 'Ada', seat: table.seats[0]!, device: { ...PHONE, viewport: { width: 375, height: 667 } } })
  const tv = await open(TV, withQuery(table.tvUrl, 'lang=sv'), { facesReady: true })
  const page = ada.page

  // Among the counters, on «In front of me» (#1147).
  await page.getByRole('tab', { name: /^In front of me/ }).tap()
  const pill = page.getByRole('button', { name: 'Dice · 2' })
  await expect(pill).toBeVisible()
  expect((await pill.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await pill.tap()
  const sheet = page.getByRole('dialog', { name: 'Dice' })
  await expect(sheet).toBeVisible()
  const tiles = sheet.getByRole('button', { name: /^d6, showing \d$/ })
  await expect(tiles).toHaveCount(2)
  await expect(sheet.getByRole('button', { name: 'Choose dice to roll' })).toBeDisabled()

  // Every target a thumb is offered is a thumb wide, and the sheet stays inside the screen.
  const sizes = await sheet.locator('button').evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return { w: r.width, h: r.height, right: r.right } }))
  for (const s of sizes) expect(Math.min(s.w, s.h)).toBeGreaterThanOrEqual(44)
  expect(Math.max(...sizes.map((s) => s.right))).toBeLessThanOrEqual(375)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)

  await tiles.nth(0).tap()
  await tiles.nth(1).tap()
  await expect(tiles.nth(0)).toHaveAttribute('aria-pressed', 'true')
  await expect(tiles.nth(1)).toHaveAttribute('aria-pressed', 'true')
  await sheet.getByRole('button', { name: 'Roll 2 dice' }).tap()

  const said = sheet.getByText(/^You rolled /)
  await expect(said).toHaveText(/^You rolled 2d6: [1-6] \+ [1-6] = \d+$/)
  const [, a, b, sum] = /: (\d) \+ (\d) = (\d+)$/.exec((await said.textContent()) ?? '')!.map(Number)
  expect(sum).toBe(a! + b!)
  await expect(tiles.nth(0)).toHaveAccessibleName(`d6, showing ${a}`)
  await expect(tiles.nth(1)).toHaveAccessibleName(`d6, showing ${b}`)

  // One envelope, with a roll for each die.
  const envelopes = ada.wire
    .sent()
    .map((f) => JSON.parse(f) as { t: string; envelope?: { intents: { v: string }[] } })
    .filter((m) => m.t === 'envelope' && m.envelope!.intents.some((i) => i.v === 'roll'))
  expect(envelopes.map((m) => m.envelope!.intents.map((i) => i.v))).toEqual([['roll', 'roll']])

  // The phone's log and the room's television say the one throw in the one sentence.
  await expect(page.locator('[data-panel="table"] li').first()).toHaveText(`You rolled 2d6: ${a} + ${b} = ${sum}`)
  await expect(tv.page.getByText(`Ada slog 2d6: ${a} + ${b} = ${sum}`)).toBeVisible()

  await sheet.getByRole('button', { name: 'Close' }).tap()
  await expect(sheet).toBeHidden()
  await expect(pill).toBeFocused()
})
