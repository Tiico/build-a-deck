import type { Page } from '@playwright/test'
import { PHONE } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// The question mark is a toggle (L32): pressed while its box is open, it closes the box. It used
// to close it and open it again two milliseconds later, which on the screen was a flicker and a
// box that would not go away. The press moved the focus out of the box and onto the question
// mark, the box closed on losing it, and the click that followed found a closed box and opened
// it. `fireEvent` in jsdom moves no focus, which is why the toggle test there stayed green; the
// press has to be a real one.
//
// And the box is there the moment it is asked for. Its code and its sheet stay out of what the
// first painting waits for (#304, gated in `felt-font.spec.ts`), but they are fetched once the
// page has painted rather than on the first press, which was close to a second on a cold cache.
const ASK = 'Hjälp om inloggningen'

/** Every time the box came or went, from the moment this is called. */
const watchBox = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { boxSeen: boolean[] }
    w.boxSeen = []
    new MutationObserver(() => {
      const open = document.querySelector('.byd-help-box') !== null
      if (w.boxSeen.at(-1) !== open) w.boxSeen.push(open)
    }).observe(document.body, { childList: true, subtree: true })
  })
const boxSeen = (page: Page) => page.evaluate(() => (window as unknown as { boxSeen: boolean[] }).boxSeen)

const openLogin = async (page: Page) => {
  await page.goto('/login?lang=sv')
  await expect(page.getByLabel('E-post')).toBeVisible()
  return page.getByRole('button', { name: ASK })
}

test.describe('the question mark closes its own box', () => {
  test('with a mouse: the second click closes the box, and it does not come back', async ({ page }) => {
    const ask = await openLogin(page)
    await ask.click()
    await expect(page.getByRole('dialog', { name: ASK })).toBeVisible()
    await watchBox(page)
    await ask.click()
    await expect(page.getByRole('dialog', { name: ASK })).toHaveCount(0)
    // Long enough for a reopening to have happened; it came 2 ms after the close.
    await page.waitForTimeout(200)
    expect(await boxSeen(page)).toEqual([false])
    await expect(ask).toHaveAttribute('aria-expanded', 'false')
    await expect(ask).toBeFocused()
  })

  test.describe('on a phone', () => {
    test.use({ viewport: PHONE.viewport, hasTouch: true, isMobile: true })

    test('a second tap closes the box, and it does not come back', async ({ page }) => {
      const ask = await openLogin(page)
      await ask.tap()
      await expect(page.getByRole('dialog', { name: ASK })).toBeVisible()
      await watchBox(page)
      await ask.tap()
      await expect(page.getByRole('dialog', { name: ASK })).toHaveCount(0)
      await page.waitForTimeout(200)
      expect(await boxSeen(page)).toEqual([false])
    })
  })
})

test('the box is fetched before anyone asks for it, so the first press fetches nothing', async ({ page }) => {
  const ask = await openLogin(page)
  await page.waitForLoadState('networkidle')
  const fetched: string[] = []
  page.on('request', (request) => {
    if (['script', 'stylesheet'].includes(request.resourceType())) fetched.push(request.url())
  })
  await ask.click()
  await expect(page.getByRole('dialog', { name: ASK })).toBeVisible()
  expect(fetched).toEqual([])
})
