import { TILE_HEX } from '@byd/engine'
import { deckFromProject, type ProjectDoc } from '@byd/server'
import { setupFromProject } from '@byd/server/doc'
import type { Template } from '@byd/template'
import { join, tableOf, withQuery } from '../support/api.js'
import { pastTheWaitingRoom } from '../support/waiting.js'
import { DESK } from '../support/devices.js'
import { gameDoc } from '../support/game.js'
import { expect, test } from '../support/test.js'

// Brickor på filten (#1485, variant A i #1474), i den byggda appen: ett spel med en lek
// landskapsbrickor i en dold påse. Ada drar en bricka ur påsen ut på filten och vrider den ett steg
// med ringen, och hennes skärm och rummets TV ritar samma sexhörning, med baksidan upp och vriden 60°.
const hex = { id: TILE_HEX.id, version: TILE_HEX.version }

function tileGame(): ProjectDoc {
  const doc = gameDoc({ players: 2, counters: [], cards: 6 })
  const floor = doc.setup.zones.find((z) => z.id === doc.setup.floor)!.geometry
  const bag = { id: 'bag', kind: 'pile' as const, name: 'Landskap', visibility: 'none' as const, geometry: { x: floor.x + floor.w / 2, y: floor.y + floor.h / 2, w: 0, h: 0, rot: 0 } }
  const lands: Template = {
    faces: {
      front: { base: [{ kind: 'text' as const, id: 't', x: 6, y: 24, w: 40, h: 10, bind: { field: 'title' }, font: { family: 'sans-serif', sizePt: 10, weight: 700 }, color: '#111' }], variants: {} },
      back: { base: [{ kind: 'shape' as const, id: 'bg', x: 0, y: 0, w: 52, h: 61, shape: 'rect' as const, fill: '#4a3424' }], variants: {} },
    },
  }
  return {
    ...doc,
    setup: { ...doc.setup, zones: [...doc.setup.zones, bag] },
    decks: [{ id: 'landskap', name: 'Landskap', type: hex, template: lands, rows: ['Granskog', 'Tjärn', 'Fjäll', 'Rågåker'].map((title, i) => ({ id: `l${i + 1}`, fields: { title } })), columns: ['title'], zone: 'bag' }],
  }
}

test.describe('en bricka på filten (#1485)', () => {
  test('dras ur en dold påse, vrids ett steg, och ser likadan ut på två skärmar', async ({ request, open }) => {
    const doc = tileGame()
    const table = await tableOf(request, setupFromProject(doc), deckFromProject(doc))
    const ada = await join(request, table, { name: 'Ada', seat: 'A' })
    const { page } = await open(DESK, withQuery(ada.onlineUrl, 'lang=sv'))
    const { page: tv } = await open(DESK, withQuery(table.tvUrl, 'lang=sv'))
    await pastTheWaitingRoom(page)

    // The bag is a stack of hexagons on both screens, counted in tiles and never named.
    for (const screen of [page, tv]) await expect(screen.locator('.byd-pile[data-zone="bag"]')).toHaveAttribute('data-shape', 'hex')
    await expect(page.locator('[data-kbd="pile:bag"]')).toHaveAttribute('aria-label', 'Landskap, 4 brickor, överst: bricka, baksida. Enter öppnar handlingar.')

    // Out of the bag onto the felt, below it.
    const top = page.locator('.byd-pile[data-zone="bag"] .byd-pile-top')
    const from = (await top.boundingBox())!
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(from.x + from.width / 2 + 40, from.y + from.height * 2.2, { steps: 10 })
    await page.mouse.up()
    const tile = page.locator('.byd-card[data-component][data-shape="hex"]')
    await expect(tile).toHaveCount(1)
    const id = (await tile.getAttribute('data-component'))!

    // A click asks, and the ring turns it a sixth.
    const at = (await tile.boundingBox())!
    await page.mouse.click(at.x + at.width / 2, at.y + at.height / 2)
    await page.getByRole('button', { name: '↻ Vrid 60°' }).click()

    for (const screen of [page, tv]) {
      const seen = screen.locator(`.byd-card[data-component="${id}"]`)
      await expect(seen).toHaveAttribute('data-shape', 'hex')
      await expect(seen).toHaveAttribute('data-face', 'back')
      await expect(seen).toHaveAttribute('style', /rotate\(60deg\)/)
      await expect(screen.locator('.byd-pile[data-zone="bag"]')).toHaveAttribute('data-count', '3')
    }
    await expect(page.locator(`[data-kbd="card:${id}"]`)).toHaveAttribute('aria-label', /^Bricka, baksida, i .+, vriden 60°\. Enter öppnar handlingar\.$/)
    // The tile is a hexagon in the type's proportions on both screens.
    for (const screen of [page, tv]) {
      const box = await screen.locator(`.byd-card[data-component="${id}"]`).evaluate((el) => ({ w: (el as HTMLElement).offsetWidth, h: (el as HTMLElement).offsetHeight }))
      expect(box.w / box.h).toBeCloseTo(TILE_HEX.physical.widthMm / TILE_HEX.physical.heightMm, 1)
    }
  })
})
