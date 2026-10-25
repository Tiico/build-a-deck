import type { APIRequestContext } from '@playwright/test'
import { deckFromProject } from '@byd/server'
import { setupFromProject } from '@byd/server/doc'
import { join, tableOf, withQuery } from '../../support/api.js'
import { gameDoc } from '../../support/game.js'
import { expect, test } from '../../support/test.js'

// How many targets the desk holds (#1310): `/play` in a wide window lays every place a card can be
// played to over the hand, and the sample deck's four seats and two piles make every layout look
// fine. So the table here is a dense one: eight seats, the draw pile, the discard pile and three
// more piles the designer added, two counters and a die, and cards in front of half the seats — 14
// targets. A column of targets opens a second column rather than hiding the rest below a scroll,
// so at 1280 × 800 and wider every one of them is on the screen, whole, at once. A smaller window
// keeps them all reachable by scrolling the row in its own box, and the page never scrolls (L10).
async function dense(request: APIRequestContext) {
  const doc = gameDoc({ players: 8, counters: [{ name: 'Poäng', start: 0 }, { name: 'Guld', start: 3 }], cards: 30, copies: 2, dice: [{ faces: 6, count: 1, zone: 'table' }] })
  const setup = setupFromProject(doc) as { zones: unknown[] }
  for (let i = 1; i <= 3; i++) setup.zones.push({ id: `market${i}`, kind: 'pile', name: `Marknad ${i}`, visibility: 'all', geometry: { x: 220 + i * 80, y: 200, w: 0, h: 0, rot: 0 }, shortcut: { label: `Lägg på marknad ${i}`, at: 'top' } })
  return tableOf(request, setup, deckFromProject(doc))
}

const measure = `(() => {
  const row = document.querySelector('.byd-desk-targets').getBoundingClientRect()
  const targets = [...document.querySelectorAll('[data-drop-zone]')].map((el) => {
    const r = el.getBoundingClientRect()
    return { id: el.getAttribute('data-drop-zone'), h: r.height, inside: r.left >= row.left - 0.5 && r.right <= row.right + 0.5 && r.top >= row.top - 0.5 && r.bottom <= row.bottom + 0.5 }
  })
  const steps = [...document.querySelectorAll('[data-hand-row] [data-hand-card]')].map((el) => el.parentElement.getBoundingClientRect().width)
  const page = document.documentElement
  return { targets, minStep: Math.min(...steps), pageFits: page.scrollWidth <= innerWidth && page.scrollHeight <= innerHeight }
})()`

type Measured = { targets: { id: string; h: number; inside: boolean }[]; minStep: number; pageFits: boolean }

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 1024, height: 768 },
]) {
  test(`holds fourteen targets and eighteen cards at ${viewport.width} × ${viewport.height}`, async ({ request, open, host }) => {
    const table = await dense(request)
    const dealer = await host(table)
    await dealer.send([{ v: 'draw', from: 'draw', to: 'hand:A', count: 18 }])
    for (const seat of ['A', 'B', 'C', 'D']) await dealer.send([{ v: 'draw', from: 'draw', to: `mine:${seat}`, count: 3 }])
    const seat = await join(request, table, { name: 'Ada Lovelace', seat: 'A' })
    const { page } = await open({ name: 'desk', viewport }, withQuery(seat.playUrl, 'lang=sv'), { facesReady: true })
    await expect(page.locator('[data-hand-row] [data-hand-card]')).toHaveCount(18)
    await expect(page.locator('[data-drop-zone]')).toHaveCount(14)
    const m = (await page.evaluate(measure)) as Measured
    expect(m.pageFits).toBe(true)
    // A fingertip's step at the least (#6), however many cards.
    expect(m.minStep).toBeGreaterThanOrEqual(44)
    // Every target as tall as a target's floor, so its name, count and cards are there to read.
    for (const t of m.targets) expect(t.h, t.id).toBeGreaterThanOrEqual(95.5)
    if (viewport.width >= 1280) expect(m.targets.filter((t) => !t.inside).map((t) => t.id)).toEqual([])
    else {
      // Narrower, the row scrolls in its own box, and the last target is reached that way.
      const last = page.locator('[data-drop-zone="table"]')
      await last.scrollIntoViewIfNeeded()
      await expect(last).toBeInViewport({ ratio: 1 })
      expect(((await page.evaluate(measure)) as Measured).pageFits).toBe(true)
    }
  })
}
