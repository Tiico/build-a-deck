import { tableWithRules } from '../support/api.js'
import { expect, test } from '../support/test.js'

// Where «Regler» stands on the phone (#483, fynd 9; #1147). In the head it made the row two rows
// (107 px) already at 390 and covered «Stäng reglerna»; it then had a bar of its own at the foot,
// and since the tabs it is a row in «Mer», with the flag and the way out. The head is what it is
// without a rulebook: the player's name gives way first, behind an ellipsis, rather than pushing a
// row down.
for (const [width, height] of [
  [390, 844],
  [320, 568],
] as const) {
  test(`keeps the head to one row and «Regler» a whole row in «Mer», at ${width}`, async ({ request, player }) => {
    const table = await tableWithRules(request, { players: 2 })
    const bea = await player(table, { name: 'Margareta Ekström', seat: table.seats[0]!, device: { name: 'phone', viewport: { width, height }, hasTouch: true, isMobile: true } })
    // Measured with the name the seat was claimed under standing in the head, which is what makes it long.
    await expect(bea.page.locator('.byd-player > header strong')).toHaveText('Margareta Ekström')
    await bea.page.getByRole('tab', { name: /^More/ }).tap()
    const rules = bea.page.getByRole('button', { name: 'Rules', exact: true })
    await expect(rules).toBeVisible()
    const read = await bea.page.evaluate(() => {
      const head = document.querySelector('.byd-player > header')!.getBoundingClientRect()
      const knob = document.querySelector('.byd-rules-open')!
      const box = knob.getBoundingClientRect()
      return { head: Math.round(head.height), inHead: knob.closest('header') !== null, inMore: knob.closest('[data-panel="more"]') !== null, h: Math.round(box.height), w: Math.round(box.width) }
    })
    expect(read.inHead, '«Regler» is not in the head').toBe(false)
    expect(read.inMore, '«Regler» is in «Mer»').toBe(true)
    expect(read.h).toBeGreaterThanOrEqual(44)
    expect(read.w, 'a row the width of the panel').toBeGreaterThanOrEqual(width - 40)
    if (width === 390) expect(read.head, 'one row at 390, however long the name').toBeLessThanOrEqual(60)
    // And it opens.
    await rules.tap()
    await expect(bea.page.getByRole('dialog', { name: 'Rules' })).toBeVisible()
  })
}
