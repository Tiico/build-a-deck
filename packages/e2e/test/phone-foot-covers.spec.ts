import { PHONE } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// What stays at the bottom of the phone covers nothing that has focus (#559 P-6, WCAG 2.4.11;
// #1147). The head, the bar over the tabs and the tabs stand still, and only the panel between
// them scrolls: a control Tab reaches inside the panel is scrolled into the panel's view, never
// left behind the bar. Every stop on the page is walked with Tab, as a keyboard reader would, with
// a card marked so that the bar is there to be behind.
for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
  test(`no control Tab reaches at ${viewport.width} × ${viewport.height} is behind the bar or the tabs`, async ({ tableOf, player, host }) => {
    const table = await tableOf({ players: 2, cards: 8 })
    const ada = await player(table, { name: 'Ada', seat: 'A', device: { ...PHONE, viewport } })
    const dealer = await host(table)
    await dealer.send([{ v: 'deal', from: 'draw', to: ['hand:A'], each: 6 }])
    const page = ada.page
    const cards = page.locator('[data-hand] [data-hand-card]')
    await expect(cards).toHaveCount(6)
    await cards.first().tap()
    await expect(page.locator('[data-hand-bar]')).toBeVisible()
    const covered: string[] = []
    let reached = 0
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab')
      const hit = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null
        const panels = document.querySelector('.byd-panels')
        if (!el || !panels || !panels.contains(el)) return null
        const r = el.getBoundingClientRect()
        const p = panels.getBoundingClientRect()
        return { name: el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 30) ?? el.tagName, under: r.bottom > p.bottom + 0.5 || r.top < p.top - 0.5 }
      })
      if (!hit) continue
      reached++
      if (hit.under) covered.push(hit.name)
    }
    // Non-vacuity: the walk reached the panel's controls, not only the bar's and the tabs'.
    expect(reached).toBeGreaterThan(2)
    expect(covered).toEqual([])
  })
}
