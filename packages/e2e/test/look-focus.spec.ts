import type { Page } from '@playwright/test'
import { DESK, PHONE } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// «Titta» from the keyboard's panel holds one card up behind a veil, and the veil is the whole
// screen (#559 P-5, C4, K16): Tab stays in it, and Escape gives focus back to the card it was
// asked about. On the phone Tab used to walk out of it to BODY and the header behind the veil,
// where Escape no longer reached it; on the table Escape left focus on BODY.
const tabTo = async (page: Page, selector: string) => {
  for (let i = 0; i < 40; i++) {
    if (await page.evaluate((s) => document.activeElement?.matches(s) ?? false, selector)) return
    await page.keyboard.press('Tab')
  }
  throw new Error(`Tab never reached ${selector}`)
}
const focusedKey = (page: Page) => page.evaluate(() => {
  const el = document.activeElement
  return el?.getAttribute('data-hand-card') ?? el?.getAttribute('data-kbd') ?? el?.tagName ?? null
})

test('on the phone, Tab stays in the card held up and Escape gives focus back to the hand card', async ({ tableOf, player, host }) => {
  const table = await tableOf({ players: 2, cards: 8 })
  const ada = await player(table, { name: 'Ada', seat: 'A', device: PHONE })
  const dealer = await host(table)
  await dealer.send([{ v: 'deal', from: 'draw', to: ['hand:A'], each: 2 }])
  const page = ada.page
  await expect(page.locator('.byd-strip[data-hand] [data-hand-card]')).toHaveCount(2)
  await tabTo(page, '[data-hand-card]')
  const id = await focusedKey(page)
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: /^(Titta|Look)/ }).press('Enter')
  const look = page.locator('.byd-kbd-look')
  await expect(look).toBeVisible()
  await expect(look).toHaveAttribute('aria-modal', 'true')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await expect(look.getByRole('button', { name: /^(Stäng|Close)$/ })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(look).toHaveCount(0)
  await expect.poll(() => focusedKey(page)).toBe(id)
})

test('on the table, Escape from a card held up gives focus back to the card on the felt', async ({ tableOf, host, open }) => {
  const table = await tableOf({ players: 2, counters: [], cards: 4, copies: 1 })
  const dealer = await host(table)
  await dealer.send([{ v: 'draw', from: 'draw', to: 'table', count: 1 }])
  const { page } = await open(DESK, `${table.tableUrl}&lang=sv`)
  const card = page.locator('.byd-card[data-component][data-kbd]').first()
  await expect(card).toBeVisible()
  const key = await card.getAttribute('data-kbd')
  await tabTo(page, '.byd-card[data-kbd]')
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: /^(Titta|Look)/ }).press('Enter')
  await expect(page.getByRole('dialog').filter({ has: page.getByRole('button', { name: 'Stäng' }) })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect.poll(() => focusedKey(page)).toBe(key)
})

test('on the table, Escape from a face-up card held up gives focus back to the card on the felt', async ({ tableOf, host, open }) => {
  const table = await tableOf({ players: 2, counters: [], cards: 4, copies: 1 })
  const dealer = await host(table)
  await dealer.send([{ v: 'draw', from: 'draw', to: 'table', count: 1 }])
  const { page } = await open(DESK, `${table.tableUrl}&lang=sv`)
  const card = page.locator('.byd-card[data-component][data-kbd]').first()
  await expect(card).toBeVisible()
  await dealer.send([{ v: 'flip', component: (await card.getAttribute('data-component'))!, face: 'front' }])
  await expect(card).toHaveAttribute('data-face', 'front')
  const key = await card.getAttribute('data-kbd')
  await tabTo(page, '.byd-card[data-kbd]')
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: /^Titta/ }).press('Enter')
  await expect(page.locator('[data-lift], .byd-kbd-look')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-lift], .byd-kbd-look')).toHaveCount(0)
  await expect.poll(() => focusedKey(page)).toBe(key)
})
