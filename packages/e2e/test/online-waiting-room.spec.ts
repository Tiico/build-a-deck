import type { ProjectDoc } from '@byd/server'
import { deckFromProject } from '@byd/server'
import { setupFromProject } from '@byd/server/doc'
import { join, tableOf } from '../support/api.js'
import { SMALL_TV } from '../support/devices.js'
import { gameDoc } from '../support/game.js'
import { expect, test } from '../support/test.js'

// Distansspel börjar i ett väntrum (L75, #1130), i den byggda produkten: två spelare vid varsin
// dator på /online. Väntrummet fylls medan man tittar, adressen står som `värd/KOD`, och «Starta
// spelet» delar ut och tar väntrummet för båda.
function gameThatDeals(): ProjectDoc {
  const doc = gameDoc({ players: 2, counters: [], cards: 8 })
  return {
    ...doc,
    setup: {
      ...doc.setup,
      zones: doc.setup.zones.map((z) =>
        z.id === doc.setup.deckZone
          ? { ...z, actions: [{ id: 'start', label: 'Ge alla en starthand', when: 'start' as const, steps: [{ v: 'shuffle' as const }, { v: 'deal' as const, each: { of: 'number' as const, n: 2 }, to: { at: 'hands' as const }, face: 'keep' as const }] }] }
          : z,
      ),
    },
  }
}

test.describe('väntrummet på /online (L75)', () => {
  test('fylls medan man tittar, säger adressen som värd/KOD, och går för båda när spelet startas', async ({ request, open, baseURL }) => {
    const doc = gameThatDeals()
    const table = await tableOf(request, setupFromProject(doc), deckFromProject(doc))
    const at = async (name: string, seat: string) => {
      const admitted = await join(request, table, { name, seat })
      return open(SMALL_TV, `${admitted.onlineUrl}&code=${table.code}&lang=sv`, { facesReady: true })
    }

    const ada = await at('Ada', 'A')
    const room = (page: typeof ada.page) => page.getByRole('region', { name: /Väntar på spelare/ })
    await expect(room(ada.page).getByRole('heading')).toHaveText('Väntar på spelare · 1 av 2')
    await expect(room(ada.page).locator('[data-address]')).toHaveText(`${new URL(baseURL ?? '').host}/${table.code}`)
    await expect(room(ada.page).getByRole('listitem')).toHaveText(['AAda (du)', 'Bväntar…'])
    // En start, inte två: filtens bricka står inte bredvid väntrummets.
    await expect(ada.page.locator('[data-table-start]')).toHaveCount(1)

    const bo = await at('Bo', 'B')
    await expect(room(ada.page).getByRole('heading')).toHaveText('Väntar på spelare · 2 av 2')
    await expect(room(ada.page).getByRole('listitem')).toHaveText(['AAda (du)', 'BBo'])
    await expect(room(bo.page).getByRole('listitem')).toHaveText(['AAda', 'BBo (du)'])

    await room(ada.page).getByRole('button', { name: 'Starta spelet' }).click()
    for (const { page } of [ada, bo]) {
      await expect(room(page)).toHaveCount(0)
      await expect(page.locator('[data-hand-card]')).toHaveCount(2)
    }
    await expect(ada.page.getByRole('button', { name: 'Starta om' })).toBeVisible()
  })
})
