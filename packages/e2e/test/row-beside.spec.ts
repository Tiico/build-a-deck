import type { Page } from '@playwright/test'
import type { ActionTarget } from '@byd/protocol'
import type { ProjectDoc } from '@byd/server'
import { deckFromProject } from '@byd/server'
import { setupFromProject } from '@byd/server/doc'
import { tableOf as tableFromSetup } from '../support/api.js'
import { TV } from '../support/devices.js'
import { gameDoc } from '../support/game.js'
import { expect, test } from '../support/test.js'

// En regel som lägger ut korten bredvid varandra, i den byggda produkten (#1203).
//
// Beställarens fynd: «vänd upp ett kort per spelare» lade korten på varandra, så spelaren fick
// lägga ut dem för hand ändå. Kompilatorn och motorn har sina egna grindar; det bara en riktig
// stack kan säga är att korten faktiskt ligger isär på filten, var för sig och uppvända, sett med
// webbläsarens egna rektanglar.
//
// Startbrickan kör åtgärden, eftersom den är vägen en spelare tar och inte kräver att någon sitter.
type Box = { left: number; top: number; right: number; bottom: number }

function gameThatLaysOut(to: ActionTarget): ProjectDoc {
  const doc = gameDoc({ players: 2, counters: [], cards: 8 })
  const step = { v: 'split' as const, count: { of: 'number' as const, n: 4 }, to, face: 'front' as const }
  return {
    ...doc,
    setup: {
      ...doc.setup,
      zones: doc.setup.zones.map((z) => (z.id === doc.setup.deckZone ? { ...z, actions: [{ id: 'start', label: 'Lägg ut marknaden', when: 'start' as const, steps: [step] }] } : z)),
    },
  }
}

async function laidOut(page: Page, deck: string): Promise<{ pile: Box; cards: Box[] }> {
  await page.locator('[data-table-start]').click()
  await expect(page.locator(`.byd-pile[data-zone="${deck}"]`)).toHaveAttribute('data-count', '4')
  const cards = page.locator('.byd-card[data-component][data-face="front"]')
  await expect(cards, 'four loose cards, face up, and no pile among them').toHaveCount(4)
  return page.evaluate((deck) => {
    const box = (el: Element): Box => {
      const r = el.getBoundingClientRect()
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
    }
    return {
      pile: box(document.querySelector(`.byd-pile[data-zone="${deck}"] .byd-pile-top`)!),
      cards: [...document.querySelectorAll('.byd-card[data-component]')].map(box),
    }
  }, deck)
}

test.describe('en regel som lägger ut korten bredvid högen (#1203)', () => {
  test('bredvid varandra till vänster: fyra kort i en rad, isär och på högens linje', async ({ request, open }) => {
    const doc = gameThatLaysOut({ at: 'beside', side: 'left', lay: 'row' })
    const table = await tableFromSetup(request, setupFromProject(doc), deckFromProject(doc))
    const { page } = await open(TV, `${table.tvUrl}&lang=sv`, { facesReady: true })
    const { pile, cards } = await laidOut(page, doc.setup.deckZone)

    const byLeft = [...cards].sort((a, b) => a.left - b.left)
    for (const [i, c] of byLeft.entries()) {
      expect(c.right, `kort ${i} ligger till vänster om högen`).toBeLessThan(pile.left)
      expect(Math.abs(c.top - pile.top), `kort ${i} ligger på högens linje`).toBeLessThanOrEqual(1)
      const next = byLeft[i + 1]
      if (next) expect(c.right, `kort ${i} och ${i + 1} ligger isär`).toBeLessThan(next.left)
    }
  })

  test('omlott ovanför: raden centreras över högen, och varje kort syns till en del', async ({ request, open }) => {
    const doc = gameThatLaysOut({ at: 'beside', side: 'above', lay: 'overlap' })
    const table = await tableFromSetup(request, setupFromProject(doc), deckFromProject(doc))
    const { page } = await open(TV, `${table.tvUrl}&lang=sv`, { facesReady: true })
    const { pile, cards } = await laidOut(page, doc.setup.deckZone)

    const byLeft = [...cards].sort((a, b) => a.left - b.left)
    for (const [i, c] of byLeft.entries()) {
      expect(c.bottom, `kort ${i} ligger ovanför högen`).toBeLessThan(pile.top)
      const next = byLeft[i + 1]
      if (next) {
        expect(next.left, `kort ${i + 1} ligger omlott med kort ${i}`).toBeLessThan(c.right)
        expect(next.left, `kort ${i + 1} lämnar en bit av kort ${i} synlig`).toBeGreaterThan(c.left)
      }
    }
    const middle = (b: Box) => (b.left + b.right) / 2
    const row = (middle(byLeft[0]!) + middle(byLeft[byLeft.length - 1]!)) / 2
    expect(Math.abs(row - middle(pile)), 'raden är centrerad på högens linje').toBeLessThanOrEqual(2)
  })
})
