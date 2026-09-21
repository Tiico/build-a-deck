import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { logIn, makeProject } from '../../support/api.js'

// The way in, at the widths the audit checks. `/` is the first screen a creator ever sees and the
// last one they come back to, and it was the only route with no measured check of its own — which
// is how a 28 px language picker and a 16 px way out reached it (UX-kontroll 2026-09-10).
//
// Migrated from `packages/web/test/account-viewport.test.tsx`. That version mounted `HomePage`
// into jsdom against an in-process server, lifted the markup out, pasted three stylesheets around
// it and measured the result. This opens the page. The two shapes `/` has are reached the way a
// person reaches them — not logged in, and logged in with a game — so what is measured is the
// route, its own wrapper, and the stylesheet the build emitted, rather than a reconstruction of
// all three.
// Measured in Swedish, said here rather than assumed. The old version got Swedish for free:
// jsdom asks for no language, and a surface mounted with none speaks the catalogue's own (A4). A
// real browser asks for the machine's, so the same test in Chromium was reading an English page —
// and a hit area is a measurement of a word, so which language it is written in is part of the
// fact. This is the language the 2026-09-10 audit was made in.
const LANG = 'sv-SE'

const WIDTHS = [390, 768, 1024] as const
const TARGETS = 'button, a[href], input, select, textarea'

/** Every control the page draws that is smaller than a fingertip, named so a failure says which. */
const tooSmall = (page: Page) =>
  page.$$eval(TARGETS, (els) =>
    els
      .filter((el) => el.checkVisibility())
      .map((el) => {
        // A control inside a label is as big as the label: that is the area a finger lands on.
        const target = el.closest('label') ?? el
        const box = target.getBoundingClientRect()
        return { what: (el.getAttribute('aria-label') ?? el.textContent ?? el.tagName).trim().slice(0, 24), w: Math.round(box.width), h: Math.round(box.height) }
      })
      .filter(({ w, h }) => w < 44 || h < 44)
      .map(({ what, w, h }) => `${what}: ${w}×${h}`),
  )

const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

for (const width of WIDTHS) {
  test.describe(`the way in at ${width}px`, () => {
    test.use({ viewport: { width, height: 800 }, locale: LANG })

    test('gives every control on the login card a 44 by 44 pixel hit area, and never scrolls sideways', async ({ page }) => {
      await page.goto('/')
      // The card for whoever is not logged in. Waited for by its own field, so the measurement
      // never lands on a page that is still deciding what it is.
      await expect(page.getByLabel('E-post')).toBeVisible()
      expect(await tooSmall(page)).toEqual([])
      expect(await sideways(page)).toBe(0)
    })

    test('does the same once there is an account with a game on it', async ({ page }) => {
      // With a game on it, so the card and its own menu are measured too and not only the empty
      // grid — which is the state the 2026-09-10 audit found the small controls in.
      await logIn(page.request)
      await makeProject(page.request, { name: 'Skogens herrar' })
      await page.goto('/')
      await expect(page.getByText('Skogens herrar')).toBeVisible()
      await expect(page.getByRole('button', { name: /^Fler val/ })).toBeVisible()
      expect(await tooSmall(page)).toEqual([])
      expect(await sideways(page)).toBe(0)
    })
  })
}

// The card on a game's tile (G1, #231, variant B). The measurements are relations and not pixels
// off one machine: the box's proportion is the card's own 63 × 88, the drawing fills the box it
// was given, and a game with no cards keeps exactly the same box — which is what "nothing jumps
// and the grid stands even" means where it can actually be seen.
test.describe('the card on a game in "Mina spel" (#231)', () => {
  test.use({ viewport: { width: 1024, height: 900 }, locale: LANG })

  test("draws the game's first card over its name, and keeps the place for a game that has none", async ({ page }) => {
    await logIn(page.request)
    await makeProject(page.request, { name: 'Skogens herrar', cards: 12 })
    await makeProject(page.request, { name: 'Tomt utkast', cards: 0 })
    await page.goto('/')
    await expect(page.getByRole('img', { name: 'Första kortet: Björn 1' })).toBeVisible()

    const drawn = page.locator('.byd-home-card[role="img"]').first()
    const box = (await drawn.boundingBox())!
    // The place is the card's own shape, so what lands in it is a card and not a letterbox.
    expect(box.width / box.height).toBeCloseTo(63 / 88, 2)
    // The drawing fills the place that was reserved for it: the compiled card, scaled, is the box.
    const inner = (await drawn.locator('.byd-preview').boundingBox())!
    expect(Math.abs(inner.width - box.width)).toBeLessThan(1.5)
    expect(Math.abs(inner.height - box.height)).toBeLessThan(1.5)

    // The card stands over the name, which is what variant B is.
    const name = (await page.getByText('Skogens herrar').boundingBox())!
    expect(box.y + box.height).toBeLessThanOrEqual(name.y + 1)

    // A game with no cards says so in the very same box, so the row stands even.
    const empty = page.locator('.byd-home-card[data-empty]')
    await expect(empty).toHaveText('inga kort än')
    const emptyBox = (await empty.boundingBox())!
    expect(emptyBox.height).toBeCloseTo(box.height, 1)
    expect(emptyBox.width).toBeCloseTo(box.width, 1)
  })
})

// The "Nytt spel" tile has no floor of its own any more: the row it sits in gives it one, so it
// stands as tall as the games beside it whatever height a game's tile happens to be. The case that
// proves it is the one where the row has nobody to stretch against — the games fill the columns
// exactly, and the invitation lands alone on a row of its own. That is where a tile with no floor
// collapses to its own line of text, and where the old invented 150 px was hiding.
test.describe('the "Nytt spel" tile on a row of its own (#231)', () => {
  test.use({ viewport: { width: 1024, height: 900 }, locale: LANG })

  test('stands as tall as a game, with the games filling the columns exactly', async ({ page }) => {
    await logIn(page.request)
    for (const name of ['Skogens herrar', 'Vinterspelet', 'Kryptan']) await makeProject(page.request, { name, cards: 12 })
    await page.goto('/')
    await expect(page.getByRole('img', { name: 'Första kortet: Björn 1' }).first()).toBeVisible()

    const games = page.locator('.byd-home-grid[data-projects] .byd-home-game:not([data-new])')
    const invitation = page.locator('.byd-home-game[data-new]')
    const game = (await games.first().boundingBox())!
    const box = (await invitation.boundingBox())!
    // Alone on its own row: every game is above it, so nothing on its row stretches it.
    const bottoms = await games.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().bottom))
    expect(Math.min(...bottoms)).toBeLessThanOrEqual(box.y + 1)
    // And it is still a game's tile, not a line of text. The height is the game's own and not a
    // number this test knows: whatever a game's tile measures, the invitation measures too.
    expect(box.height).toBeCloseTo(game.height, 0)
  })

  test('keeps a floor of the card\'s own height on an account with no games to stand beside', async ({ page }) => {
    await logIn(page.request)
    await page.goto('/')
    await expect(page.getByText('Inget spel ännu.')).toBeVisible()
    // Nothing on the page is a game, so the row has nothing to give. The floor is then the card's
    // own height — read off the page rather than written down here, because it is the very number
    // the drawing is scaled by and this test has no business knowing a second one.
    const cardH = await page.locator('.byd-home-grid[data-projects]').evaluate((el) => parseFloat(getComputedStyle(el).getPropertyValue('--byd-home-card-h')))
    expect(cardH).toBeGreaterThan(0)
    const box = (await page.locator('.byd-home-game[data-new]').boundingBox())!
    expect(box.height).toBeGreaterThanOrEqual(cardH)
  })
})
