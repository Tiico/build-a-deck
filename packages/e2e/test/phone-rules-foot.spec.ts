import { tableWithRules } from '../support/api.js'
import { expect, test } from '../support/test.js'

// Where «Regler» stands on the phone (#483, fynd 9; beställarens beslut C efter prototyp 32). In the
// head it made the row two rows (107 px) already at 390 and covered «Stäng reglerna»; it now has a
// bar of its own at the foot, by the hand, and the head is what it is without a rulebook. The
// player's name gives way first: it shrinks behind an ellipsis rather than pushing a row down.
for (const [width, height] of [
  [390, 844],
  [320, 568],
] as const) {
  test(`keeps the head to one row and «Regler» a whole target at the foot, at ${width}`, async ({ request, player }) => {
    const table = await tableWithRules(request, { players: 2 })
    const bea = await player(table, { name: 'Margareta Ekström', seat: table.seats[0]!, device: { name: 'phone', viewport: { width, height }, hasTouch: true, isMobile: true } })
    const rules = bea.page.getByRole('button', { name: 'Rules', exact: true })
    await expect(rules).toBeVisible()
    // Measured with the name the seat was claimed under standing in the head, which is what makes it long.
    await expect(bea.page.locator('.byd-player > header strong')).toHaveText('Margareta Ekström')
    const read = await bea.page.evaluate(() => {
      const head = document.querySelector('.byd-player > header')!.getBoundingClientRect()
      const knob = document.querySelector('.byd-rules-open')!
      const box = knob.getBoundingClientRect()
      return { head: Math.round(head.height), inHead: knob.closest('header') !== null, h: Math.round(box.height), bottom: Math.round(window.innerHeight - box.bottom) }
    })
    expect(read.inHead, '«Regler» is not in the head').toBe(false)
    expect(read.h).toBeGreaterThanOrEqual(44)
    expect(read.bottom, 'the bar sits at the foot of the screen').toBeLessThan(24)
    if (width === 390) expect(read.head, 'one row at 390, however long the name').toBeLessThanOrEqual(60)
  })
}
