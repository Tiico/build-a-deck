import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { logIn } from '../../support/api.js'

// Temats förval i den guidade starten (#687, beställarens beslut 2026-10-06, variant D).
//
// Skogssaga gällde «tills ett annat trycks» och stod därför nedtryckt från början, men katalogen
// nås först på formgivarens handling (L27, L57) — så kortet bredvid en bricka som såg vald ut stod
// i ett reservtypsnitt, och den som behöll förvalet såg aldrig spelets utseende. Nu står Skogssaga
// som «Förval», inte nedtryckt, och kortet bär «Visa kortet i Skogssaga»: trycket är handlingen.
//
// Vad som mäts här är det byggda `/new` i Chromium: vilket ansikte som faktiskt ritar kortet
// (Chromiums eget svar, `CSS.getPlatformFontsForNode`, som i #887 och #472), vad som frågas av
// Google och när, och att beskedet om hämtningen står kvar tills filen kommit — inte bara arket.
//
// Google besvaras här och nås inte, med riktiga woff2-filer ur repot, så att ett ansikte verkligen
// laddas och ritar. Vilket ansikte det är spelar ingen roll för provet: frågan är om kortet står i
// en fil sidan laddat eller i maskinens reserv, och den frågan har samma svar på Mac och på Linux.
const GOOGLE = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//
const FACES = join(import.meta.dirname, '..', '..', '..', '..', 'docs', 'ux-audits', '2026-09-22', 'typsnitt')
const FILES: Record<string, Buffer> = {
  cinzel: readFileSync(join(FACES, 'cinzel.woff2')),
  'eb-garamond': readFileSync(join(FACES, 'eb-garamond.woff2')),
}
const ANY = readFileSync(join(FACES, 'crimson-pro.woff2'))

type Google = { asked: string[]; release(): void }

// The catalogue as Google answers it: a sheet per family that names its file, and the file. With
// `hold` the files wait at the door until `release`, so the page can be read while they travel.
async function google(page: Page, { hold = false } = {}): Promise<Google> {
  const asked: string[] = []
  let release: () => void = () => undefined
  const held = hold ? new Promise<void>((resolve) => (release = resolve)) : Promise.resolve()
  await page.route(GOOGLE, async (route) => {
    const url = route.request().url()
    asked.push(url)
    if (url.includes('googleapis.com')) {
      const family = new URL(url).searchParams.get('family')?.split(':')[0] ?? ''
      const slug = family.toLowerCase().replace(/ /g, '-')
      return route.fulfill({ status: 200, contentType: 'text/css', body: `/* latin */\n@font-face { font-family: '${family}'; src: url(https://fonts.gstatic.com/s/${slug}/latin.woff2) format('woff2'); }\n` })
    }
    await held
    const slug = new URL(url).pathname.split('/')[3] ?? ''
    return route.fulfill({ status: 200, contentType: 'font/woff2', headers: { 'access-control-allow-origin': '*' }, body: FILES[slug] ?? ANY })
  })
  return { asked, release: () => release() }
}

// Whether the card's title and body are drawn, every glyph, by a face the page itself loaded.
async function inTheme(page: Page): Promise<boolean> {
  const cdp = await page.context().newCDPSession(page)
  try {
    await cdp.send('DOM.enable')
    await cdp.send('CSS.enable')
    const { root } = (await cdp.send('DOM.getDocument', { depth: -1 })) as { root: { nodeId: number } }
    let seen = 0
    for (const element of ['title', 'body']) {
      const { nodeIds } = (await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: `#wizard-live [data-element="${element}"] p` })) as { nodeIds: number[] }
      for (const nodeId of nodeIds) {
        const { fonts } = (await cdp.send('CSS.getPlatformFontsForNode', { nodeId })) as { fonts: { glyphCount: number; isCustomFont: boolean }[] }
        const used = fonts.filter((f) => f.glyphCount > 0)
        if (used.length === 0) continue
        seen++
        if (!used.every((f) => f.isCustomFont)) return false
      }
    }
    return seen >= 2
  } finally {
    await cdp.detach()
  }
}

