import type { ProjectDoc } from '@byd/server'
import { deckFromProject } from '@byd/server'
import { setupFromProject } from '@byd/server/doc'
import type { Page } from '@playwright/test'
import { join, tableOf as tableFromSetup } from '../support/api.js'
import { DESK, PHONE, TV } from '../support/devices.js'
import { gameDoc } from '../support/game.js'
import { expect, test } from '../support/test.js'

// Focus goes to the first stop that is left and never to nothing (K16, #761). Four places on the
// play surfaces lost it: the phone after a card was played from the address panel, the address
// panel of an empty pile, the television's «Starta spelet» once it gave way to «Starta om», and
// «Ångra» switching itself off. Every step here is a real key press, because that is the path a
// person without a pointer takes and the only one on which a ring is drawn.
const active = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement
    if (!el || el === document.body) return 'BODY'
    return el.getAttribute('data-hand-card') !== null ? 'hand-card' : el.getAttribute('data-zone-draw') !== null ? 'draw-tile' : (el.getAttribute('aria-label') ?? el.textContent ?? el.tagName).trim()
  })

// The phone opens in the browser's language, and Playwright's is English; the words read here are
// the tool's Swedish ones.
const inSwedish = async (page: Page) => {
  await page.goto(`${page.url()}&lang=sv`)
  return page
}

const tabTo = async (page: Page, found: () => Promise<boolean>) => {
  for (let i = 0; i < 60 && !(await found()); i++) await page.keyboard.press('Tab')
  expect(await found()).toBe(true)
}

// The panel on a card in the hand offers the sheet's places after «Titta»; the first of them plays
// the card, and the panel closes.
const playFromPanel = async (page: Page) => {
  await tabTo(page, () => page.evaluate(() => document.activeElement?.hasAttribute('data-hand-card') ?? false))
  await page.keyboard.press('Enter')
  const panel = page.getByRole('dialog', { name: /^Handlingar för/ })
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Titta' })).toBeFocused()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  await expect(panel).toHaveCount(0)
}

test('/play: a card played from the address panel leaves focus on the next card in the hand', async ({ tableOf, player, host }) => {
  const table = await tableOf({ players: 2, cards: 8 })
  const ada = await player(table, { name: 'Ada', seat: 'A', device: PHONE })
  const dealer = await host(table)
  await dealer.send([{ v: 'deal', from: 'draw', to: ['hand:A'], each: 3 }])
  const page = await inSwedish(ada.page)
  const strip = page.locator('.byd-strip[data-hand] [data-hand-card]')
  await expect(strip).toHaveCount(3)
  await playFromPanel(page)
  await expect(strip).toHaveCount(2)
  await expect.poll(() => active(page)).toBe('hand-card')
  // The strip's one tab stop, so the next Tab goes on from the hand.
  await expect(page.locator('[data-hand-card]:focus')).toHaveAttribute('tabindex', '0')
})

test('/play: the last card played from the address panel leaves focus on the deck', async ({ tableOf, player, host }) => {
  const table = await tableOf({ players: 2, cards: 8 })
  const ada = await player(table, { name: 'Ada', seat: 'A', device: PHONE })
  const dealer = await host(table)
  await dealer.send([{ v: 'deal', from: 'draw', to: ['hand:A'], each: 1 }])
  const page = await inSwedish(ada.page)
  const strip = page.locator('.byd-strip[data-hand] [data-hand-card]')
  await expect(strip).toHaveCount(1)
  await playFromPanel(page)
  await expect(strip).toHaveCount(0)
  await expect.poll(() => active(page)).toBe('draw-tile')
})

test('/play: «Ångra» keeps the focus once there is nothing left to undo', async ({ tableOf, player, host }) => {
  const table = await tableOf({ players: 2, cards: 8 })
  const ada = await player(table, { name: 'Ada', seat: 'A', device: PHONE })
  const dealer = await host(table)
  await dealer.send([{ v: 'deal', from: 'draw', to: ['hand:A'], each: 3 }])
  const page = await inSwedish(ada.page)
  const strip = page.locator('.byd-strip[data-hand] [data-hand-card]')
  await expect(strip).toHaveCount(3)
  // One move of her own, so there is one thing to undo.
  const discard = page.getByRole('region', { name: /Spela valda kort|Play selected cards/ }).getByRole('button', { name: 'Kasta' })
  await tabTo(page, () => discard.evaluate((el) => el === document.activeElement))
  await page.keyboard.press('Enter')
  await expect(strip).toHaveCount(2)
  const undo = page.locator('.byd-undo')
  await expect(undo).not.toHaveAttribute('aria-disabled', 'true')
  await tabTo(page, () => undo.evaluate((el) => el === document.activeElement))
  await page.keyboard.press('Enter')
  await expect(strip).toHaveCount(3)
  await expect(undo).toHaveAttribute('aria-disabled', 'true')
  await expect(undo).toBeFocused()
  // And switched off it does nothing: a second Enter sends no undo.
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
  await expect(strip).toHaveCount(3)
})

for (const route of ['online', 'table'] as const) {
  test(`/${route}: the address panel of an empty pile takes the focus and offers nothing it cannot do`, async ({ tableOf, open, request }) => {
    const table = await tableOf({ players: 2, counters: [], cards: 6 })
    const url = route === 'online' ? (await join(request, table, { name: 'Ada', seat: 'A' })).onlineUrl : table.tableUrl
    const { page } = await open(DESK, `${url}&lang=sv`)
    const pile = page.locator('[data-kbd="pile:discard"]')
    await expect(pile).toHaveAttribute('aria-label', /, tom/)
    await pile.focus()
    await page.keyboard.press('Enter')
    const panel = page.getByRole('dialog', { name: /^Handlingar för Kasthög/ })
    await expect(panel).toBeVisible()
    await expect.poll(() => panel.evaluate((el) => el.contains(document.activeElement) && !(document.activeElement as HTMLButtonElement).disabled)).toBe(true)
    // Nothing moves out of a pile that holds nothing, and no verb is shown that cannot be done.
    await expect(panel.getByText('Flytta hela högen till')).toHaveCount(0)
    await expect(panel.locator('button:disabled')).toHaveCount(0)
    // Escape hands the focus back to the pile.
    await page.keyboard.press('Escape')
    await expect(pile).toBeFocused()
  })
}

function gameWithAStart(): ProjectDoc {
  const doc = gameDoc({ players: 2, counters: [], cards: 8 })
  return {
    ...doc,
    setup: {
      ...doc.setup,
      zones: doc.setup.zones.map((z) =>
        z.id === doc.setup.deckZone
          ? { ...z, actions: [{ id: 'start', label: 'Blanda leken', when: 'both' as const, steps: [{ v: 'shuffle' as const }] }] }
          : z,
      ),
    },
  }
}

test('TV: focus stays with «Starta om» once «Starta spelet» has started the game', async ({ request, open, player }) => {
  const doc = gameWithAStart()
  const table = await tableFromSetup(request, setupFromProject(doc), deckFromProject(doc))
  await player(table, { name: 'Ada', seat: 'A' })
  const page = (await open(TV, `${table.tvUrl}&lang=sv`, { facesReady: true })).page
  const start = page.locator('.byd-table-start')
  await expect(start).toBeEnabled()
  await tabTo(page, () => start.evaluate((el) => el === document.activeElement))
  await page.keyboard.press('Enter')
  const again = page.locator('.byd-table-restart')
  await expect(again).toBeVisible()
  await expect(again).toBeFocused()
})
