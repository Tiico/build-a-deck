import { join, withQuery } from '../support/api.js'
import { expect, test } from '../support/test.js'

// Spalten är hopfälld där den kostar (#1131, beställarens beslut 2026-10-22): K9:s golv är 45 px på
// ett korts kortsida på /online, och öppen tar spalten 240 px bredd av filten. Utan eget val står
// spalten öppen bara i ett fönster där korten håller golvet ändå — mätt på de ritade korten, inte på
// ett tal i koden. 1280 × 800 tappade 46 → 36 px och står därför hopfälld; 1920 × 1080 är höjdbunden
// och står öppen.
const K9_PX = 45
for (const [w, h, open] of [
  [1280, 800, false],
  [1440, 900, null],
  [1512, 982, null],
  [1920, 1080, true],
] as const)
  test(`the notepad at ${w} × ${h} starts ${open === null ? 'as the felt allows' : open ? 'open' : 'folded'}, and a card keeps K9's floor`, async ({ tableOf, open: openAt, host, request }) => {
    const table = await tableOf({ players: 4, counters: [], cards: 8, copies: 1 })
    await (await host(table)).send([{ v: 'draw', from: 'draw', to: 'table', count: 1 }])
    const ada = await join(request, table, { name: 'Ada', seat: 'A' })
    const { page } = await openAt({ name: 'd', viewport: { width: w, height: h } }, withQuery(ada.onlineUrl, `lang=sv`))
    const toggle = page.getByRole('complementary', { name: 'Anteckningar' }).getByRole('button', { name: 'Anteckningar' })
    await expect(page.locator('.byd-online-felt .byd-card[data-component]')).toBeVisible()
    if (open !== null) await expect(toggle).toHaveAttribute('aria-expanded', String(open))
    // The column has settled: it no longer changes once the felt has been measured.
    await page.waitForTimeout(500)
    // The card on the felt as it is laid out, before the tilt — the measure the lens's step brings to 45.
    const smallest = await page.evaluate(`(document.querySelector('.byd-online-felt .byd-card[data-component]')).offsetWidth`)
    expect({ expanded: await toggle.getAttribute('aria-expanded'), smallest, keeps: (smallest as number) >= K9_PX }).toMatchObject({ keeps: true })
  })