const tile = (page: Page, name: string) => page.getByRole('button', { name: `Välj temat ${name}` })
const show = (page: Page) => page.getByRole('button', { name: 'Visa kortet i Skogssaga' })
const fetching = (page: Page, name: string) => page.locator('.byd-wizard-preview').getByText(`Hämtar typsnitten för ${name} …`)

for (const [width, height] of [[1280, 800], [1024, 768], [768, 1024]] as const) {
  test.describe(`at ${width} × ${height}`, () => {
    test.use({ viewport: { width, height }, locale: 'sv-SE' })

    test('opens on Skogssaga as the preselection, asks Google for nothing, and one press on the card sets it in the theme', async ({ page }) => {
      const net = await google(page)
      await logIn(page.request)
      await page.goto('/new', { waitUntil: 'load' })
      const steps = width < 1024
      // Below the desk the tiles are step 2 and the card step 3; the way to each is the step's tab.
      if (steps) await page.getByRole('tab', { name: '2 · Fälten' }).click()
      const skog = tile(page, 'Skogssaga')
      await expect(skog).toHaveAttribute('aria-pressed', 'false')
      await expect(skog).toHaveAccessibleDescription('Förval')
      await expect(page.locator('.byd-theme-tile[aria-pressed="true"]')).toHaveCount(0)
      if (steps) await page.getByRole('tab', { name: '3 · Korten' }).click()
      await expect(show(page)).toBeVisible()
      await page.waitForTimeout(500)
      expect(net.asked, 'nothing is asked of Google before the designer acts (L27)').toEqual([])
      expect(await inTheme(page)).toBe(false)

      await show(page).click()
      await expect.poll(() => inTheme(page), { timeout: 15_000 }).toBe(true)
      await expect(show(page)).toHaveCount(0)
      expect(net.asked.some((url) => url.includes('Cinzel'))).toBe(true)
      expect(await page.evaluate(() => document.activeElement === document.body), 'the press does not leave the focus on <body>').toBe(false)
      if (steps) await page.getByRole('tab', { name: '2 · Fälten' }).click()
      await expect(skog).toHaveAttribute('aria-pressed', 'true')
      await expect(skog).not.toHaveAccessibleDescription('Förval')
    })
  })
}

