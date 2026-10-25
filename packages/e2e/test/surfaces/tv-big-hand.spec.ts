import { withQuery } from '../../support/api.js'
import { TV } from '../../support/devices.js'
import { expect, test } from '../../support/test.js'

// En hand med många kort på rummets TV (#766, beställarens beslut A): solfjädern vrids högst ±22°
// och växer inte med antalet. Vid åtta platser och 25 kort på A:s hand hängde den 38 px ut över
// filtens kant; handen står kvar där #84 ställde den, mot kanten, så ett överhäng är rätt — men det
// är solfjäderns och inte antalets.
test.use({ viewport: TV.viewport })

test('25 kort på en hand hänger inte längre ut över filten än en hand med få kort gör (#766)', async ({ tableOf, host, open }) => {
  const table = await tableOf({ players: 8, counters: [], cards: 40, copies: 1 })
  const dealer = await host(table)
  await dealer.send([{ v: 'draw', from: 'draw', to: 'hand:A', count: 25 }])
  const { page } = await open(TV, withQuery(table.tvUrl, 'lang=sv'))
  await expect(page.locator('[data-zone="hand:A"] .byd-back')).toHaveCount(12)
  await page.waitForTimeout(500)
  const over = await page.evaluate(() => {
    const f = document.querySelector('.byd-table-wood')!.getBoundingClientRect()
    const backs = [...document.querySelectorAll('[data-zone="hand:A"] .byd-back')].map((b) => b.getBoundingClientRect())
    return Math.round(Math.max(...backs.map((b) => b.bottom)) - f.bottom)
  })
  expect(over, 'how far the fan hangs past the felt, in px').toBeLessThanOrEqual(28)
})
