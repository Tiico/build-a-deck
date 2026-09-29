import type { Page } from '@playwright/test'
import { join } from '../support/api.js'
import { expect, test } from '../support/test.js'

// The phone's column is 580 px wide and stands in the middle of a wider window, and the page
// behind it had no ground of its own: at 640 CSS px — a laptop at 200 % zoom — /online drew white
// bands either side of the dark column (#560 P-22). Measured as the audit measured it, on the
// painted pixel beside the column and not on a declaration.
const painted = async (page: Page, x: number, y: number): Promise<[number, number, number]> => {
  const shot = (await page.screenshot({ clip: { x, y, width: 1, height: 1 } })).toString('base64')
  return page.evaluate(async (src) => {
    const img = new Image()
    img.src = `data:image/png;base64,${src}`
    await img.decode()
    const c = document.createElement('canvas')
    c.width = 1
    c.height = 1
    const g = c.getContext('2d')!
    g.drawImage(img, 0, 0)
    const [r, gr, b] = g.getImageData(0, 0, 1, 1).data
    return [r!, gr!, b!] as [number, number, number]
  }, shot)
}

for (const route of ['onlineUrl', 'playUrl'] as const) {
  test(`${route === 'onlineUrl' ? '/online' : '/play'} at 640 CSS px is dark beside the column, as it is inside it`, async ({ tableOf, host, open, request }) => {
    const table = await tableOf({ players: 2, counters: [], cards: 4, copies: 1 })
    await host(table)
    const seat = await join(request, table, { name: 'Ada', seat: 'A' })
    const { page } = await open({ name: 'd', viewport: { width: 640, height: 400 } }, `${seat[route]}&lang=sv`)
    const column = page.locator('.byd-player')
    await expect(column).toBeVisible()
    const box = (await column.boundingBox())!
    // Non-vacuity: the column really is narrower than the window, so there is a beside to measure.
    expect(box.x).toBeGreaterThan(20)
    const inside = await painted(page, Math.round(box.x + box.width / 2), 390)
    const beside = await painted(page, 10, 200)
    expect(Math.max(...beside)).toBeLessThan(40)
    expect(beside).toEqual(inside)
  })
}
