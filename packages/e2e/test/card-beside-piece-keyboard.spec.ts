import type { APIRequestContext, Page } from '@playwright/test'
import { join } from '../support/api.js'
import { DESK } from '../support/devices.js'
import { expect, test, type Fixtures } from '../support/test.js'

// A card sent with the keyboard to an area that already holds a die (#1202). The area's answer for
// the next card counted the die as a card: the card went one place further along the fan, and
// since the die lies in the middle of the first card's place (#1169) that place read as taken
// too, so the card landed two steps in, in an area with no card in it. A die is not a card and
// takes no place in the fan. (A chip alone does not do here: an area that holds nothing but chips
// is not offered to a card at all, C4.) Every press is a real one, since element.focus() draws no
// ring and skips the path a person without a mouse takes.

type Box = { x: number; y: number; width: number; height: number }

const focused = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.kbd ?? null)

// Tab until the felt holds the focus, then the arrows until a stop with that prefix has it.
async function arrowTo(page: Page, prefix: string): Promise<string> {
  for (let i = 0; i < 40 && (await focused(page)) === null; i++) await page.keyboard.press('Tab')
  for (let i = 0; i < 40 && !(await focused(page))?.startsWith(prefix); i++) await page.keyboard.press('ArrowRight')
  for (let i = 0; i < 40 && !(await focused(page))?.startsWith(prefix); i++) await page.keyboard.press('ArrowLeft')
  const key = await focused(page)
  expect(key).toMatch(new RegExp(`^${prefix}`))
  return key!
}

// The stop's panel — Enter on a card, M on a die, where Enter rolls — then «Flytta till» the area
// in front of seat A, Enter.
async function sendToMine(page: Page, open = 'Enter'): Promise<void> {
  await page.keyboard.press(open)
  const panel = page.getByRole('dialog')
  await expect(panel).toBeVisible()
  const place = panel.getByRole('group', { name: 'Flytta till' }).getByRole('button', { name: /^Framför A/ })
  for (let i = 0; i < 40 && !(await place.evaluate((b) => b === document.activeElement)); i++) await page.keyboard.press('Tab')
  await expect(place).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(panel).toBeHidden()
}

// Where a box lies in the area, along its long axis and across its short one, as shares of the
// area — so no pixel of any one machine is pinned.
function within(box: Box, area: Box): { along: number; across: number } {
  const wide = area.width >= area.height
  return wide
    ? { along: (box.x - area.x) / area.width, across: (box.y + box.height / 2 - area.y) / area.height }
    : { along: (box.y - area.y) / area.height, across: (box.x + box.width / 2 - area.x) / area.width }
}

type Given = Pick<Fixtures, 'tableOf' | 'host' | 'open'> & { request: APIRequestContext }

async function opened({ tableOf, host, open, request }: Given, die: boolean): Promise<Page> {
  const table = await tableOf({ players: 2, counters: [], cards: 4, copies: 1, ...(die ? { dice: [{ faces: 6, count: 1, zone: 'table' }] } : {}) })
  // One card loose on the floor, for the keyboard to send.
  await (await host(table)).send([{ v: 'draw', from: 'draw', to: 'table', count: 1 }])
  const seat = await join(request, table, { name: 'Bo', seat: 'A' })
  const { page } = await open(DESK, `${seat.onlineUrl}&lang=sv`)
  await expect(page.locator('.byd-card[data-component]')).toHaveCount(1)
  return page
}

// The card in the area once it has come to rest there, as shares of the area.
async function cardIn(page: Page): Promise<{ along: number; across: number }> {
  const card = page.locator('.byd-card[data-component]')
  await expect(card).toHaveAttribute('aria-label', /Framför A/)
  const area = page.locator('[data-area="mine:A"]')
  let last = ''
  let box: Box | null = null
  // Until it stops moving: the felt eases a card to its new place.
  await expect
    .poll(async () => {
      box = await card.boundingBox()
      const now = JSON.stringify(box)
      const still = now === last
      last = now
      return still
    })
    .toBe(true)
  return within(box!, (await area.boundingBox())!)
}

test.describe('a card sent with the keyboard to an area that holds a die (#1202)', () => {
  test.use({ viewport: DESK.viewport })

  test('lands where the first card lands in an empty area', async ({ tableOf, host, open, request }) => {
    const given = { tableOf, host, open, request }
    // The empty area, as the measure of where the first card goes.
    const empty = await opened(given, false)
    await arrowTo(empty, 'card:')
    await sendToMine(empty)
    const first = await cardIn(empty)

    // The same area with a die in it first, sent there by the keyboard as well.
    const page = await opened(given, true)
    await arrowTo(page, 'die:')
    await sendToMine(page, 'm')
    await expect(page.getByRole('status').filter({ hasText: /flyttade/ })).toHaveText(/^Du flyttade d6 till /)
    // From the die to the card, by the arrows.
    await arrowTo(page, 'card:')
    await sendToMine(page)
    const beside = await cardIn(page)

    // Not vacuous: the first card lies at the start of the fan, centred across the area.
    expect(first.along).toBeLessThan(0.1)
    expect(Math.abs(first.across - 0.5)).toBeLessThan(0.05)
    // And the card beside the die lies just there. One step of the fan is 26 of the area's
    // 365 mm, about 0.07 of it, so a tenth of that tells the first place from the second.
    expect(Math.abs(beside.along - first.along)).toBeLessThan(0.007)
    expect(Math.abs(beside.across - first.across)).toBeLessThan(0.007)
  })
})
