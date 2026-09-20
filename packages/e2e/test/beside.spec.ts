import type { APIRequestContext, Page } from '@playwright/test'
import type { ZoneBeside } from '@byd/protocol'
import { deckFromProject } from '@byd/server'
import { setupFromProject } from '@byd/server/doc'
import { tableOf as tableFromSetup, type Table } from '../support/api.js'
import { TV } from '../support/devices.js'
import { gameDoc } from '../support/game.js'
import { expect, test } from '../support/test.js'

// Where a card that leaves a pile comes to rest, measured on the screen (K14, K21, #87, #314).
//
// `besidePile` works in table millimetres and is already measured in `packages/web/test/drop.ts`.
// What that arithmetic cannot know is how the pile is *drawn*: the felt gives a pile thickness,
// so the card one sees on top of it may stand some way off the point the pile lies on, and by a
// distance that grows with the pile. Two real rectangles in an engine that lays things out is
// the only way to see that, and #314 asked for the measurement before the fix for that reason.
// It found what it looked for: beside a pile of ten the card sat 10.7 px low, beside sixty
// 13.1 px, and beside one it was already in line.
type Box = { left: number; top: number; right: number; bottom: number }

// The sizes are the issue's. A pile of one has no thickness at all, ten is in the middle of the
// staircase, and sixty is past the ceiling the drawing puts on it. One card is drawn off each
// pile, so every table starts with one card more than it is measured with.
const SIZES = [1, 10, 60] as const

test.describe('the card that leaves a pile lies in line with it', () => {
  for (const left of SIZES) {
    // On the table screen, which is where it was seen: a felt drawn in perspective, tilted
    // thirteen degrees away from the reader. Two edges the same distance up that felt still land
    // on the same row of pixels, so this reads as plainly there as anywhere.
    test(`its top edge follows the top card of a pile of ${left}`, async ({ tableOf, open }) => {
      // One row in the deck, printed in as many copies as the pile is to hold: what is drawn on
      // the faces is not what is measured here, and one row is one texture instead of sixty.
      const table = await tableOf({ players: 2, counters: [], cards: 1, copies: left + 1 })
      const seen = await drawOne(open, table.tableUrl, left)
      // A pile means its own left unless it says otherwise, so it is the top edges that have to
      // meet; the distance sideways is `BESIDE_MM` and not this question.
      expect(Math.abs(seen.card.top - seen.top.top), `a pile of ${left}: the card's top edge against the top card's`).toBeLessThanOrEqual(1)
    })
  }

  // The same fact on every side a pile can name (K21) and on a pile that has been turned.
  //
  // Two things change here. An edge is the wrong thing to compare — beside a pile that says
  // `above` the card stands over it rather than next to it, and a pile turned a quarter round is
  // drawn as a rectangle lying on its side — so what is read is the line itself: the two centres
  // agree across the direction the card travelled, which is all an edge meant on two boxes of
  // one height.
  //
  // And it is read on the television, where the felt lies flat. The table screen's tilt is a
  // perspective and not a scale: two boxes at *different* distances up the felt are drawn at
  // different sizes and pulled different amounts toward the vanishing point, so a card above a
  // pile is legitimately not over it in pixels. That is the drawing being right, and a test that
  // called it wrong would be a test about the tilt. Flat, the pixels are the felt.
  const TURNS = [0, 90] as const
  const SIDES: ZoneBeside[] = ['left', 'right', 'above', 'below']
  for (const rot of TURNS) {
    for (const side of SIDES) {
      test(`lies square with a pile of 60 that says ${side}${rot === 0 ? '' : `, turned ${rot}°`}`, async ({ request, open }) => {
        const table = await pileTable(request, { side, rot, cards: 61 })
        const seen = await drawOne(open, table.tvUrl, 60)
        const across = acrossOf(rot, side)
        const middle = (b: Box) => (across === 'y' ? (b.top + b.bottom) / 2 : (b.left + b.right) / 2)
        expect(Math.abs(middle(seen.card) - middle(seen.top)), `the card's centre across ${across} against the top card's`).toBeLessThanOrEqual(1)
      })
    }
  }
})

/**
 * A table whose draw pile lies the way this test wants it, made the way every table is made.
 *
 * The document goes through `setupFromProject` and `deckFromProject` exactly as `makeTable` sends
 * it; only the one zone is turned first. Writing the setup out by hand instead would be writing a
 * table the editor cannot produce, and the side and the rotation are both the editor's own knobs.
 */
async function pileTable(request: APIRequestContext, { side, rot, cards }: { side: ZoneBeside; rot: number; cards: number }): Promise<Table> {
  const doc = gameDoc({ players: 2, counters: [], cards: 1, copies: cards })
  const turned = { ...doc, setup: { ...doc.setup, zones: doc.setup.zones.map((z) => (z.id === 'draw' ? { ...z, beside: side, geometry: { ...z.geometry, rot } } : z)) } }
  return tableFromSetup(request, setupFromProject(turned), deckFromProject(turned))
}

/** The big screen, one card taken off the deck through the ring, and the two boxes that leaves. */
async function drawOne(open: (device: typeof TV, url: string) => Promise<{ page: Page }>, url: string, left: number): Promise<{ top: Box; card: Box }> {
  const { page } = await open(TV, `${url}&lang=sv`)
  const pile = page.locator('.byd-pile[data-zone="draw"]')
  await expect(pile, 'the whole deck is in the draw pile before anything is taken off it').toHaveAttribute('data-count', String(left + 1))
  // The way a person gets there: press the pile, take Dra 1 out of the ring (K14).
  await pile.locator('.byd-pile-top').click()
  await page.getByRole('button', { name: 'Dra 1' }).click()
  await expect(pile).toHaveAttribute('data-count', String(left))
  await expect(page.locator('.byd-card[data-component]'), 'one loose card is on the felt').toHaveCount(1)
  return measure(page)
}

/**
 * Which axis the card did *not* travel along, and therefore the one it has to stay on.
 *
 * The side is read in the pile's own rotation (K21), so a pile turned a quarter round sends its
 * `left` straight up the screen. The numbers are `SIDES` in `packages/web/src/table/drop.ts`,
 * which is the one place that decides what a side means.
 */
function acrossOf(rot: number, side: ZoneBeside): 'x' | 'y' {
  const away: Record<ZoneBeside, number> = { left: 180, right: 0, above: -90, below: 90 }
  return (((rot + away[side]) % 180) + 180) % 180 === 0 ? 'y' : 'x'
}

/**
 * The two rectangles, as the browser itself gives them.
 *
 * `getBoundingClientRect` and not arithmetic over the styles: a `transform` is in the rectangle
 * and not in the box the styles describe, and a transform is precisely what this is about.
 */
async function measure(page: Page): Promise<{ top: Box; card: Box }> {
  return page.evaluate(() => {
    const box = (el: Element | null, what: string): Box => {
      if (!el) throw new Error(`${what} is not on the felt, so nothing is measured`)
      const r = el.getBoundingClientRect()
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
    }
    return {
      top: box(document.querySelector('.byd-pile[data-zone="draw"] .byd-pile-top'), "the pile's top card"),
      card: box(document.querySelector('.byd-card[data-component]'), 'the loose card'),
    }
  })
}
