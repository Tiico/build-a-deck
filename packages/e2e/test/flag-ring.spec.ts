import type { Locator, Page } from '@playwright/test'
import { join, logIn, makeProjectOf, startTable, withQuery } from '../support/api.js'
import { gameDoc } from '../support/game.js'
import { expect, test } from '../support/test.js'

// The card a flag is about keeps its ring while the panel stands (#1397, the approved prototype
// `play-arken.html?v=A`, the surface Flagga). Until then only the card under the pointer was
// ringed, so once the mouse had gone to the note nothing on the table said which card the flag
// was about. Measured on /play at a desk (#1376) and on /online (#1255), on a card in the hand,
// on a card in a target and on a pile whose top lies face up, with the mouse in the panel.
//
// The ring is read off the painted pixels and not off a declaration: a pixel of the ring is one
// that is painted in the flag's colour, lies on no card and was not that colour before the card
// was pointed out, and its ground is what that very pixel was before. A ring has to reach WCAG
// 1.4.11's 3:1 against the felt, the hand's ground and a target's, wherever it is drawn.

const CARDS = '[data-component], [data-hand-card], [data-area-card], [data-mine-card]'

// Where a card is pressed: its top left corner, which is the part a fanned hand and a column of
// cards leave showing.
const CORNER = { x: 8, y: 8 }

type Rgb = [number, number, number]
type Ring = { count: number; was: number; contrast: number[] }

const shoot = async (page: Page) => (await page.screenshot({ scale: 'css', animations: 'disabled', caret: 'hide' })).toString('base64')

// The pixels in and around `box` that are painted in `ring`'s colour and lie on no card and not in
// the panel; how many of them already were before, in `before`; and each one's contrast against
// what it was before.
const ringAround = async (page: Page, target: Locator, ring: Rgb, before: string | null): Promise<Ring> => {
  const box = (await target.boundingBox())!
  const after = await shoot(page)
  return page.evaluate(
    async ({ before, after, box, ring, cards }) => {
      const read = async (b64: string) => {
        const img = new Image()
        img.src = `data:image/png;base64,${b64}`
        await img.decode()
        const c = document.createElement('canvas')
        c.width = img.width
        c.height = img.height
        const g = c.getContext('2d')!
        g.drawImage(img, 0, 0)
        return g.getImageData(0, 0, c.width, c.height)
      }
      const now = await read(after)
      const then = before ? await read(before) : null
      const at = (d: ImageData, x: number, y: number): [number, number, number] => {
        const i = (y * d.width + x) * 4
        return [d.data[i]!, d.data[i + 1]!, d.data[i + 2]!]
      }
      const near = (p: number[], q: number[]) => Math.max(...p.map((v, i) => Math.abs(v - q[i]!))) <= 24
      const lum = (p: number[]) => {
        const [r, g, b] = p.map((v) => {
          const s = v / 255
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
        })
        return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
      }
      const ratio = (p: number[], q: number[]) => {
        const [hi, lo] = [lum(p), lum(q)].sort((a, b) => b - a)
        return (hi! + 0.05) / (lo! + 0.05)
      }
      let count = 0
      let was = 0
      const contrast: number[] = []
      const x0 = Math.max(0, Math.floor(box.x) - 12)
      const y0 = Math.max(0, Math.floor(box.y) - 12)
      const x1 = Math.min(now.width - 1, Math.ceil(box.x + box.width) + 12)
      const y1 = Math.min(now.height - 1, Math.ceil(box.y + box.height) + 12)
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const hit = document.elementFromPoint(x + 0.5, y + 0.5)
          if (!hit || hit.closest(cards) || hit.closest('.byd-flag-panel')) continue
          const p = at(now, x, y)
          if (!near(p, ring)) continue
          if (then && near(at(then, x, y), ring)) {
            was++
            continue
          }
          count++
          if (then) contrast.push(ratio(p, at(then, x, y)))
        }
      return { count, was, contrast: contrast.sort((a, b) => a - b) }
    },
    { before, after, box, ring, cards: CARDS },
  )
}

// The flag's colour, as the panel's own «Flagga» paints it.
const flagColour = (page: Page): Promise<Rgb> =>
  page.locator('.byd-flag-panel-foot button[data-kind="flag"]').evaluate((el) => getComputedStyle(el).backgroundColor.match(/\d+/g)!.slice(0, 3).map(Number) as Rgb)

// A ring drawn round the card: at least a card's height of it, nothing of the colour there before,
// and the darkest twentieth of it still at 3:1 against what lies under it.
const ringed = async (page: Page, target: Locator, ring: Rgb, before: string, what: string) => {
  const box = (await target.boundingBox())!
  await expect.poll(async () => (await ringAround(page, target, ring, before)).count, { message: `a ring round ${what}` }).toBeGreaterThan(box.height)
  const got = await ringAround(page, target, ring, before)
  expect(got.was, `${what}: nothing of the flag's colour lay there before`).toBe(0)
  const low = got.contrast[Math.floor(got.contrast.length / 20)]!
  expect(low, `${what}: the ring against its ground`).toBeGreaterThanOrEqual(3)
}

