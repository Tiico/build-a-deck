import { deckFromProject } from '@byd/server'
import { applyRecipe, recipeOf, setupFromProject } from '@byd/server/doc'
import { join, tableOf, withQuery } from '../support/api.js'
import { DESK, SMALL_TV, TV } from '../support/devices.js'
import { gameDoc } from '../support/game.js'
import { expect, test } from '../support/test.js'

// Brädet på filten (#1480, variant A i #1473): ett spel med ett huvudbräde och spelarbräden, i den
// byggda appen. Brädet ligger under allt, ett kort som läggs på en zon på brädet hamnar i zonen, och
// kortet i vila håller de mått prototypen mätte och beställaren godtog 2026-11-01.
const square = { id: 'board.square457', version: 1 }
const player = { id: 'board.player', version: 1 }

function boardGame(players: number) {
  const doc = gameDoc({ players, counters: [{ name: 'Liv', start: 20 }], cards: 12 })
  const withBoards = { ...doc.setup, boards: [{ id: 'main', type: square, zone: 'table' }, { id: 'spelare', type: player, role: 'mine' }] }
  const laid = applyRecipe(withBoards, recipeOf(withBoards))
  // A zone the designer drew on the main board, right of its middle.
  const floor = laid.zones.find((z) => z.id === laid.floor)!.geometry
  const torget = { id: 'torget', kind: 'area' as const, name: 'Torget', visibility: 'all' as const, geometry: { x: floor.x + floor.w / 2 + 40, y: floor.y + floor.h / 2 - 60, w: 160, h: 120, rot: 0 } }
  return { ...doc, setup: { ...laid, zones: [...laid.zones, torget] } }
}

test.describe('ett spel med bräde (#1480)', () => {
  test('spelas på två skärmar, och ett kort som läggs på en zon på brädet hamnar i zonen', async ({ request, open }) => {
    const doc = boardGame(2)
    const table = await tableOf(request, setupFromProject(doc), deckFromProject(doc))
    const ada = await join(request, table, { name: 'Ada', seat: 'A' })
    const screen = await open(DESK, withQuery(table.tableUrl, 'lang=sv'))
    const online = await open(DESK, withQuery(ada.onlineUrl, 'lang=sv'))
    for (const { page } of [screen, online]) {
      // The main board and a player board for each of the two seats, under the zones on them.
      await expect(page.locator('.byd-board[data-board]')).toHaveCount(3)
      await expect(page.locator('[data-area="torget"]')).toHaveAttribute('data-on-board', '')
    }

    const { page } = screen
    const top = page.locator('.byd-pile[data-zone="draw"] .byd-pile-top')
    const torget = page.locator('[data-area="torget"]')
    const from = (await top.boundingBox())!
    const to = (await torget.boundingBox())!
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 })
    await page.mouse.up()

    for (const { page } of [screen, online]) {
      const card = page.locator('.byd-card[data-component]')
      await expect(card).toHaveCount(1)
      await expect(card).toHaveAttribute('aria-label', /kort i Torget\./)
    }
    // The board lies fixed: the drop took nothing off it, and it is still where it was.
    await expect(page.locator('.byd-board[data-board]')).toHaveCount(3)
  })
})

// Kortets kortsida i vila med bräde och spelarbräden (#1473, variant A, beställarens beslut
// 2026-11-01), mätt på det ritade kortets layoutbredd innan bordslägets lutning: det tal filtens
// inpassning ger, och inget typsnitt. Prototypens värden med en pixels slack, och K9:s 45 px på TV:n.
const MEASURED: { seats: number; screen: 'tv' | 'table'; device: typeof TV | typeof SMALL_TV; least: number }[] = [
  { seats: 4, screen: 'tv', device: TV, least: 58 },
  { seats: 8, screen: 'tv', device: TV, least: 46 },
  { seats: 4, screen: 'table', device: SMALL_TV, least: 40 },
  { seats: 8, screen: 'table', device: SMALL_TV, least: 27 },
]
const SLACK_PX = 1
const K9_PX = 45

for (const m of MEASURED)
  test(`kortet i vila med bräde vid ${m.seats} platser, ${m.screen} ${m.device.viewport.width} × ${m.device.viewport.height}, håller prototypens ${m.least} px`, async ({ request, open, host }) => {
    const doc = boardGame(m.seats)
    const table = await tableOf(request, setupFromProject(doc), deckFromProject(doc))
    await (await host(table)).send([{ v: 'draw', from: 'draw', to: 'table', count: 1 }])
    const { page } = await open(m.device, withQuery(m.screen === 'tv' ? table.tvUrl : table.tableUrl, 'lang=sv'))
    const card = page.locator('.byd-card[data-component]')
    await expect(card).toBeVisible()
    await expect(page.locator('.byd-board[data-board]').first()).toBeVisible()
    // The stage beside the TV's felt settles once the felt has been measured.
    await page.waitForTimeout(500)
    const px = await card.evaluate((el) => (el as HTMLElement).offsetWidth)
    expect(px).toBeGreaterThanOrEqual(m.least - SLACK_PX)
    if (m.screen === 'tv' && m.device === TV) expect(px).toBeGreaterThanOrEqual(K9_PX)
  })
