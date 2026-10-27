import type { Locator, Page } from '@playwright/test'
import { logIn, makeProject } from '../support/api.js'
import { expect, test } from '../support/test.js'

// Lådan i heron (#1416, L91): Mina spel visar spelets låda i C:s stilla form, bakom lekens första
// kort, först när designern själv har öppnat fliken «Låda». Prövad som designern möter den: heron
// före, fliken i editorn, och heron efter. Lådan är inte ritad, så den är neutral: spelets namn på
// lekens färg, som är kortets baksida i `gameDoc` (#2f4068). Kortets framsida är krämvit (#f4ead8).
//
// På en tät lek, 120 kort, så att lådan är så djup som en riktig (38 mm) och sidan syns: ett litet
// provspel ger en låda som knappt är en låda (sample-deck-hides-density).
const LANG = 'sv-SE'
const DECK = [0x2f, 0x40, 0x68] as const
const CARD = [0xf4, 0xea, 0xd8] as const

const painted = async (page: Page, x: number, y: number): Promise<[number, number, number]> => {
  const shot = (await page.screenshot({ clip: { x, y, width: 1, height: 1 } })).toString('base64')
  return page.evaluate(async (src) => {
    const img = new Image()
    img.src = `data:image/png;base64,${src}`
    await img.decode()
    const c = document.createElement('canvas')
    c.width = 1
    c.height = 1
    const g = c.getContext('2d')!
    g.drawImage(img, 0, 0)
    const [r, gr, b] = g.getImageData(0, 0, 1, 1).data
    return [r!, gr!, b!] as [number, number, number]
  }, shot)
}
const near = (got: readonly number[], want: readonly number[]) => got.every((c, i) => Math.abs(c - want[i]!) <= 12)

// The box behind the card, on the painted pixels: a point inside both the box's front and the card
// shows the card, and a point on the front beside the card shows the box. The second is what keeps
// the first from passing on a box that was never drawn.
async function standsBehind(page: Page, hero: Locator): Promise<void> {
  const front = (await hero.locator('[data-box-face="front"]').boundingBox())!
  const card = (await hero.locator('.byd-home-box-card .byd-home-card').boundingBox())!
  // Low on the card, where its face is its plain ground and no text stands, and inside the front.
  const over = { x: Math.round(card.x + 8), y: Math.round(card.y + card.height * 0.88) }
  expect(over.x).toBeGreaterThan(front.x)
  expect(over.x).toBeLessThan(front.x + front.width)
  expect(over.y).toBeLessThan(front.y + front.height)
  // Low on the front and left of the card, under the name.
  const beside = { x: Math.round(front.x + 10), y: Math.round(front.y + front.height * 0.85) }
  expect(beside.x).toBeLessThan(card.x)
  await expect.poll(async () => near(await painted(page, beside.x, beside.y), DECK), { message: 'the box is painted beside the card' }).toBe(true)
  await expect.poll(async () => near(await painted(page, over.x, over.y), CARD), { message: 'the card is painted over the box' }).toBe(true)
}

test.describe('the box in the hero on Mina spel (#1416)', () => {
  test.use({ viewport: { width: 1280, height: 900 }, locale: LANG })

  test('shows no box until the designer opens «Låda», then stands it still behind the first card', async ({ page }) => {
    await logIn(page.request)
    const game = await makeProject(page.request, { name: 'Skogens herrar', cards: 120 })
    await page.goto('/')
    const hero = page.locator('.byd-home-hero')
    await expect(hero.getByText('Skogens herrar')).toBeVisible()
    await expect(hero.locator('.byd-home-fan-back')).toHaveCount(2)
    await expect(hero.locator('.byd-home-box')).toHaveCount(0)

    // Looking at the editor is not opening the box.
    await page.goto(game.editorUrl)
    await page.getByRole('tab', { name: 'Mall' }).click()
    await page.goto('/')
    await expect(hero.locator('.byd-home-fan-back')).toHaveCount(2)
    await expect(hero.locator('.byd-home-box')).toHaveCount(0)

    await page.goto(game.editorUrl)
    const opened = page.waitForResponse((res) => res.url().endsWith('/box/opened') && res.request().method() === 'POST')
    await page.getByRole('tab', { name: 'Låda' }).click()
    expect((await opened).status()).toBe(204)

    await page.goto('/')
    const box = hero.getByRole('img', { name: 'Lådan till Skogens herrar' })
    await expect(box).toBeVisible()
    await expect(hero.locator('.byd-home-fan-back')).toHaveCount(0)
    await expect(box.locator('[data-box-face] .byd-preview')).toHaveCount(2)
    await expect(hero.getByRole('img', { name: /^Första kortet: / })).toBeVisible()
    await standsBehind(page, hero)

    // Still: nothing turns and nothing moves on Mina spel (L91). The animated box is «Visa upp»'s.
    const still = await box.evaluate((el) => ({
      animations: el.getAnimations({ subtree: true }).length,
      moving: [el, ...el.querySelectorAll('*')].filter((e) => {
        const s = getComputedStyle(e)
        return s.animationName !== 'none' || s.transitionDuration.split(',').some((d) => parseFloat(d) > 0)
      }).length,
    }))
    expect(still).toEqual({ animations: 0, moving: 0 })
    // And the place was the box's from the first screen: the hero's frame is as tall again after a reload
    // as before its faces landed.
    const frame = (await box.boundingBox())!
    await page.reload()
    await expect(box).toBeVisible()
    const first = (await box.boundingBox())!
    expect(first).toEqual(frame)
  })

  for (const width of [320, 375, 1280]) {
    test(`stands the box whole inside the hero at ${width} px, and the page never scrolls sideways`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await logIn(page.request)
      const game = await makeProject(page.request, { name: 'Skogens herrar', cards: 120 })
      await page.request.post(`/projects/${encodeURIComponent(game.id)}/box/opened`)
      await page.goto('/')
      const hero = page.locator('.byd-home-hero')
      const box = hero.getByRole('img', { name: 'Lådan till Skogens herrar' })
      await expect(box.locator('[data-box-face] .byd-preview')).toHaveCount(2)
      const tile = (await hero.locator('.byd-home-game').boundingBox())!
      for (const part of [box.locator('[data-box-face="front"]'), box.locator('[data-box-face="right"]'), box.locator('.byd-home-box-card')]) {
        const r = (await part.boundingBox())!
        expect(r.x).toBeGreaterThanOrEqual(tile.x)
        expect(r.x + r.width).toBeLessThanOrEqual(tile.x + tile.width)
        expect(r.y).toBeGreaterThanOrEqual(tile.y)
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
      await standsBehind(page, hero)
    })
  }
})
