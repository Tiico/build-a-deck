import type { APIRequestContext, Page } from '@playwright/test'
import { deckFromProject } from '@byd/server'
import { setupFromProject } from '@byd/server/doc'
import { join, tableOf as tableFromSetup, type Table } from '../../support/api.js'
import { SMALL_TV, type Device } from '../../support/devices.js'
import { gameDoc } from '../../support/game.js'
import { expect, test } from '../../support/test.js'

// A label on a turned felt stands where it belongs (#885, C5).
//
// A felt turned so that the reader's own edge is at the bottom turns everything on it, and the
// labels on it are turned back upright with `rotate: var(--unrotate)`. CSS's `rotate` turns what
// `transform` has already moved, but not what `translate` moves: a label centred with
// `transform: translate(-50%, …)` has its own centring turned with it, and on a felt turned half a
// turn it stands a whole label's width — and height — off what it labels. The pile's handle had
// it and was put right in #789; these are the two others in the same list.
//
// - The count in the middle of an area the reader may not look into (#414).
// - The name tag under a card someone else is carrying (K6).
// - Each seat's name along its own edge (#418), which stood a whole name's width along the edge
//   from its hand on the same felt, and was found while measuring the two above.
//
// What is asserted is where the label's centre stands relative to what it labels, as the painted
// boxes say: the area's middle, and the carried card's axis. Rectangles, not font pixels (#95).
// The felt's tilt bends a millimetre or two; a label turned with its centring is a whole label
// off, which is twenty pixels and more.

const TOLERANCE = 4

// An upright window wide enough to get a board at all: 960 is the narrowest that does (#484).
const UPRIGHT: Device = { name: 'upright', viewport: { width: 1080, height: 1440 } }

/**
 * The screens and seats the felt is turned for. Seat A sits at the bottom edge and nothing turns;
 * seat B sits at the far edge and the felt is turned half a turn in every window. A side seat's
 * quarter turn is kept only where the window is standing up too (C5, C8). `area` is an area the
 * seat may not look into, so the felt shows it only a count.
 */
const VIEWS: readonly { seat: string; device: Device; rotate: string; area: string }[] = [
  { seat: 'A', device: SMALL_TV, rotate: '0', area: 'mine:B' },
  { seat: 'B', device: SMALL_TV, rotate: '180', area: 'mine:A' },
  { seat: 'C', device: UPRIGHT, rotate: '90', area: 'mine:A' },
  { seat: 'D', device: UPRIGHT, rotate: '270', area: 'mine:A' },
]

/** The opening table with A's and B's areas kept to their owners (#414, decision B). */
async function tableWithPrivateAreas(request: APIRequestContext): Promise<Table> {
  const doc = gameDoc({ players: 4, cards: 16 })
  const kept = { ...doc, setup: { ...doc.setup, zones: doc.setup.zones.map((z) => (z.id === 'mine:A' || z.id === 'mine:B' ? { ...z, visibility: 'owner' as const } : z)) } }
  return tableFromSetup(request, setupFromProject(kept), deckFromProject(kept))
}

/** Waits until the felt has stopped gliding: the camera moves to what is in play. */
async function still(page: Page, selector: string): Promise<void> {
  await page.waitForFunction((selector) => {
    const el = document.querySelector(selector)
    if (!el) return false
    const w = window as unknown as { __last?: string; __still?: number }
    const now = JSON.stringify(el.getBoundingClientRect())
    w.__still = now === w.__last ? (w.__still ?? 0) + 1 : 0
    w.__last = now
    return w.__still >= 5
  }, selector, { polling: 100, timeout: 10_000 })
}

/**
 * Where the label's centre stands from the centre of what it labels, in screen pixels, split into
 * along and across the felt's own «down» as the screen shows it. A label that hangs under its
 * card is *along* that line and never *across* it.
 */
function offset(page: Page, label: string, owner: string, rotate: string): Promise<{ along: number; across: number }> {
  return page.evaluate(
    ({ label, owner, rotate }) => {
      const mid = (el: Element) => {
        const r = el.getBoundingClientRect()
        return [r.left + r.width / 2, r.top + r.height / 2] as const
      }
      const [lx, ly] = mid(document.querySelector(label)!)
      const [ox, oy] = mid(document.querySelector(owner)!)
      const dx = lx - ox
      const dy = ly - oy
      // The felt's «down», turned by the felt: half a turn points it up the screen, a quarter
      // (clockwise) points it to the left.
      const a = (Number(rotate) * Math.PI) / 180
      const [downX, downY] = [-Math.sin(a), Math.cos(a)]
      return { along: dx * downX + dy * downY, across: dx * downY - dy * downX }
    },
    { label, owner, rotate },
  )
}

