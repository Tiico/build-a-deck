import type { Page } from '@playwright/test'
import { expect, test } from '../../support/test.js'
import { join, logIn, makeProject, makeTable } from '../../support/api.js'

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

    test('gives every control on the landing page and the login card a 44 by 44 pixel hit area, and never scrolls sideways', async ({ page }) => {
      // The landing page for whoever is not logged in (#1009), waited for by its own heading so the
      // measurement never lands on a page that is still deciding what it is; then the login card it
      // leads to, waited for by its own field.
      await page.goto('/')
      await expect(page.getByRole('heading', { level: 1, name: 'Bygg ditt kortspel. Spela det i kväll.' })).toBeVisible()
      expect(await tooSmall(page)).toEqual([])
      expect(await sideways(page)).toBe(0)
      await page.goto('/login')
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

// The card on a game's row (G1, #231; beside the name since #1204). The measurements are relations
// and not pixels off one machine: the box's proportion is the card's own 63 × 88, the drawing fills
// the box it was given, and a game with no cards keeps exactly the same box — which is what "nothing
// jumps and the rows stand even" means where it can actually be seen.
test.describe('the card on a game in "Mina spel" (#231, #1204)', () => {
  test.use({ viewport: { width: 1024, height: 900 }, locale: LANG })

  test("draws the game's first card beside its name, and keeps the place for a game that has none", async ({ page }) => {
    await logIn(page.request)
    await makeProject(page.request, { name: 'Tomt utkast', cards: 0 })
    await makeProject(page.request, { name: 'Skogens herrar', cards: 12 })
    // Saved last, so it is the hero and the two above stand as rows.
    await makeProject(page.request, { name: 'Vinterspelet', cards: 12 })
    await page.goto('/')
    const row = page.locator('.byd-home-grid[data-projects] .byd-home-game', { hasText: 'Skogens herrar' })
    const drawn = row.locator('.byd-home-card[role="img"]')
    await expect(drawn).toBeVisible()
    const box = (await drawn.boundingBox())!
    // The place is the card's own shape, so what lands in it is a card and not a letterbox.
    expect(box.width / box.height).toBeCloseTo(63 / 88, 2)
    // The drawing fills the place that was reserved for it: the compiled card, scaled, is the box.
    const inner = (await drawn.locator('.byd-preview').boundingBox())!
    expect(Math.abs(inner.width - box.width)).toBeLessThan(1.5)
    expect(Math.abs(inner.height - box.height)).toBeLessThan(1.5)

    // The card stands to the left of the name, which is what a row is (#1204).
    const name = (await row.getByText('Skogens herrar').boundingBox())!
    expect(box.x + box.width).toBeLessThanOrEqual(name.x + 1)

    // A game with no cards says so in the very same box, so the rows stand even.
    const empty = page.locator('.byd-home-grid[data-projects] .byd-home-card[data-empty]')
    await expect(empty).toHaveText('inga kort ännu')
    const emptyBox = (await empty.boundingBox())!
    expect(emptyBox.height).toBeCloseTo(box.height, 1)
    expect(emptyBox.width).toBeCloseTo(box.width, 1)
  })

  // The hero (#1204, beslut B): the game saved last leads, its own first card in front of a fan of
  // two more of its cards, and the fan lands after the page rather than holding it up.
  test('leads with the game saved last, in front of a fan of its own cards', async ({ page }) => {
    await logIn(page.request)
    await makeProject(page.request, { name: 'Skogens herrar', cards: 12 })
    await makeProject(page.request, { name: 'Vinterspelet', cards: 12 })
    await page.goto('/')
    const hero = page.locator('.byd-home-hero')
    await expect(hero.getByText('Vinterspelet')).toBeVisible()
    await expect(hero.locator('.byd-home-fan-back')).toHaveCount(2)
    const front = (await hero.locator('.byd-home-card[role="img"]').boundingBox())!
    expect(front.width / front.height).toBeCloseTo(63 / 88, 2)
    // The two behind it are cards of the same game, so they have the front card's rounded corners:
    // each drawing is clipped by a box with the front's radius that is exactly the drawing's size.
    const corners = (el: Element) => {
      const preview = el.querySelector('.byd-preview')!
      let clip = preview.parentElement
      while (clip && getComputedStyle(clip).overflow === 'visible') clip = clip.parentElement
      const a = preview.getBoundingClientRect()
      const b = clip?.getBoundingClientRect()
      return { radius: clip ? getComputedStyle(clip).borderTopLeftRadius : 'none', fits: !!b && Math.abs(a.width - b.width) < 1.5 && Math.abs(a.height - b.height) < 1.5 }
    }
    await expect(hero.locator('.byd-home-fan-back .byd-preview')).toHaveCount(2)
    const radius = await hero.locator('.byd-home-card[role="img"]').evaluate((el) => getComputedStyle(el).borderTopLeftRadius)
    expect(radius).not.toBe('0px')
    for (const back of await hero.locator('.byd-home-fan-back').all()) expect(await back.evaluate(corners)).toEqual({ radius, fits: true })
    // Its two things to do are on it, and not behind its ⋯.
    await expect(hero.getByRole('link', { name: 'Öppna editorn' })).toBeVisible()
    await expect(hero.getByRole('button', { name: 'Starta bord' })).toBeVisible()
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
    // Its words stand in its middle (#1204): `align-content: start` once won over the centring,
    // and «＋ Nytt spel» hung from the top edge of a tile as tall as a game.
    const words = await invitation.evaluate((el) => {
      const range = document.createRange()
      range.selectNodeContents(el)
      const r = range.getBoundingClientRect()
      return r.top + r.height / 2
    })
    expect(Math.abs(words - (box.y + box.height / 2))).toBeLessThan(2)
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

// A game's menu and the question before it is taken away (#475). At 390 with six games the
// question used to stand at the top of the page, a thousand pixels above the ⋯ that asked for it,
// with the focus left on <body> — so the press looked like it did nothing at all.
test.describe('taking a game away on a phone (#475)', () => {
  test.use({ viewport: { width: 390, height: 844 }, locale: LANG, hasTouch: true, isMobile: true })

  test('asks where it can be seen, with the focus on the answer that keeps the game, and every control a fingertip wide', async ({ page }) => {
    await logIn(page.request)
    for (let i = 1; i <= 6; i++) await makeProject(page.request, { name: `Spel ${i}`, cards: 0 })
    await page.goto('/')
    const last = page.getByRole('button', { name: 'Fler val för Spel 1' })
    await last.scrollIntoViewIfNeeded()
    await last.tap()
    await expect(page.getByRole('group', { name: 'Val för Spel 1' })).toBeVisible()
    expect(await tooSmall(page)).toEqual([])

    await page.getByRole('button', { name: 'Ta bort spelet' }).tap()
    const question = page.getByRole('alertdialog', { name: 'Ta bort spelet' })
    await expect(question.getByRole('button', { name: 'Avbryt' })).toBeFocused()
    await expect(question).toBeInViewport({ ratio: 1 })
    expect(await tooSmall(page)).toEqual([])
    expect(await sideways(page)).toBe(0)
  })
})

// The rest of "Mina spel" on a phone (#475): the heading on one line with the account beneath it
// rather than squeezed beside it, and the help beside «Inget spel ännu.» inside the window — it
// used to open at x = −90, hanging from the far edge of a question mark that had no room on
// either side.
test.describe('"Mina spel" on a phone (#475)', () => {
  test.use({ viewport: { width: 390, height: 844 }, locale: LANG, hasTouch: true, isMobile: true })

  test('keeps the heading on one line and the help for an empty account inside the window', async ({ page }) => {
    await logIn(page.request)
    await page.goto('/')
    const heading = page.getByRole('heading', { name: 'Mina spel' })
    await expect(heading).toBeVisible()
    // Lines as the text itself was laid out: one rectangle per line box the words landed in.
    const lines = await heading.evaluate((el) => {
      const range = document.createRange()
      range.selectNodeContents(el)
      return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size
    })
    expect(lines, 'the heading is one line').toBeLessThanOrEqual(1)

    await page.getByRole('button', { name: 'Hjälp om spel' }).tap()
    const box = (await page.locator('.byd-help-box').boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(390)
    expect(await sideways(page)).toBe(0)
  })
})

// A table the account sat at (#475): the way back to it was a 19 px line of text, and the seat's
// letter was a coloured disc with nothing to say which seat it was.
test.describe('"Bord du har spelat vid" (#475)', () => {
  test.use({ viewport: { width: 390, height: 844 }, locale: LANG, hasTouch: true, isMobile: true })

  test('gives the way back to the table a fingertip, and names the seat', async ({ page }) => {
    await logIn(page.request)
    const table = await makeTable(page.request)
    const seat = table.seats[0]!
    const admission = await join(page.request, table, { name: 'Ada', seat })
    const claimed = await page.request.post('/guests/claim', { data: { token: admission.token } })
    expect(claimed.ok()).toBe(true)
    await page.goto('/')
    await expect(page.getByText('Bord du har spelat vid')).toBeVisible()
    await expect(page.getByRole('img', { name: `Plats ${seat}` })).toBeVisible()
    expect(await tooSmall(page)).toEqual([])
  })
})
