import { TV } from '../../support/devices.js'
import { expect, test } from '../../support/test.js'

// The television camera's buttons (#482 fynd 11): 40 × 40 and 34 × 40, under the 44 px a finger is
// given everywhere else (C4). They keep the size they are drawn at — the cluster's widths are the
// prototype's (#325) — and take the press over a 44 px target around them, the way the «?» beside
// them already does. Read by hit-testing, which is what a finger does.
test.describe('the camera cluster on the television (#482)', () => {
  test.use({ viewport: TV.viewport })

  test('takes a press anywhere on a 44 px target around each button', async ({ tableOf, open }) => {
    const table = await tableOf({ players: 2, counters: [], cards: 2 })
    const { page } = await open(TV, `${table.tvUrl}&lang=sv`)
    // The cluster stands only while the view is the viewer's own (#325): one step in makes it so.
    await expect(page.locator('.byd-pile').first()).toBeVisible()
    await page.keyboard.press('+')
    const buttons = page.locator('.byd-camera-controls button')
    await expect(buttons.first()).toBeVisible()
    const short = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.byd-camera-controls button')].flatMap((b) => {
        const r = b.getBoundingClientRect()
        const cx = r.left + r.width / 2
        const cy = r.top + r.height / 2
        // 21.5 px from the centre, which is inside a 44 px target and outside a 40 px one.
        return [
          [cx - 21.5, cy],
          [cx + 21.5, cy],
          [cx, cy - 21.5],
          [cx, cy + 21.5],
        ]
          .filter(([x, y]) => !b.contains(document.elementFromPoint(x!, y!)))
          .map(([x, y]) => `${b.getAttribute('aria-label') ?? b.textContent?.trim()} misses ${Math.round(x! - cx)},${Math.round(y! - cy)}`)
      }),
    )
    expect(short).toEqual([])
  })
})
