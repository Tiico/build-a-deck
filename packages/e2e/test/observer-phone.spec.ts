import { join } from '../support/api.js'
import { expect, test } from '../support/test.js'

// The observer on a phone (#485, fynd 9; beställarens beslut A efter prototyp 34). A tap on a card
// set the inspection in a column the phone does not show, so nothing happened; and the column,
// opened, took its room from the table until a card was 16 px wide at 390 and 10 px at 320. Now a
// tap holds the card up in a sheet over the table, as the player's phone does, and the column is
// a sheet over the table too — the table keeps its size either way.
for (const [width, height] of [
  [390, 844],
  [320, 568],
] as const) {
  test(`shows a tapped card large and keeps the table its size with the drawer open, at ${width}`, async ({ tableOf, host, request, browser, baseURL }) => {
    const table = await tableOf({ players: 2, cards: 12 })
    const hosting = await host(table)
    const seen = (await hosting.view()) as unknown as { floor: string }
    await hosting.send([{ v: 'split', pile: 'draw', at: 1, to: seen.floor, x: 0, y: 0 } as never])
    const eva = await join(request, table, { name: 'Eva' })
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true, ...(baseURL ? { baseURL } : {}) })
    const page = await context.newPage()
    await page.goto(eva.observeUrl)

    await expect(page.locator('[data-tv]')).toBeVisible()
    const felt = () => page.locator('[data-tv] > main, [data-tv] .byd-table-frame').first().evaluate((el) => Math.round(el.getBoundingClientRect().height))
    const shut = await felt()

    await page.locator('.byd-observer-more').tap()
    await page.waitForTimeout(300)
    expect(await felt(), 'the table keeps its size with the drawer open').toBe(shut)
    await expect(page.locator('[data-tv] > aside')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.byd-observer')).toHaveAttribute('data-drawer', 'shut')

    await page.locator('.byd-table-frame [data-component]').last().tap()
    const held = page.locator('.byd-inspect')
    await expect(held).toBeVisible()
    expect(await held.locator('[data-inspect]').evaluate((el) => el.getBoundingClientRect().width)).toBeGreaterThan(width * 0.5)
    await held.getByRole('button', { name: /^(Stäng|Close)$/ }).click()
    await expect(held).toHaveCount(0)
    await context.close()
  })
}
