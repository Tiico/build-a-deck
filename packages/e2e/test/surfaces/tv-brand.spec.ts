import { SMALL_TV, TV } from '../../support/devices.js'
import { join, withQuery } from '../../support/api.js'
import { expect, test } from '../../support/test.js'

// Deckster's hand on the room's television (#1084, beslut B 2026-10-22): the mark and the name on a
// line of their own above the game's name. Since the stage (#1290) the two stand in the foot under
// the card, beside the felt and never on it; and like every word on the room's screen the name is
// at K26's 24 px.
for (const device of [SMALL_TV, TV]) {
  test(`the room's television wears the hand above the game's name at ${device.viewport.width}`, async ({ table, open }) => {
    const { page } = await open(device, withQuery(table.tvUrl, 'lang=sv'))
    const brand = page.locator('[data-tv] > aside .byd-tv-foot [data-brand]')
    await expect(brand).toBeVisible()
    const seen = await page.evaluate(() => {
      const aside = document.querySelector('[data-tv] > aside')!.getBoundingClientRect()
      const brand = document.querySelector('[data-brand]')!
      const mark = brand.querySelector('svg')!.getBoundingClientRect()
      const word = brand.querySelector('span')!
      const head = document.querySelector('.byd-tv-head')!.getBoundingClientRect()
      const felt = document.querySelector('[data-tv] > main')!.getBoundingClientRect()
      const b = brand.getBoundingClientRect()
      return {
        word: word.textContent,
        px: parseFloat(getComputedStyle(word).fontSize),
        mark: [Math.round(mark.width), Math.round(mark.height)],
        aboveHead: b.bottom <= head.top,
        inColumn: b.left >= aside.left && b.right <= aside.right && b.top >= aside.top,
        besideFelt: b.left >= felt.right,
        fills: [...brand.querySelectorAll('svg rect')].map((r) => r.getAttribute('fill')),
      }
    })
    expect(seen.word).toBe('Deckster')
    expect(seen.px).toBeGreaterThanOrEqual(24)
    expect(seen.fills).toEqual(['#f0b64a', '#7dd3a0', '#f4ead8'])
    // The hand is drawn at least as tall as the name beside it.
    expect(seen.mark[1]).toBeGreaterThanOrEqual(seen.px)
    expect({ aboveHead: seen.aboveHead, inColumn: seen.inColumn, besideFelt: seen.besideFelt }).toEqual({ aboveHead: true, inColumn: true, besideFelt: true })

    // The line costs the stage's card nothing it needs: the card still reads from the sofa beside it.
    if (device === TV) {
      const card = await page.locator('.byd-tv-stage figure > div').boundingBox()
      expect(card!.width * 0.048, `the stage's card ${Math.round(card!.width)} px`).toBeGreaterThanOrEqual(24)
    }
  })
}

// The observer's screen is not the room's (#573): it goes without the line.
test('the observer’s screen goes without the hand', async ({ table, request, open }) => {
  const vera = await join(request, table, { name: 'Vera' })
  const { page } = await open(TV, withQuery(vera.observeUrl, `lang=sv`))
  await expect(page.locator('[data-tv] > aside')).toBeVisible()
  await expect(page.locator('[data-brand]')).toHaveCount(0)
})
