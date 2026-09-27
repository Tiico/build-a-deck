import { join } from '../../support/api.js'
import { PHONE, TV } from '../../support/devices.js'
import { expect, test } from '../../support/test.js'

// The TV's «SENAST» (#482 fynd 6): nine lines drawn, the list cut at 211 px so the last one stood
// half out, and the observers' row laid over the ones under it. Nobody scrolls a television from the
// sofa, so the list shows the lines that fit whole and no more.
test.describe('the latest lines on a television (#482)', () => {
  test.use({ viewport: TV.viewport })

  test('shows only whole lines, and nothing lies over them', async ({ tableOf, open, host, request }) => {
    const table = await tableOf({ players: 4, cards: 12, copies: 2 })
    const tv = await open(TV, `${table.tvUrl}&lang=sv`)
    const dealer = await host(table)
    for (let i = 0; i < 12; i++) await dealer.send([{ v: 'draw', from: 'draw', to: 'discard', count: 1 }])
    const watcher = await join(request, table, { name: 'Tittaren' })
    await open(PHONE, watcher.observeUrl)
    await expect(tv.page.locator('[data-observers]')).toBeVisible()
    await expect(tv.page.locator('.byd-tv-feed li').first()).toBeVisible()
    const measured = await tv.page.evaluate(() => {
      const feed = document.querySelector('.byd-tv-feed') as HTMLElement
      const box = feed.getBoundingClientRect()
      const watchers = document.querySelector('[data-observers]')!.getBoundingClientRect()
      const shown = [...feed.querySelectorAll<HTMLElement>('li')].filter((li) => getComputedStyle(li).display !== 'none' && li.getBoundingClientRect().height > 0)
      return {
        shown: shown.length,
        cut: shown.filter((li) => li.getBoundingClientRect().bottom > box.bottom + 0.5).length,
        under: shown.filter((li) => { const r = li.getBoundingClientRect(); return r.bottom > watchers.top && r.top < watchers.bottom }).length,
        scrolls: feed.scrollHeight > feed.clientHeight + 1,
      }
    })
    expect(measured.shown).toBeGreaterThan(1)
    expect(measured).toEqual({ shown: measured.shown, cut: 0, under: 0, scrolls: false })
  })
})
