import { TV } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// Every word on the room's television is at K26's floor of 24 px (#573, beslut C; K26 förtydligad
// 2026-09-29): the room reads it from three metres. Each seat's words are on one plate beside its
// zones; the plates cover neither the piles nor each other, and K9's card is the size it was.
//
// A card's own face is not chrome: it is drawn at the felt's scale and read through INSPEKTION or
// «Visa för alla» (K26: what is drawn at rest may be unreadable when the reading is one action away).
for (const players of [2, 4, 8]) {
  test(`no word on the television is under 24 px at ${players} seats, and the plates cover nothing`, async ({ tableOf, host, open }) => {
    const table = await tableOf({ players, counters: [{ name: 'Poäng', start: 0 }], cards: 30, copies: 1 })
    const dealer = await host(table)
    await dealer.send([{ v: 'draw', from: 'draw', to: 'table', count: 2 }, { v: 'deal', from: 'draw', to: ['hand:A'], each: 2 }])
    const { page } = await open(TV, `${table.tvUrl}&lang=sv`)
    await expect(page.locator('.byd-card[data-component]').first()).toBeVisible()
    await expect(page.locator('[data-seat-plate]')).toHaveCount(players)
    await expect(page.locator('[data-seat-plate="A"]')).toContainText('2 kort')

    const small = await page.evaluate(() => {
      const out: string[] = []
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = n.textContent?.trim()
        const el = n.parentElement
        if (!text || !el || el.closest('.byd-card, [data-texture], .byd-hand-card, [data-inspect]')) continue
        const r = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden') continue
        const px = parseFloat(cs.fontSize)
        if (px < 24) out.push(`${text.slice(0, 30)} (${px} px)`)
      }
      return out
    })
    expect(small).toEqual([])

    const overlaps = await page.evaluate(() => {
      const box = (el: Element) => el.getBoundingClientRect()
      const meet = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
      const plates = [...document.querySelectorAll('[data-seat-plate]')]
      const others = [...document.querySelectorAll('.byd-pile, .byd-pile-name, [data-seat-plate]')]
      const out: string[] = []
      for (const p of plates) for (const o of others) if (o !== p && meet(box(p), box(o))) out.push(`${p.getAttribute('data-seat-plate')} × ${o.getAttribute('data-seat-plate') ?? o.className}`)
      return out
    })
    expect(overlaps).toEqual([])

    // K9: a card on the felt is at least 45 px, as it was before the plates.
    const card = (await page.locator('.byd-card[data-component]').first().boundingBox())!
    expect(Math.min(card.width, card.height)).toBeGreaterThanOrEqual(45)
  })
}
