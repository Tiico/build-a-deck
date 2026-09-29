import { PHONE } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// The foot that stays at the bottom of the phone covers nothing that has focus (#559 P-6, WCAG
// 2.4.11). The browser scrolls a focused control into view at the very bottom of the window, which
// is where the foot stands: «Senast» at 390 × 844 and the region's buttons at 320 × 568 were
// focused wholly behind it. Every stop on the page is walked with Tab, as a keyboard reader would.
for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
  test(`no control Tab reaches at ${viewport.width} × ${viewport.height} is behind the foot`, async ({ tableOf, player, host }) => {
    const table = await tableOf({ players: 2, cards: 8 })
    const ada = await player(table, { name: 'Ada', seat: 'A', device: { ...PHONE, viewport } })
    const dealer = await host(table)
    await dealer.send([{ v: 'deal', from: 'draw', to: ['hand:A'], each: 3 }])
    const page = ada.page
    await expect(page.locator('.byd-strip[data-hand] [data-hand-card]')).toHaveCount(3)
    await expect(page.locator('.byd-phone-foot')).toBeVisible()
    const covered: string[] = []
    let reached = 0
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Tab')
      const hit = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null
        const foot = document.querySelector('.byd-phone-foot')
        if (!el || el === document.body || !foot || foot.contains(el)) return null
        const r = el.getBoundingClientRect()
        const top = foot.getBoundingClientRect().top
        return { name: el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 30) ?? el.tagName, under: r.bottom > top + 0.5 }
      })
      if (!hit) continue
      reached++
      if (hit.under) covered.push(hit.name)
    }
    // Non-vacuity: the walk reached the page's controls, not only the foot's.
    expect(reached).toBeGreaterThan(8)
    expect(covered).toEqual([])
  })
}
