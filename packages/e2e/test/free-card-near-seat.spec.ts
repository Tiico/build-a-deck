import type { Page } from '@playwright/test'
import { withQuery } from '../support/api.js'
import { PHONE } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// A card laid freely from the phone lands in front of the player's place, toward the felt's middle,
// and the television's camera stays where it was (#1368, beställarens beslut 2026-10-25; L47). The
// floor is an area like any other, so «lägg fritt» fanned the card from the floor's own corner: the
// card lay at the felt's far left edge, away from every pile and every seat, and the camera reframed
// to take it in — every plate and card on the screen grew smaller for one card.
//
// The journey as the speltest walked it: three seats, A at the bottom and C at the right, a card
// dealt to the seat's phone and played to the floor through «Spela…», watched on the owner's
// television.
type Box = { l: number; t: number; r: number; b: number; cx: number; cy: number }
const boxOf = (page: Page, css: string): Promise<Box> =>
  page.locator(css).first().evaluate((el) => {
    const r = el.getBoundingClientRect()
    return { l: r.left, t: r.top, r: r.right, b: r.bottom, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }
  })

// Until the felt stands still a few frames in a row: the camera glides to its frame (#325), and the
// plates are laid out again when the felt changes.
async function still(page: Page): Promise<void> {
  const frames = () => page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(ok, 0)))))
  const where = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.byd-pile, .byd-zone, [data-component], [data-seat-plate]')].map((el) => {
        const r = el.getBoundingClientRect()
        return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join()
      }),
    )
  let last = JSON.stringify(await where())
  let same = 0
  for (let i = 0; i < 160; i++) {
    await frames()
    const now = JSON.stringify(await where())
    same = now === last ? same + 1 : 0
    if (same >= 3) return
    last = now
  }
  throw new Error('the felt never stood still')
}

for (const screen of [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
] as const)
  // Seats along a long rim (A, and E beside it at five) and at a side (C).
  for (const [players, seat] of [[3, 'A'], [3, 'C'], [5, 'C'], [5, 'E']] as const)
    test.describe(`a card laid freely from seat ${seat}’s phone at ${players} seats, on the television at ${screen.width} × ${screen.height} (#1368)`, () => {
      test('lands in front of the seat, toward the middle, clear of what the felt draws, and the camera does not reframe', async ({ tableOf, open, player, host }) => {
        const table = await tableOf({ players, counters: [], cards: 8 })
        const { page: tv } = await open({ name: `tv-${screen.width}`, viewport: screen }, withQuery(table.tvUrl, 'lang=sv'), { facesReady: true })
        const sitter = await player(table, { name: 'Ada', seat, device: PHONE })
        const dealer = await host(table)
        await dealer.send([{ v: 'deal', from: 'draw', to: [`hand:${seat}`], each: 1 }])
        const phone = sitter.page
        await expect(phone.locator('[data-hand] [data-hand-card]')).toHaveCount(1)
        const card = await phone.locator('[data-hand] [data-hand-card]').first().getAttribute('data-hand-card')
        expect(card).toBeTruthy()

        const area = `[data-area="mine:${seat}"]`
        await expect(tv.locator(area)).toBeVisible()
        await still(tv)
        const before = { draw: await boxOf(tv, '.byd-pile[data-zone="draw"]'), mine: await boxOf(tv, area) }

        await phone.locator('[data-hand] [data-hand-card]').first().tap()
        await phone.locator('[data-hand-bar]').getByRole('button', { name: /^(Spela…|Play…)$/ }).tap()
        const sheet = phone.getByRole('dialog', { name: /^(Spela till|Play to)$/ })
        // The floor's row, by the floor's own zone: its words are the setup's (#1367).
        await sheet.locator('button[data-zone="table"]').tap()

        const laid = tv.locator(`.byd-card[data-component="${card}"]`)
        await expect(laid).toBeVisible()
        await still(tv)
        const after = { draw: await boxOf(tv, '.byd-pile[data-zone="draw"]'), mine: await boxOf(tv, area), card: await boxOf(tv, `.byd-card[data-component="${card}"]`) }
        await test.info().attach(`${players}-${seat}-${screen.width}.png`, { body: await tv.screenshot(), contentType: 'image/png' })

        // The camera stood still: the pile and the seat's area are where they were, at the size they were.
        for (const k of ['draw', 'mine'] as const)
          for (const side of ['l', 't', 'r', 'b'] as const) expect(Math.abs(after[k][side] - before[k][side]), `${k}.${side} moved`).toBeLessThanOrEqual(1)

        // In front of the seat: across, inside the span of its area; along the way in, between its area
        // and the middle of the felt, which the two piles straddle.
        const middle = { x: (after.draw.cx + (await boxOf(tv, '.byd-pile[data-zone="discard"]')).cx) / 2, y: after.draw.cy }
        if (seat !== 'C') {
          expect(after.card.cx).toBeGreaterThanOrEqual(after.mine.l)
          expect(after.card.cx).toBeLessThanOrEqual(after.mine.r)
          expect(after.card.b, 'the card lies on the middle’s side of the area').toBeLessThanOrEqual(after.mine.t)
          expect(after.card.t, 'and below the middle of the felt').toBeGreaterThan(middle.y)
        } else {
          expect(after.card.cy).toBeGreaterThanOrEqual(after.mine.t)
          expect(after.card.cy).toBeLessThanOrEqual(after.mine.b)
          expect(after.card.r, 'the card lies on the middle’s side of the area').toBeLessThanOrEqual(after.mine.l)
          expect(after.card.l, 'and right of the middle of the felt').toBeGreaterThan(middle.x)
        }

        // And nothing the felt draws in pixels stands on it: no seat's plate, no pile or its words. A
        // card under a plate is a card nobody reads from the sofa. At five seats the band between the
        // piles' words and E's plate is narrower than a card (47 px for a 66 px card at 1920), so no
        // place in millimetres is free there at every screen; what gives way is the beställare's
        // question in #1389, and until it is answered only the placement and the camera are held there.
        if (players === 5 && seat === 'E') return
        const on =await tv.evaluate((id) => {
          const c = document.querySelector(`.byd-card[data-component="${id}"]`)!.getBoundingClientRect()
          return [...document.querySelectorAll('[data-seat-plate], .byd-pile, .byd-pile-n, .byd-pile-name, .byd-pile-caption')].flatMap((el) => {
            const r = el.getBoundingClientRect()
            const over = r.width > 0 && r.left < c.right && c.left < r.right && r.top < c.bottom && c.top < r.bottom
            return over ? [`${el.className} ${el.getAttribute('data-seat-plate') ?? ''}`.trim()] : []
          })
        }, card)
        expect(on).toEqual([])
      })
    })
