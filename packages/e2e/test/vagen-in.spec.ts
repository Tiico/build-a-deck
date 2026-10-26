import type { Page } from '@playwright/test'
import { logIn } from '../support/api.js'
import { DESK } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// The way in, as the speltest before the beta walked it (resa a-vagen-in, main a5c3a05f): the
// landing page's door to the login card, the report page and its way back to the terms, and the
// order a keyboard meets the landing page in on a phone.

test.use({ locale: 'sv-SE' })

const FIRST = {
  sv: 'Logga in eller skapa konto med din e‑post. Du får en länk i mejlet.',
  en: 'Sign in or create an account with your email. You get a link in the mail.',
}
const BACK = {
  sv: 'Logga in för att komma till dina spel.',
  en: 'Log in to get to your games.',
}

// A newcomer goes in through the landing page, which counts as the sales line having been seen
// (L36). The line for the first visit is another thing: it says the link makes the account, and the
// landing page never said that (#1358).
for (const lang of ['sv', 'en'] as const) {
  test.describe(lang, () => {
    // The reader's own language, as her browser asks for it; the login card does not read `?lang`.
    test.use({ locale: lang === 'sv' ? 'sv-SE' : 'en-GB' })
    test(`the login card reached from the landing page says the first visit’s line, in ${lang} (#1358)`, async ({ page }) => {
      await page.setViewportSize(DESK.viewport)
      await page.goto(`/?lang=${lang}`)
      await page.getByRole('link', { name: lang === 'sv' ? 'Mina spel' : 'My games' }).click()
      await expect(page.getByText(FIRST[lang])).toBeVisible()
      await expect(page.getByText(BACK[lang])).toHaveCount(0)
      // Whoever comes back to the card is not told the first visit’s line a second time.
      await page.reload()
      await expect(page.getByText(BACK[lang])).toBeVisible()
    })
  })
}

// «Villkor, avsnitt 11» and the receipt's button lead to section 11 itself, opened and in view, and
// not to the top of the terms with every section closed (#1361).
test('the way back from the report page opens section 11 of the terms and shows it (#1361)', async ({ page }) => {
  await page.setViewportSize(DESK.viewport)
  await page.goto('/villkor/anmal')
  await page.getByRole('link', { name: 'Villkor, avsnitt 11' }).click()
  await expect(page).toHaveURL(/\/villkor#villkor-11$/)
  const section = page.locator('#villkor-11')
  await expect(section).toHaveJSProperty('open', true)
  await expect(section.getByText('Anmälan och borttagning', { exact: true })).toBeInViewport()
  // Every other section stands as it was: closed.
  await expect(page.locator('#villkor-10, #villkor-12').and(page.locator('details[open]'))).toHaveCount(0)
  // The receipt's link, opened in a new tab as a mail's link is.
  await page.goto('/')
  await page.goto('/villkor#villkor-11')
  await expect(page.locator('#villkor-11')).toHaveJSProperty('open', true)
  await expect(page.locator('#villkor-11').getByText('Anmälan och borttagning', { exact: true })).toBeInViewport()
})

// Sent with the keyboard, the form gives way to the receipt, and the focus goes with it to the
// receipt's heading rather than falling to the body (#1362, WCAG 2.4.3).
test('sending a report with the keyboard puts the focus on the receipt’s heading (#1362)', async ({ page }) => {
  await page.setViewportSize(DESK.viewport)
  await page.goto('/villkor/anmal')
  await page.getByLabel('Vilken bild är det?').fill('Bilden på kortet Skogsvaktaren')
  await page.getByLabel('Var finns den?').fill('Skogens råd')
  await page.getByLabel('Varför får den inte finnas?').fill('Min målning.')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Skicka anmälan' }).focus()
  await page.keyboard.press('Enter')
  const heading = page.getByRole('heading', { name: 'Anmälan är skickad' })
  await expect(heading).toBeFocused()
  // The next Tab goes on from the receipt, not from the top of the page.
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Till start', exact: true })).toBeFocused()
})

// The beställare's decision (#1376, punkt 2): an account that reports has its name and address filled
// in, where they can be seen, and both can be emptied, since a report may be made without them (L88).
test('a report made logged in has the name and the address filled in, and both can be emptied (#1376)', async ({ page }) => {
  await page.setViewportSize(DESK.viewport)
  const email = await logIn(page.request, `mira.lind+${crypto.randomUUID().slice(0, 8)}@example.com`)
  expect((await page.request.put('/me/name', { data: { name: 'Mira Lind' } })).ok()).toBe(true)
  await page.goto('/villkor/anmal')
  await expect(page.getByLabel('Ditt namn')).toHaveValue('Mira Lind')
  await expect(page.getByLabel('Din e‑post')).toHaveValue(email)
  await page.getByLabel('Ditt namn').fill('')
  await page.getByLabel('Din e‑post').fill('')
  await page.getByLabel('Vilken bild är det?').fill('Bilden')
  await page.getByLabel('Var finns den?').fill('Ett bord')
  await page.getByLabel('Varför får den inte finnas?').fill('Den rör barn.')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Skicka anmälan' }).click()
  await expect(page.getByText(/Utan e‑post får du inget kvitto/)).toBeVisible()
})

// The focus order is the order the boxes stand in (#1363, WCAG 2.4.3 and 1.3.2). On a phone the code
// stands first (#675), so a keyboard meets it before «Börja bygga»; at the desk it stands under it.
const tabStops = async (page: Page, n: number) => {
  const stops: { name: string; top: number; left: number }[] = []
  for (let i = 0; i < n; i++) {
    await page.keyboard.press('Tab')
    stops.push(
      await page.evaluate(() => {
        const el = document.activeElement as HTMLElement
        const r = el.getBoundingClientRect()
        const label = el instanceof HTMLInputElement || el instanceof HTMLSelectElement ? el.labels?.[0]?.textContent : null
        return {
          name: (label ?? el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30),
          top: Math.round(r.top + scrollY),
          left: Math.round(r.left),
        }
      }),
    )
  }
  return stops
}
for (const width of [375, 1440]) {
  test(`the landing page is tabbed in the order it stands in, at ${width} (#1363)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/?lang=sv')
    await expect(page.getByLabel('Har du en rumskod?')).toBeVisible()
    const stops = await tabStops(page, 5)
    // Each stop stands below the one before it, or beside it to the right on the same row.
    for (let i = 1; i < stops.length; i++) {
      const [was, is] = [stops[i - 1]!, stops[i]!]
      const onward = is.top > was.top + 8 || (Math.abs(is.top - was.top) <= 8 && is.left > was.left)
      expect(onward, `${JSON.stringify(was)} → ${JSON.stringify(is)}`).toBe(true)
    }
    const names = stops.map((s) => s.name)
    const code = names.findIndex((s) => s.startsWith('Har du en rumskod?'))
    const build = names.findIndex((s) => s.startsWith('Börja bygga'))
    expect(code >= 0 && build >= 0, names.join(' | ')).toBe(true)
    expect(width < 560 ? code < build : build < code, names.join(' | ')).toBe(true)
  })
}
