import type { Locator, Page } from '@playwright/test'
import { expect, test } from '../../support/test.js'

// The way in, measured as the speltest before the beta found it (resa a-vagen-in, main a5c3a05f): a
// long address in the login's receipt and the welcome step (#1359), and the small faults of form
// and ring in #1373. Every measurement is a relation on the page itself, never a pixel off this
// machine's face (system-ui is DejaVu on CI's Linux).

test.use({ locale: 'sv-SE' })

const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const box = (l: Locator) => l.evaluate((el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height } })
// Sixty characters, a double name and a plus in it, as a beta tester's address may well be.
const longAddress = () => `anna-karin.johansson-lindqvist+${crypto.randomUUID().slice(0, 9)}@exempel-forening.se`

// The lines an address is laid in, read off its glyphs. It breaks after «@», a dot, a hyphen or a
// plus and never between two letters, and the double name stands whole on its line.
async function brokenAsAnAddress(address: Locator, email: string) {
  const lines = await address.evaluate((el) => {
    const out: { top: number; text: string }[] = []
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const text = n.textContent ?? ''
      for (let i = 0; i < text.length; i++) {
        const r = document.createRange()
        r.setStart(n, i)
        r.setEnd(n, i + 1)
        const b = r.getBoundingClientRect()
        const top = Math.round(b.top + b.height / 2)
        const line = out.find((l) => Math.abs(l.top - top) <= 4)
        if (line) line.text += text[i]
        else out.push({ top, text: text[i]! })
      }
    }
    return out.sort((a, b) => a.top - b.top).map((l) => l.text)
  })
  expect(lines.join(''), lines.join(' / ')).toBe(email)
  for (const line of lines.slice(0, -1)) expect(line, lines.join(' / ')).toMatch(/[@.+-]$/)
  expect(lines.some((line) => line.includes('anna-karin.')), lines.join(' / ')).toBe(true)
}

// #1359: the address breaks within the card, and the page never scrolls sideways.
for (const width of [320, 375]) {
  test.describe(`a long address at ${width}`, () => {
    test.use({ viewport: { width, height: 740 } })

    test('stays inside the login card’s receipt (#1359)', async ({ page }) => {
      const email = longAddress()
      expect(email.length).toBe(60)
      // The receipt is what a box without AUTH_BYPASS answers: a link was sent.
      await page.route('**/auth/login', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }))
      await page.goto('/login')
      await page.getByLabel('E-post').fill(email)
      await page.getByRole('button', { name: 'Skicka inloggningslänk' }).click()
      const sent = page.locator('.byd-login-sent')
      await expect(sent.getByText('Kolla din mejl')).toBeVisible()
      expect(await sideways(page)).toBe(0)
      const card = await box(page.locator('.byd-login'))
      const said = await box(sent)
      expect(said.right).toBeLessThanOrEqual(card.right + 0.5)
      expect(card.right).toBeLessThanOrEqual(width)
      await brokenAsAnAddress(sent.locator('.byd-address'), email)
    })

    test('stays inside the welcome step (#1359)', async ({ page }) => {
      const email = longAddress()
      await page.goto('/login')
      await page.getByLabel('E-post').fill(email)
      await page.getByRole('button', { name: 'Skicka inloggningslänk' }).click()
      const as = page.locator('.byd-welcome-as')
      await expect(as).toBeVisible()
      expect(await sideways(page)).toBe(0)
      const card = await box(page.locator('.byd-welcome'))
      expect((await box(as)).right).toBeLessThanOrEqual(card.right + 0.5)
      expect(card.right).toBeLessThanOrEqual(width)
      await brokenAsAnAddress(as.locator('.byd-address'), email)
    })
  })
}

// #1373, the report: an invalid field wears the same amber ring whether it is a line or a box.
test('every field the report page finds wrong wears the same amber border (#1373)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/villkor/anmal')
  await page.getByLabel('Din e‑post').fill('inte en adress')
  await page.getByRole('button', { name: 'Skicka anmälan' }).click()
  await expect(page.getByText('Säg var bilden finns.')).toBeVisible()
  const border = (l: Locator) => l.evaluate((el) => { const s = getComputedStyle(el); return [s.borderTopColor, s.borderRightColor, s.borderBottomColor, s.borderLeftColor, s.boxShadow] })
  const box_ = await border(page.getByLabel('Vilken bild är det?'))
  expect(box_[0]).toBe('rgb(240, 182, 74)')
  for (const name of ['Var finns den?', 'Din e‑post']) expect(await border(page.getByLabel(name)), name).toEqual(box_)
})

