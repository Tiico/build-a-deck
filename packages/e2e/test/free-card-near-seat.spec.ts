import type { Page } from '@playwright/test'
import type { Snapshot } from '@byd/protocol'
import { playIntents } from '../../web/src/player/play.js'
import { withQuery } from '../support/api.js'
import type { Host } from '../support/host.js'
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
        // place in millimetres is free there at every screen, and the plate gives way to the card
        // (#1389, beställarens beslut A 2026-10-26). The whole matrix is measured below.
        const on = await tv.evaluate((id) => {
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

// Every seat's plate gives way to a card lying loose in front of a seat (#1389, beställarens beslut A
// 2026-10-26), as it gives way to the start tile (#1344): the plate looks for its place in #683's
// order, and a loose card is one more thing that place must be free of. The card stays where it
// was laid, and the camera does not move.
//
// The whole matrix the plates are laid out over: two to eight seats, the three televisions, both
// languages, and once more in a face as wide as CI's DejaVu. Every seat plays a card in front of
// itself — what a round of a game where everyone lays a card looks like — so every plate has its
// own card and its neighbours' to keep clear of. The cards are laid by the table's own screen, at
// the very place a seat's phone lays them (`playIntents`, the phone's own rule): the phone's way
// in is the journey above, and this is the given.
//
// Read off what is painted, not off boxes, as #1344 reads the tile: the cards are photographed
// alone, the plates and the piles' words alone, and the felt with neither, and a pixel both
// photographs changed is a pixel where something stands on a card.
const MATRIX = [
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const

// What stands on the felt in pixels and must not stand on a loose card: every seat's plate, and
// every pile with its words.
const WORDS = '[data-seat-plate], .byd-pile, .byd-pile-count, .byd-pile-caption, .byd-pile-n, .byd-pile-name'
const LOOSE = '.byd-card[data-component]:not([data-ghost])'
const WIDE = "[data-seat-plate], [data-seat-plate] *, .byd-pile-count, .byd-pile-count *, .byd-pile-caption { font-family: Verdana, 'DejaVu Sans', sans-serif !important; }"

type Covered = { cards: Record<string, { painted: number; covered: number }>; words: number }

async function covered(page: Page): Promise<Covered> {
  const hide = (css: string) => page.addStyleTag({ content: `${css} { opacity: 0 !important; transition: none !important; animation: none !important; }` })
  const quiet = await page.addStyleTag({ content: `${WORDS}, ${LOOSE} { transition: none !important; animation: none !important; }` })
  const shot = async (): Promise<string> => (await page.screenshot({ scale: 'css', animations: 'disabled' })).toString('base64')
  const offCards = await hide(LOOSE)
  const words = await shot()
  const offWords = await hide(WORDS)
  const neither = await shot()
  await offCards.evaluate((el) => (el as Element).remove())
  const cards = await shot()
  const offAgain = await hide(LOOSE)
  const again = await shot()
  await offAgain.evaluate((el) => (el as Element).remove())
  await offWords.evaluate((el) => (el as Element).remove())
  await quiet.evaluate((el) => (el as Element).remove())
  const boxes = await page.evaluate(
    (css) =>
      [...document.querySelectorAll<HTMLElement>(css)].map((c) => {
        const r = c.getBoundingClientRect()
        return { id: c.dataset['component'] ?? '?', l: r.left, t: r.top, r: r.right, b: r.bottom }
      }),
    LOOSE,
  )
  return page.evaluate(
    async ({ shots, boxes }) => {
      const read = async (src: string) => {
        const img = new Image()
        img.src = `data:image/png;base64,${src}`
        await img.decode()
        const c = document.createElement('canvas')
        c.width = img.naturalWidth
        c.height = img.naturalHeight
        const g = c.getContext('2d')!
        g.drawImage(img, 0, 0)
        return g.getImageData(0, 0, c.width, c.height)
      }
      const [words, neither, cards, again] = (await Promise.all(shots.map(read))) as [ImageData, ImageData, ImageData, ImageData]
      const w = neither.width
      // Changed: a channel moved by more than the felt's own dithering, and not by the felt itself
      // between two photographs of it.
      const apart = (a: ImageData, b: ImageData, i: number) => Math.max(...[0, 1, 2].map((k) => Math.abs(a.data[i + k]! - b.data[i + k]!))) > 12
      const changed = (a: ImageData, i: number) => apart(a, neither, i) && !apart(again, neither, i)
      let wordsPainted = 0
      for (let i = 0; i < words.data.length; i += 4) if (changed(words, i)) wordsPainted++
      const out: Record<string, { painted: number; covered: number }> = {}
      for (const b of boxes) {
        let painted = 0
        let hit = 0
        // A card is read inside its own box: the glow that says who moved it fades, and a plate
        // beside the card's edge leaves the whole card to be read.
        for (let y = Math.max(0, Math.ceil(b.t)); y < Math.min(neither.height, Math.floor(b.b)); y++)
          for (let x = Math.max(0, Math.ceil(b.l)); x < Math.min(w, Math.floor(b.r)); x++) {
            const i = (y * w + x) * 4
            if (!changed(cards, i)) continue
            painted++
            if (changed(words, i)) hit++
          }
        out[b.id] = { painted, covered: hit }
      }
      return { cards: out, words: wordsPainted }
    },
    { shots: [words, neither, cards, again], boxes },
  )
}

// The ack may come before the patch that says what it did, so the table is read until it does.
async function viewWhere(dealer: Host, ok: (v: Snapshot) => boolean): Promise<Snapshot> {
  let view = (await dealer.view()) as unknown as Snapshot
  await expect.poll(async () => ok((view = (await dealer.view()) as unknown as Snapshot)), { timeout: 10_000 }).toBe(true)
  return view
}

// The cards the seats will lay, face up on the discard pile: the table's screen sees no hand, and
// where a card is laid in front of a seat does not depend on where it came from. Dealing starts the
// game, so the start tile has left the felt (#1344) before anything is measured.
async function dealOut(dealer: Host, n: number): Promise<void> {
  await dealer.send([{ v: 'deal', from: 'draw', to: ['discard'], each: n, face: 'front' }])
  await viewWhere(dealer, (v) => v.components.filter((c) => c.zone === 'discard').length === n)
}

// Every seat lays a card in front of itself, one after the other, each at the place its phone would
// lay it with the cards already lying there.
async function everySeatLaysACard(dealer: Host, seats: readonly string[]): Promise<string[]> {
  const viewWhen = (ok: (v: Snapshot) => boolean) => viewWhere(dealer, ok)
  const laid: string[] = []
  for (const seat of seats) {
    const view = await viewWhen((v) => v.components.some((c) => c.zone === 'discard'))
    const card = view.components.find((c) => c.zone === 'discard')!
    await dealer.send(playIntents({ ...view, seat }, [card], view.floor))
    await viewWhen((v) => v.components.some((c) => c.id === card.id && c.zone === v.floor))
    laid.push(card.id)
  }
  return laid
}

for (const screen of MATRIX)
  for (const lang of ['sv', 'en'] as const)
    test.describe(`the seats’ plates beside loose cards on the owner’s television at ${screen.width}, ${lang} (#1389)`, () => {
      for (const players of [2, 3, 4, 5, 6, 7, 8])
        test(`stand on no card laid in front of a seat at ${players} seats, and the camera stays`, async ({ tableOf, open, host }) => {
          const table = await tableOf({ players, counters: [], cards: 16 })
          const { page: tv } = await open({ name: `tv-${screen.width}`, viewport: screen }, withQuery(table.tvUrl, `lang=${lang}`), { facesReady: true })
          await expect(tv.locator('[data-seat-plate]')).toHaveCount(players, { timeout: 20_000 })
          const dealer = await host(table)
          const seats = ((await dealer.view()) as unknown as Snapshot).seats.map((s) => s.id)
          expect(seats).toHaveLength(players)
          await dealOut(dealer, players)
          await still(tv)
          const before = await boxOf(tv, '.byd-pile[data-zone="draw"]')
          const laid = await everySeatLaysACard(dealer, seats)
          await expect(tv.locator(LOOSE)).toHaveCount(players)
          for (const face of ['shipped', 'wide'] as const) {
            if (face === 'wide') await tv.addStyleTag({ content: WIDE })
            await still(tv)
            const where = `${screen.width} × ${screen.height}, ${lang}, ${players} seats, ${face} face`
            const now = await covered(tv)
            await test.info().attach(`${where}.png`, { body: await tv.screenshot(), contentType: 'image/png' })
            // Not vacuous: every card and the plates and words are painted where they were photographed.
            expect(now.words, `${where}: the plates and the piles’ words are painted`).toBeGreaterThan(1000)
            for (const id of laid) expect(now.cards[id]?.painted ?? 0, `${where}: card ${id} is painted`).toBeGreaterThan(1000)
            const on = Object.entries(now.cards).flatMap(([id, c]) => (c.covered > 0 ? [`${id}: ${c.covered} px`] : []))
            expect({ where, on }).toEqual({ where, on: [] })
            // The camera did not reframe for the cards: the draw pile is where it was, at its size.
            const after = await boxOf(tv, '.byd-pile[data-zone="draw"]')
            for (const side of ['l', 't', 'r', 'b'] as const) expect(Math.abs(after[side] - before[side]), `${where}: draw.${side} moved`).toBeLessThanOrEqual(1)
          }
        })
    })

// The plate gives way to a loose card only while the card lies there: once it is taken back, the
// plate goes home again, as it does when the start tile leaves (#1344).
test.describe('a plate that gave way to a loose card (#1389)', () => {
  test('goes back to its own place when the card is taken away', async ({ tableOf, open, host }) => {
    const screen = { width: 1920, height: 1080 }
    const table = await tableOf({ players: 5, counters: [], cards: 16 })
    const { page: tv } = await open({ name: 'tv-1920', viewport: screen }, withQuery(table.tvUrl, 'lang=sv'), { facesReady: true })
    // Where E's plate stands, as a place in #683's order and as a box on the screen.
    const plateOf = () =>
      tv.locator('[data-seat-plate="E"]').evaluate((p) => {
        const r = p.getBoundingClientRect()
        return `${p.getAttribute('data-plate-at')} ${Math.round(r.left)},${Math.round(r.top)}`
      })
    await expect(tv.locator('[data-seat-plate]')).toHaveCount(5, { timeout: 20_000 })
    const dealer = await host(table)
    await dealOut(dealer, 1)
    await still(tv)
    const home = await plateOf()
    const [card] = await everySeatLaysACard(dealer, ['E'])
    await expect(tv.locator(LOOSE)).toHaveCount(1)
    await still(tv)
    expect(await plateOf(), 'E’s plate gave way to the card').not.toBe(home)
    await dealer.send([{ v: 'move', component: card!, to: 'discard' }])
    await expect(tv.locator(LOOSE)).toHaveCount(0)
    await still(tv)
    expect(await plateOf(), 'and went home when it was taken away').toBe(home)
  })
})
