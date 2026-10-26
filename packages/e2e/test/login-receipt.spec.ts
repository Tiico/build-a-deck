import type { Locator, Page } from '@playwright/test'
import { expect, test } from '../support/test.js'

// The receipt «Kolla din mejl» on /login (#1360, beställarens beslut A): a typo in the address is
// corrected from the receipt and the link is sent again, the way a reader on a phone does it with the
// keyboard. The suite's server runs with AUTH_BYPASS and logs in on the spot, so the answers a box
// with a mailer gives are played here: a link sent, and the limiter's five an hour per address with
// the wait in Retry-After, as `LoginLimiter` counts it.

test.use({ locale: 'sv-SE', viewport: { width: 375, height: 740 } })

type Asked = string[]
async function aBoxWithAMailer(page: Page, retryAfter: string): Promise<Asked> {
  const asked: Asked = []
  await page.route('**/auth/login', async (route) => {
    const { email } = route.request().postDataJSON() as { email: string }
    asked.push(email)
    if (asked.filter((e) => e === email).length > 5) {
      await route.fulfill({ status: 429, contentType: 'application/json', headers: { 'retry-after': retryAfter }, body: JSON.stringify({ error: 'too many links; try again later' }) })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })
  return asked
}

const focused = (page: Page) => page.evaluate(() => document.activeElement?.textContent ?? document.activeElement?.tagName ?? null)
const box = (l: Locator) => l.evaluate((el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, height: r.height } })
const ring = (l: Locator) => l.evaluate((el) => { const s = getComputedStyle(el); return el.matches(':focus-visible') && s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 })

test('a mistyped address is corrected from the receipt, and the link is sent again until the limiter says when', async ({ page }) => {
  const asked = await aBoxWithAMailer(page, '1380')
  await page.goto('/login')
  const field = page.getByLabel('E-post')
  await field.fill('ada@example.co')
  await field.press('Enter')

  const sent = page.locator('.byd-login-sent')
  await expect(sent.getByText('Kolla din mejl')).toBeVisible()
  await expect(sent).toContainText('ada@example.co.')
  const wrong = sent.getByRole('button', { name: 'Fel adress?' })
  const again = sent.getByRole('button', { name: 'Skicka igen' })
  // The receipt holds the focus the field had, so the next Tab is its first answer, with its ring.
  await page.keyboard.press('Tab')
  await expect(wrong).toBeFocused()
  expect(await ring(wrong)).toBe(true)
  // Inside the receipt, «Fel adress?» first, each a whole press high. Side by side or one under the
  // other is the machine's face to decide (system-ui is DejaVu on CI's Linux), never half of each.
  const [w, a, s] = [await box(wrong), await box(again), await box(sent)]
  const sideBySide = Math.abs(w.top - a.top) < 1
  if (sideBySide) expect(w.right).toBeLessThan(a.left)
  else {
    expect(w.bottom).toBeLessThan(a.top)
    expect(Math.abs(w.right - a.right)).toBeLessThan(1)
  }
  expect(w.left).toBeGreaterThanOrEqual(s.left)
  expect(a.right).toBeLessThanOrEqual(s.right)
  for (const b of [w, a]) expect(b.height).toBeGreaterThanOrEqual(44)

  // «Fel adress?» puts the field back with the address and the caret at its end: one letter fixes it.
  await page.keyboard.press('Enter')
  await expect(field).toBeFocused()
  await expect(field).toHaveValue('ada@example.co')
  await page.keyboard.type('m')
  await expect(field).toHaveValue('ada@example.com')
  await page.keyboard.press('Enter')
  await expect(sent).toContainText('ada@example.com.')
  expect(asked).toEqual(['ada@example.co', 'ada@example.com'])
  await expect(sent.getByText(/En ny länk/)).toHaveCount(0)

  // «Skicka igen» sends at once and says when, and that the earlier link works too.
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await expect(again).toBeFocused()
  await page.keyboard.press('Enter')
  await expect.poll(() => asked.length).toBe(3)
  const clock = await page.evaluate(() => new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }))
  await expect(sent.getByText(/^En ny länk skickades/)).toHaveText(`En ny länk skickades ${clock}. Den förra fungerar också.`)
  await expect(again).toBeFocused()

  // The corrected address has five of its own; the sixth is told in the receipt when the next can go.
  for (let n = 4; n <= 6; n++) {
    await page.keyboard.press('Enter')
    await expect.poll(() => asked.length).toBe(n)
  }
  await expect(sent.getByRole('alert')).toHaveCount(0)
  await page.keyboard.press('Enter')
  await expect.poll(() => asked.length).toBe(7)
  await expect(sent.getByRole('alert')).toHaveText('Fem länkar har gått till den adressen den senaste timmen. Nästa kan skickas om 23 minuter.')
  // The button rests and keeps the focus: another press asks for nothing.
  await expect(again).toHaveAttribute('aria-disabled', 'true')
  await expect(again).toBeFocused()
  expect(await focused(page)).toBe('Skicka igen')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
  expect(asked).toHaveLength(7)
  // Nothing has pushed the card sideways.
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
  expect((await box(sent)).right).toBeLessThanOrEqual((await box(page.locator('.byd-login'))).right)
})
