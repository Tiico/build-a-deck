import type { APIRequestContext, Page } from '@playwright/test'
import { join } from '../support/api.js'
import { DESK } from '../support/devices.js'
import { expect, test, type Fixtures } from '../support/test.js'

// A card sent with the keyboard to an area that already holds a die (#1202). The area's answer for
// the next card counted the die as a card, and the card landed two steps in — beside the die, but
// by chance. Counting only cards put the card right over the die, hiding it and taking its clicks.
// The beställare's decision in #1202 is beside and never over: the card skips a place in the fan
// where it would cover a counter or a die. (A chip alone does not do here: an area that holds
// nothing but chips is not offered to a card at all, C4.) Every press is a real one, since
// element.focus() draws no ring and skips the path a person without a mouse takes.

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

type Given = Pick<Fixtures, 'tableOf' | 'host' | 'open'> & { request: APIRequestContext }

async function opened({ tableOf, host, open, request }: Given): Promise<Page> {
  const table = await tableOf({ players: 2, counters: [], cards: 4, copies: 1, dice: [{ faces: 6, count: 1, zone: 'table' }] })
  // One card loose on the floor, for the keyboard to send.
  await (await host(table)).send([{ v: 'draw', from: 'draw', to: 'table', count: 1 }])
  const seat = await join(request, table, { name: 'Bo', seat: 'A' })
  const { page } = await open(DESK, `${seat.onlineUrl}&lang=sv`)
  await expect(page.locator('.byd-card[data-component]')).toHaveCount(1)
  return page
}

// A box once it has come to rest: the felt eases a thing to its new place.
async function still(page: Page, selector: string): Promise<Box> {
  const el = page.locator(selector)
  let last = ''
  let box: Box | null = null
  await expect
    .poll(async () => {
      box = await el.boundingBox()
      const now = JSON.stringify(box)
      const same = now === last
      last = now
      return same
    })
    .toBe(true)
  return box!
}

const overlap = (a: Box, b: Box): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
const inside = (a: Box, b: Box): boolean => a.x >= b.x && a.y >= b.y && a.x + a.width <= b.x + b.width && a.y + a.height <= b.y + b.height

test.describe('a card sent with the keyboard to an area that holds a die (#1202)', () => {
  test.use({ viewport: DESK.viewport })

  test('lies beside the die and not over it, and the die can still be rolled', async ({ tableOf, host, open, request }) => {
    const page = await opened({ tableOf, host, open, request })
    // The die into the area first, by the keyboard.
    await arrowTo(page, 'die:')
    await sendToMine(page, 'm')
    await expect(page.getByRole('status').filter({ hasText: /flyttade/ })).toHaveText(/^Du flyttade d6 till /)
    // From the die to the card, by the arrows, and the card into the same area.
    await arrowTo(page, 'card:')
    await sendToMine(page)
    await expect(page.locator('.byd-card[data-component]')).toHaveAttribute('aria-label', /Framför A/)

    const area = (await page.locator('[data-area="mine:A"]').boundingBox())!
    const card = await still(page, '.byd-card[data-component]')
    const die = await still(page, '.byd-die[data-kind="d6"]')
    // Not vacuous: both lie wholly in the area.
    expect(inside(card, area)).toBe(true)
    expect(inside(die, area)).toBe(true)
    // Beside and never over.
    expect(overlap(card, die)).toBe(false)

    // And a click still reaches the die: Playwright clicks only what the point actually hits.
    await page.locator('.byd-die[data-kind="d6"]').click()
    await expect(page.getByRole('status').filter({ hasText: /slog d6/ })).toHaveText(/^Du slog d6: [1-6]$/)
  })
})