for (const v of VIEWS) {
  test.describe(`seat ${v.seat} on /online, the felt turned ${v.rotate}° (#885)`, () => {
    test("an area's count stands in the middle of the area", async ({ request, host, open }) => {
      const table = await tableWithPrivateAreas(request)
      const dealer = await host(table)
      await dealer.send([{ v: 'deal', from: 'draw', to: [v.area], each: 3, face: 'back' } as never])
      const { page } = await open(v.device, (await joinAt(request, table, v.seat)).onlineUrl)
      await expect(page.locator('[data-table]')).toHaveAttribute('data-rotate', v.rotate)
      const area = `[data-area="${v.area}"]`
      const count = page.locator(`${area} [data-area-count]`)
      // Non-vacuity: this seat may not look into the area, so the count is what it is shown.
      await expect(count).toHaveText('3')
      await still(page, `${area} [data-area-count]`)
      const at = await offset(page, `${area} [data-area-count]`, area, v.rotate)
      expect(Math.abs(at.along), `along: ${JSON.stringify(at)}`).toBeLessThan(TOLERANCE)
      expect(Math.abs(at.across), `across: ${JSON.stringify(at)}`).toBeLessThan(TOLERANCE)
    })

    test("a carried card's name tag hangs on the card's own axis", async ({ request, host, open }) => {
      const table = await tableWithPrivateAreas(request)
      const dealer = await host(table)
      await dealer.send([{ v: 'deal', from: 'draw', to: ['discard'], each: 1, face: 'front' } as never])
      const seen = (await dealer.view()) as unknown as { floor: string; zones: { id: string; geometry: { x: number; y: number; w: number; h: number } }[]; components: { id: string; zone: string }[] }
      const card = seen.components.find((c) => c.zone === 'discard')!
      const floor = seen.zones.find((z) => z.id === seen.floor)!.geometry
      const { page } = await open(v.device, (await joinAt(request, table, v.seat)).onlineUrl)
      await expect(page.locator('[data-table]')).toHaveAttribute('data-rotate', v.rotate)
      // The table's own screen carries the card over the middle of the felt.
      const ghost = page.locator(`.byd-peer-ghost[data-component="${card.id}"]`)
      await expect
        .poll(async () => {
          dealer.presence({ kind: 'drag', component: card.id, x: floor.x + floor.w / 2, y: floor.y + floor.h / 2 })
          return ghost.count()
        })
        .toBe(1)
      await expect(ghost.locator('.byd-peer-tag')).toBeVisible()
      await still(page, '.byd-peer-ghost .byd-peer-tag')
      const at = await offset(page, '.byd-peer-ghost .byd-peer-tag', '.byd-peer-ghost', v.rotate)
      // Under the card, as the felt sees it…
      expect(at.along, `along: ${JSON.stringify(at)}`).toBeGreaterThan(0)
      // …and on its axis rather than a tag's width beside it.
      expect(Math.abs(at.across), `across: ${JSON.stringify(at)}`).toBeLessThan(TOLERANCE)
    })

    test("every seat's name stands along its edge where that seat's hand is", async ({ request, open }) => {
      const table = await tableWithPrivateAreas(request)
      const { page } = await open(v.device, (await joinAt(request, table, v.seat)).onlineUrl)
      await expect(page.locator('[data-table]')).toHaveAttribute('data-rotate', v.rotate)
      // Non-vacuity: a felt that knows who is looking reads every name for them (#418).
      await expect(page.locator('.byd-seat-name[data-read]')).toHaveCount(4)
      await still(page, '.byd-seat-name[data-read]')
      for (const seat of ['A', 'B', 'C', 'D']) {
        const name = `.byd-seat-name[data-seat-name="${seat}"]`
        const edge = await page.locator(name).getAttribute('data-edge')
        const at = await offset(page, name, `.byd-hand[data-zone="hand:${seat}"]`, v.rotate)
        // Along its edge, which is the felt's across for the near and far edges and its along for
        // the sides. Out from the rim it stands where its edge puts it, which is not this.
        const along = edge === 'N' || edge === 'S' ? at.across : at.along
        expect(Math.abs(along), `${seat}'s name at the ${edge} edge: ${JSON.stringify(at)}`).toBeLessThan(TOLERANCE)
      }
    })
  })
}

const joinAt = (request: APIRequestContext, table: Table, seat: string) => join(request, table, { name: `Plats ${seat}`, seat })