const bare = async (page: Page, target: Locator, ring: Rgb, what: string) => {
  await expect.poll(async () => (await ringAround(page, target, ring, null)).count, { message: `no ring round ${what}` }).toBeLessThan(4)
}

type Surface = {
  route: 'playUrl' | 'onlineUrl'
  hand: (id: string) => string
  target: (id: string) => string
  pile: (id: string) => string
}

const surfaces: Surface[] = [
  { route: 'playUrl', hand: (id) => (id ? `[data-hand-row] [data-hand-card="${id}"]` : '[data-hand-row] [data-hand-card]'), target: (id) => `.byd-desk-targets [data-area-card="${id}"]`, pile: (id) => `.byd-desk-top[data-component="${id}"]` },
  { route: 'onlineUrl', hand: (id) => (id ? `[data-hand-card="${id}"]` : '[data-hand-card]'), target: (id) => `.byd-card[data-component="${id}"]`, pile: () => '.byd-pile[data-zone="discard"] .byd-pile-top' },
]

for (const surface of surfaces) {
  const name = surface.route === 'playUrl' ? '/play' : '/online'
  test(`${name}: the card a flag is about keeps its ring until the flag is sent or cancelled`, async ({ request, open, host }) => {
    await logIn(request)
    const doc = gameDoc({ name: 'Skogens råd', players: 2, cards: 10 })
    const project = await makeProjectOf(request, doc)
    const table = { ...(await startTable(request, project.id, 'screen')), seats: doc.setup.seats }
    const dealer = await host(table)
    await dealer.send([{ v: 'deal', from: 'draw', to: ['hand:A'], each: 4 } as never])
    await dealer.send([{ v: 'draw', from: 'draw', to: 'discard', count: 1, face: 'front' } as never])
    await dealer.send([{ v: 'draw', from: 'draw', to: 'mine:A', count: 1, face: 'front' } as never])
    // The host's view follows the table, so it is read once the moves have reached it. A hand is
    // hidden from it, so the hand's card is found on the page.
    const dealt = async () => {
      const v = await dealer.view()
      return v.components.some((c) => c.zone === 'mine:A') && v.components.some((c) => c.zone === 'discard')
    }
    await expect.poll(dealt).toBe(true)
    const seen = await dealer.view()
    const onTarget = seen.components.find((c) => c.zone === 'mine:A')!.id
    const onPile = seen.components.find((c) => c.zone === 'discard')!.id
    const seat = await join(request, table, { name: 'Kim', seat: 'A' })
    const { page } = await open({ name: 'desk', viewport: { width: 1280, height: 800 } }, withQuery(seat[surface.route], 'lang=sv'), { facesReady: true })

    await expect(page.locator(surface.hand('')).locator('visible=true')).toHaveCount(4)
    const inHand = (await page.locator(surface.hand('')).locator('visible=true').nth(1).getAttribute('data-hand-card'))!
    const hand = page.locator(surface.hand(inHand)).locator('visible=true').first()
    const target = page.locator(surface.target(onTarget)).locator('visible=true').first()
    const pile = page.locator(surface.pile(onPile)).locator('visible=true').first()
    await expect(hand).toBeVisible()
    await expect(target).toBeVisible()
    await expect(pile).toBeVisible()

    const flagButton = page.getByRole('button', { name: /^Flagga/ }).first()
    await flagButton.click()
    const panel = page.getByRole('dialog', { name: 'Flagga' })
    await expect(panel).toBeVisible()
    const ring = await flagColour(page)
    // The mouse rests in the panel, on its heading, as it does while the note is written.
    const rest = () => panel.getByRole('heading', { name: 'Flagga' }).hover()
    await rest()
    const before = await shoot(page)

    // Pointed out, a card keeps its ring with the mouse gone; pointing out another moves it there.
    for (const [card, what] of [
      [hand, 'a card in the hand'],
      [target, 'a card in a target'],
      [pile, 'the face up top of a pile'],
    ] as const) {
      await card.click({ position: CORNER })
      await rest()
      await ringed(page, card, ring, before, what)
    }
    await bare(page, hand, ring, 'the hand card once another card is pointed out')
    await bare(page, target, ring, 'the target card once another card is pointed out')

    // Dropping the card from the flag drops its ring.
    await panel.getByRole('button', { name: 'Ta bort kortet' }).click()
    await bare(page, pile, ring, 'the pile once the card is dropped from the flag')

    // Cancelled: the panel goes, and the ring with it.
    await hand.click({ position: CORNER })
    await rest()
    await ringed(page, hand, ring, before, 'a card in the hand, pointed out again')
    await panel.getByRole('button', { name: 'Avbryt' }).click()
    await expect(panel).toHaveCount(0)
    await page.mouse.move(2, 2)
    await bare(page, hand, ring, 'the hand card once the flag is cancelled')

    // Sent: the same.
    await flagButton.click()
    await expect(panel).toBeVisible()
    await rest()
    const again = await shoot(page)
    await target.click({ position: CORNER })
    await rest()
    await ringed(page, target, ring, again, 'a card in a target, in a new panel')
    await panel.getByRole('textbox').fill('Det här kortet vinner alltid')
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter')
    await expect(panel).toHaveCount(0)
    await page.mouse.move(2, 2)
    await bare(page, target, ring, 'the target card once the flag is sent')
  })
}
