import type { ProjectDoc } from '@byd/server'
import { deckFromProject } from '@byd/server'
import { setupFromProject } from '@byd/server/doc'
import { tableOf as tableFromSetup } from '../../support/api.js'
import { gameDoc } from '../../support/game.js'
import { expect, test } from '../../support/test.js'

// The start tile stands clear of the piles' pills (K25, #721). It lies in the band under the piles,
// placed in table millimetres, but the pills that carry the piles' names and counts hang off them
// in pixels and do not shrink with the felt: at 1024 the tile lay 10 px over them, and its shadow
// over the counts. Measured on the built table screen, as a player at the table sees it.
function gameWithAStart(): ProjectDoc {
  const doc = gameDoc({ players: 2, counters: [], cards: 8 })
  return {
    ...doc,
    setup: {
      ...doc.setup,
      zones: doc.setup.zones.map((z) =>
        z.id === doc.setup.deckZone ? { ...z, actions: [{ id: 'start', label: 'Blanda', when: 'both' as const, steps: [{ v: 'shuffle' as const }] }] } : z,
      ),
    },
  }
}

for (const width of [1024, 1280, 1440]) {
  test.describe(`the start tile at ${width} (#721)`, () => {
    test.use({ viewport: { width, height: width === 1024 ? 768 : 800 } })

    test('leaves at least 8 px to every pile’s pill above it', async ({ request, open }) => {
      const doc = gameWithAStart()
      const table = await tableFromSetup(request, setupFromProject(doc), deckFromProject(doc))
      const { page } = await open({ name: `desk-${width}`, viewport: { width, height: width === 1024 ? 768 : 800 } }, `${table.tableUrl}&lang=sv`, { facesReady: true })
      const tile = page.locator('[data-table-start]')
      await expect(tile).toBeVisible()
      const drawn = await page.evaluate(() => {
        const t = document.querySelector('[data-table-start]')!.getBoundingClientRect()
        const pills = [...document.querySelectorAll('.byd-pile-count')].map((p) => p.getBoundingClientRect())
        return { tile: { left: t.left, right: t.right, top: t.top }, pills: pills.map((p) => ({ left: p.left, right: p.right, bottom: p.bottom })) }
      })
      // The pills that stand over the tile, across: those are the ones it can cover.
      const over = drawn.pills.filter((p) => p.right > drawn.tile.left && p.left < drawn.tile.right)
      expect(over.length, 'a pile’s pill stands above the tile').toBeGreaterThan(0)
      for (const p of over) expect(drawn.tile.top - p.bottom).toBeGreaterThanOrEqual(8)
    })
  })
}
