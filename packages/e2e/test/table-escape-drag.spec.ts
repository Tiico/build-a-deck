import type { Page } from '@playwright/test'
import { DESK } from '../support/devices.js'
import type { Wire } from '../support/frames.js'
import { expect, test } from '../support/test.js'

// Escape mitt i ett drag på filten tar tillbaka draget (#681, K14). Hjälpen under «?» har länge
// lovat «Esc · avbryt draget», men filten hade ingen dörr för draget: kortet följde pekaren efter
// Escape och släppet utförde draget ändå. Det här är gesten i den byggda appen, med de
// pekarhändelser en webbläsare gör av ett drag, och beviset är tråden: inget kuvert går iväg.
const envelopes = (wire: Wire): string[] => wire.sent().filter((f) => f.includes('"t":"envelope"'))

// Lyft det som ligger under `from`, bär det 120 px, tryck Escape och släpp där pekaren då står.
async function carryThenEscape(page: Page, from: { x: number; y: number }): Promise<void> {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 120, from.y + 40, { steps: 10 })
  await expect(page.locator('[data-dragging="true"]').first(), 'draget har börjat innan Escape trycks').toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-dragging="true"]')).toHaveCount(0)
  await page.mouse.move(from.x + 160, from.y + 60, { steps: 4 })
  await page.mouse.up()
}

const centre = (b: { x: number; y: number; width: number; height: number }) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })

test.describe('Escape under ett drag på bordsläget (#681)', () => {
  test.use({ viewport: DESK.viewport })

  test('lägger tillbaka högens topp och skickar inget', async ({ tableOf, open }) => {
    const table = await tableOf({ players: 2, counters: [], cards: 4, copies: 1 })
    const { page, wire } = await open(DESK, `${table.tableUrl}&lang=sv`)
    const pile = page.locator('.byd-pile[data-zone="draw"]')
    await expect(pile).toHaveAttribute('data-count', '4')
    const before = envelopes(wire).length

    await carryThenEscape(page, centre((await pile.locator('.byd-pile-top').boundingBox())!))

    await expect(pile).toHaveAttribute('data-count', '4')
    await expect(page.locator('.byd-card[data-component]')).toHaveCount(0)
    expect(envelopes(wire), 'ett avbrutet drag är inget som hände').toHaveLength(before)
  })

  test('lägger tillbaka ett löst kort där det låg och skickar inget', async ({ tableOf, open }) => {
    const table = await tableOf({ players: 2, counters: [], cards: 4, copies: 1 })
    const { page, wire } = await open(DESK, `${table.tableUrl}&lang=sv`)
    // Ett löst kort på golvet: högens topp dragen en bit ut på filten.
    const top = centre((await page.locator('.byd-pile[data-zone="draw"] .byd-pile-top').boundingBox())!)
    await page.mouse.move(top.x, top.y)
    await page.mouse.down()
    await page.mouse.move(top.x, top.y - 220, { steps: 12 })
    await page.mouse.up()
    const card = page.locator('.byd-card[data-component]')
    await expect(card).toHaveCount(1)
    await expect(card).not.toHaveAttribute('data-dragging', 'true')
    // Kortet ska ha landat, och läsningen som en mus som vilar på det lyfter ska ha lagt sig.
    await page.mouse.move(5, 5)
    const lay = (await card.boundingBox())!
    const before = envelopes(wire).length

    await carryThenEscape(page, centre(lay))

    await expect(card).toHaveCount(1)
    await expect(card).not.toHaveAttribute('data-dragging', 'true')
    const after = (await card.boundingBox())!
    expect(Math.abs(after.x - lay.x)).toBeLessThan(1)
    expect(Math.abs(after.y - lay.y)).toBeLessThan(1)
    expect(envelopes(wire), 'ett avbrutet drag är inget som hände').toHaveLength(before)
  })
})
