import { expect, test } from '@playwright/test'
import { logIn } from '../../support/api.js'

// The button that makes the game (#476): «Skapar…» shrank it from 315 to 95 px, and the error was
// written beside it and pushed it 217 px along. A button that moves while it is being pressed is
// a button the next press misses; it now stands where it stood through the wait and the error.
test.use({ viewport: { width: 1280, height: 800 }, locale: 'sv-SE' })

test('stands still while the game is being made and after it could not be', async ({ page }) => {
  await logIn(page.request)
  let release = (): void => undefined
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/projects', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    await held
    await route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' })
  })
  await page.goto('/new')
  await page.getByLabel('Spelets namn').fill('Skogens herrar')
  const button = page.getByRole('button', { name: /Skapa spelet och fortsätt i editorn/ })
  const before = (await button.boundingBox())!

  await button.click()
  const busy = page.locator('.byd-wizard-block > footer .byd-wizard-primary')
  await expect(busy).toHaveAttribute('aria-busy', 'true')
  const waiting = (await busy.boundingBox())!
  expect(Math.abs(waiting.x - before.x)).toBeLessThan(1)
  expect(Math.abs(waiting.width - before.width)).toBeLessThan(1)

  release()
  await expect(page.locator('.byd-wizard-error')).toContainText('Spelet skapades inte.')
  await expect(page.locator('.byd-wizard-error')).toBeFocused()
  const after = (await button.boundingBox())!
  expect(Math.abs(after.x - before.x)).toBeLessThan(1)
  expect(Math.abs(after.y - before.y)).toBeLessThan(1)
  expect(Math.abs(after.width - before.width)).toBeLessThan(1)
})