// #1373, the welcome card: its two steps are one card (F4 «i samma kort»).
for (const width of [375, 1440]) {
  test(`the welcome card’s two steps are the same card at ${width} (#1373)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/login')
    await page.getByLabel('E-post').fill(`ada+${crypto.randomUUID().slice(0, 8)}@example.com`)
    await page.getByRole('button', { name: 'Skicka inloggningslänk' }).click()
    const read = (card: string) =>
      page.locator(card).evaluate((el) => {
        const s = getComputedStyle(el)
        const h1 = el.querySelector('h1')!
        const mark = h1.querySelector('svg')!
        const text = document.createRange()
        text.selectNodeContents(h1)
        text.setStartAfter(mark)
        return {
          width: Math.round(el.getBoundingClientRect().width),
          padding: [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft].join(' '),
          radius: s.borderRadius,
          gap: s.rowGap,
          h1: getComputedStyle(h1).fontSize,
          h1Ink: getComputedStyle(h1).color,
          mark: Math.round(mark.getBoundingClientRect().width),
          markGap: Math.round(text.getBoundingClientRect().left - mark.getBoundingClientRect().right),
        }
      })
    // The ring a keyboard sees on the step's one press, reached by pressing Tab as a reader does.
    const ring = async (name: string) => {
      const target = page.getByRole('button', { name })
      for (let i = 0; i < 12 && !(await target.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab')
      return target.evaluate((el) => { const s = getComputedStyle(el); return `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor} ${s.outlineOffset}` })
    }
    await expect(page.getByText('Steg 1 av 2')).toBeVisible()
    const one = await read('[data-page="welcome"] > div')
    const oneRing = await ring('Fortsätt')
    await page.getByRole('button', { name: 'Fortsätt' }).click()
    await expect(page.getByText('Steg 2 av 2')).toBeVisible()
    const two = await read('[data-terms-step]')
    const twoRing = await ring('Godkänn och fortsätt')
    expect(one).toEqual(two)
    expect(oneRing).toBe(twoRing)
    expect(twoRing).toBe('solid 3px rgb(156, 198, 255) 2px')
  })
}

// #1373, the landing page: one ring for every stop, the amber the links already wear.
test('the landing page wears one focus ring on every stop (#1373)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/?lang=sv')
  await expect(page.getByLabel('Har du en rumskod?')).toBeVisible()
  const rings = new Map<string, string>()
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Tab')
    const [name, ring] = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement
      const s = getComputedStyle(el)
      return [`${el.tagName} ${(el.textContent ?? '').trim().slice(0, 20)}`, `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`]
    })
    if (name.startsWith('BODY')) break
    rings.set(name, ring)
  }
  expect([...rings.keys()].some((k) => k.startsWith('INPUT')) && [...rings.keys()].some((k) => k.startsWith('SELECT'))).toBe(true)
  for (const [name, ring] of rings) expect(ring, name).toBe('solid 3px rgb(240, 182, 74)')
})

// #1373, the login card's foot at 375: when the row breaks, no line begins with its separator.
test('the login card’s foot never starts a line with «·» (#1373)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.route('**/health', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, release: 'v0.39.0-beta', contact: 'hej@deckster.se' }) }))
  await page.goto('/login')
  const about = page.locator('.byd-login [data-about]')
  await expect(about.getByText('Deckster v0.39.0-beta')).toBeVisible()
  const firsts = await about.evaluate((p) => {
    // Every glyph of the row with its line, read off the text itself.
    const glyphs: { ch: string; top: number; left: number }[] = []
    const walk = document.createTreeWalker(p, NodeFilter.SHOW_TEXT)
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const text = n.textContent ?? ''
      for (let i = 0; i < text.length; i++) {
        if (text[i]!.trim() === '') continue
        const r = document.createRange()
        r.setStart(n, i)
        r.setEnd(n, i + 1)
        const b = r.getBoundingClientRect()
        glyphs.push({ ch: text[i]!, top: Math.round(b.top + b.height / 2), left: b.left })
      }
    }
    const lines = new Map<number, { ch: string; left: number }[]>()
    for (const g of glyphs) {
      const key = [...lines.keys()].find((k) => Math.abs(k - g.top) <= 6) ?? g.top
      lines.set(key, [...(lines.get(key) ?? []), g])
    }
    return [...lines.values()].map((line) => line.sort((a, b) => a.left - b.left)[0]!.ch)
  })
  expect(firsts.length).toBeGreaterThan(1)
  expect(firsts).not.toContain('·')
})

// #1373, the landing page's foot at the desk: the language picker stands on the row's line.
test('the landing page’s language picker stands level with the row beside it (#1373)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/?lang=sv')
  const picker = await box(page.locator('.byd-landing-foot select'))
  const link = await box(page.locator('.byd-landing-foot [data-about] a').first())
  expect(Math.abs(picker.top + picker.height / 2 - (link.top + link.height / 2))).toBeLessThanOrEqual(2)
})

// #1373, the English landing page: a step that says what it is, and headings that leave no word alone.
test('the English landing page says «Design one card» and balances its headings (#1373)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/?lang=en')
  await expect(page.getByRole('heading', { level: 3, name: 'Design one card, get them all' })).toBeVisible()
  for (const heading of await page.locator('.byd-landing h1, .byd-landing h2').all()) expect(await heading.evaluate((el) => getComputedStyle(el).textWrapStyle || getComputedStyle(el).textWrap), await heading.textContent() ?? '').toMatch(/balance/)
})
