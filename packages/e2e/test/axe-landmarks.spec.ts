import { AxeBuilder } from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { join, logIn, makeProject } from '../support/api.js'
import { DESK, TABLETS } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// axe over the routes the pre-beta playtest found moderate violations on (#762): no landmark
// around the start page, the login and /online; no h1 in the editor, on any of its seven tabs and
// on a tablet; and Mallen's layer panel an unnamed aside next to another. The test asks for none
// of moderate impact or worse — serious and critical were already clean on every route, and this
// keeps them so.
const HEAVY = new Set(['moderate', 'serious', 'critical'])

async function violations(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page }).analyze()
  return result.violations
    .filter((v) => HEAVY.has(v.impact ?? ''))
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
}

test.describe('axe finds nothing moderate', () => {
  test.use({ viewport: DESK.viewport })

  test('on the start page, logged out', async ({ page }) => {
    await page.goto('/?lang=sv')
    await expect(page.locator('[data-page="home"] h1')).toBeVisible()
    expect(await violations(page)).toEqual([])
  })

  test('on the login page', async ({ page }) => {
    await page.goto('/login?lang=sv')
    await expect(page.locator('h1')).toBeVisible()
    expect(await violations(page)).toEqual([])
  })

  test('on Mina spel', async ({ page }) => {
    await logIn(page.request)
    await makeProject(page.request, { name: 'Skogens herrar' })
    await page.goto('/?lang=sv')
    await expect(page.getByText('Skogens herrar').first()).toBeVisible()
    expect(await violations(page)).toEqual([])
  })

  test('on /online', async ({ table, open, request }) => {
    const seat = await join(request, table, { name: 'Ada', seat: 'A' })
    const { page } = await open(DESK, `${seat.onlineUrl}&lang=sv`)
    await expect(page.locator('.byd-online-felt')).toBeVisible()
    expect(await violations(page)).toEqual([])
  })

  test('on every tab of the editor', async ({ page }) => {
    await logIn(page.request)
    const project = await makeProject(page.request, { name: 'Skogens herrar', players: 4, cards: 9 })
    await page.goto(`${project.editorUrl}&lang=sv`)
    await expect(page.getByText('Skogens herrar').first()).toBeVisible()
    const found: Record<string, string[]> = {}
    for (const tab of ['wall', 'template', 'table', 'theme', 'media', 'rules', 'tables']) {
      await page.locator(`#byd-editor-tab-${tab}`).click()
      await expect(page.locator(`#byd-editor-tab-${tab}`)).toHaveAttribute('aria-selected', 'true')
      await expect(page.locator(`#byd-editor-panel-${tab}`)).toBeVisible()
      const v = await violations(page)
      if (v.length) found[tab] = v
    }
    expect(found).toEqual({})
  })
})

test('axe finds nothing moderate in the editor on a tablet', async ({ browser, baseURL }) => {
  const tablet = TABLETS[0]!
  const context = await browser.newContext({ viewport: tablet.viewport, hasTouch: !!tablet.hasTouch, isMobile: !!tablet.isMobile, ...(baseURL ? { baseURL } : {}) })
  const page = await context.newPage()
  await logIn(page.request)
  const project = await makeProject(page.request, { name: 'Skogens herrar', players: 4, cards: 9 })
  await page.goto(`${project.editorUrl}&lang=sv`)
  await expect(page.getByText('Skogens herrar').first()).toBeVisible()
  expect(await violations(page)).toEqual([])
  await context.close()
})