test.describe('at the desk', () => {
  test.use({ viewport: { width: 1280, height: 800 }, locale: 'sv-SE' })

  // The blank card (#687): the sheet answers long before the file, and the card's faces are
  // declared `font-display: block` — so the card stood empty for three seconds and then in the
  // fallback, and the sentence about the faces had gone with the sheet. It stays until the file is in.
  test('keeps saying the theme is on its way until its files have loaded, not until the sheet has answered', async ({ page }) => {
    const net = await google(page, { hold: true })
    await logIn(page.request)
    await page.goto('/new', { waitUntil: 'load' })
    await tile(page, 'Krönika').click()
    await expect.poll(() => net.asked.filter((url) => url.includes('gstatic')).length).toBeGreaterThan(0)
    await expect(fetching(page, 'Krönika')).toBeVisible()
    // Past the three seconds `font-display: block` hides the text for: the fallback is drawn now.
    await page.waitForTimeout(3_500)
    await expect(fetching(page, 'Krönika')).toBeVisible()
    expect(await inTheme(page)).toBe(false)

    net.release()
    await expect.poll(() => inTheme(page), { timeout: 15_000 }).toBe(true)
    await expect(fetching(page, 'Krönika')).toHaveCount(0)
  })

  // A draft whose theme was pressed on an earlier visit (beslutet, punkt 2): that press was the
  // designer's act, so the reload fetches the faces and the card is right at once.
  test('fetches a resumed draft s pressed theme on reload, and the card is right without a press', async ({ page }) => {
    const net = await google(page)
    await logIn(page.request)
    await page.goto('/new', { waitUntil: 'load' })
    await page.getByLabel('Spelets namn').fill('Krönikan')
    await tile(page, 'Krönika').click()
    await expect.poll(() => inTheme(page), { timeout: 15_000 }).toBe(true)

    page.on('dialog', (dialog) => void dialog.accept())
    const before = net.asked.length
    await page.reload({ waitUntil: 'load' })
    await expect(page.getByLabel('Spelets namn')).toHaveValue('Krönikan')
    await expect(tile(page, 'Krönika')).toHaveAttribute('aria-pressed', 'true')
    await expect(show(page)).toHaveCount(0)
    await expect.poll(() => inTheme(page), { timeout: 15_000 }).toBe(true)
    expect(net.asked.length).toBeGreaterThan(before)
  })

  // A draft in which no theme was pressed is still a preselection: a name typed is no act on the
  // theme, so a reload asks Google for nothing.
  test('keeps an unpressed draft on the preselection, and asks Google for nothing on reload', async ({ page }) => {
    const net = await google(page)
    await logIn(page.request)
    await page.goto('/new', { waitUntil: 'load' })
    await page.getByLabel('Spelets namn').fill('Skogens herrar')
    page.on('dialog', (dialog) => void dialog.accept())
    await page.reload({ waitUntil: 'load' })
    await expect(page.getByLabel('Spelets namn')).toHaveValue('Skogens herrar')
    await expect(tile(page, 'Skogssaga')).toHaveAttribute('aria-pressed', 'false')
    await expect(show(page)).toBeVisible()
    await page.waitForTimeout(500)
    expect(net.asked).toEqual([])
  })

  // Both new controls are reached and worked by the keyboard, and draw a ring when they are.
  test('reaches the card s button and the preselected tile with Tab, with a visible ring, and works the button with Enter', async ({ page }) => {
    await google(page)
    await logIn(page.request)
    await page.goto('/new', { waitUntil: 'load' })
    const ring = () => page.evaluate(() => {
      const el = document.activeElement as HTMLElement
      const style = getComputedStyle(el)
      return { label: el.getAttribute('aria-label') ?? el.textContent ?? '', ring: style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0 }
    })
    await page.getByRole('button', { name: 'Mörk' }).focus()
    await page.keyboard.press('Tab')
    expect(await ring()).toEqual({ label: 'Välj temat Skogssaga', ring: true })

    await page.getByRole('button', { name: 'Hjälp om korten' }).focus()
    await page.keyboard.press('Tab')
    expect(await ring()).toEqual({ label: 'Visa kortet i Skogssaga', ring: true })
    await page.keyboard.press('Enter')
    await expect.poll(() => inTheme(page), { timeout: 15_000 }).toBe(true)
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false)
  })
})

// The box at the top of the guided start (beslutet, punkt 3): logged out it says the game is kept
// on an account (#691) — said here and only here — and logged in there is no box. The word
// «wizard» is gone from the surface: it is «guidad start» everywhere.
test.describe('the box over step 1', () => {
  test.use({ viewport: { width: 1280, height: 800 }, locale: 'sv-SE' })

  test('says the game is kept on an account when logged out', async ({ page }) => {
    await page.goto('/new', { waitUntil: 'load' })
    const box = page.locator('.byd-wizard-handoff')
    await expect(box).toHaveText('Spelet sparas på ett konto. Du loggar in med e-post när du skapar det, och det du skrivit här följer med.')
    await expect(box.locator('strong')).toHaveText('Spelet sparas på ett konto.')
    expect(await page.locator('.byd-wizard').innerText()).not.toMatch(/wizard/i)
  })

  test('is not there when logged in', async ({ page }) => {
    await logIn(page.request)
    await page.goto('/new', { waitUntil: 'load' })
    await expect(page.getByLabel('Spelets namn')).toBeVisible()
    await page.waitForTimeout(500)
    await expect(page.locator('.byd-wizard-handoff')).toHaveCount(0)
    expect(await page.locator('.byd-wizard').innerText()).not.toMatch(/wizard/i)
  })
})
