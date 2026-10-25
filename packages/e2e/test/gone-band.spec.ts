import type { APIRequestContext, Browser } from '@playwright/test'
import { logIn, mailTo, makeProject } from '../support/api.js'
import { DESK } from '../support/devices.js'
import { expect, test } from '../support/test.js'

test.use({ locale: 'sv-SE', viewport: DESK.viewport })

// The band on a co-editor's Mina spel (#1334, beställarens beslut 2026-10-25): the owner takes the
// game away, or deletes her account with it, and Kim, who edited it, is told on her Mina spel which
// game went and why. It stands until she closes it, and closed it does not come back.
async function shared(request: APIRequestContext, browser: Browser, baseURL: string | undefined) {
  await logIn(request)
  const game = await makeProject(request, { name: 'Skogens råd' })
  const kim = `e2e-${crypto.randomUUID()}@example.com`
  expect((await request.post(`/projects/${encodeURIComponent(game.id)}/invites`, { data: { email: kim, role: 'editor' } })).status()).toBe(201)
  const link = /\/invites\/([A-Za-z0-9_-]+)/.exec((await mailTo(kim)).text)?.[1]
  const context = await browser.newContext({ locale: 'sv-SE', viewport: DESK.viewport, ...(baseURL ? { baseURL } : {}) })
  const theirs = await context.newPage()
  await logIn(theirs.request, kim)
  expect((await theirs.request.post(`/invites/${link}`)).status()).toBe(200)
  return { game, context, theirs }
}

test('the owner deletes her account, and the co-editor sees the band until she closes it', async ({ browser, baseURL, page }) => {
  const { game, context, theirs } = await shared(page.request, browser, baseURL)
  try {
    await theirs.goto('/')
    await expect(theirs.locator(`[data-project="${game.id}"]`)).toBeVisible()

    expect((await page.request.delete('/me')).status()).toBe(200)

    await theirs.reload()
    const band = theirs.getByRole('group', { name: 'Skogens råd är borttaget.' })
    await expect(band).toContainText('Skogens råd är borttaget. Ägaren raderade sitt konto.')
    await expect(theirs.locator(`[data-project="${game.id}"]`)).toHaveCount(0)
    // A reload is not a closing.
    await theirs.reload()
    await expect(band).toBeVisible()

    await band.getByRole('button', { name: 'Stäng beskedet om Skogens råd' }).click()
    await expect(band).toHaveCount(0)
    await expect(theirs.getByRole('heading', { level: 1, name: 'Mina spel' })).toBeFocused()
    await theirs.reload()
    await expect(theirs.getByRole('heading', { level: 1, name: 'Mina spel' })).toBeVisible()
    await expect(theirs.getByRole('group', { name: /är borttaget/ })).toHaveCount(0)
    expect(await (await theirs.request.get('/me/gone')).json()).toEqual([])
  } finally {
    await context.close()
  }
})

test('the owner takes the game away, and the band says so', async ({ browser, baseURL, page }) => {
  const { game, context, theirs } = await shared(page.request, browser, baseURL)
  try {
    expect((await page.request.delete(`/projects/${encodeURIComponent(game.id)}`)).status()).toBe(200)
    await theirs.goto('/')
    await expect(theirs.getByRole('group', { name: 'Skogens råd är borttaget.' })).toContainText('Skogens råd är borttaget. Ägaren tog bort spelet.')
  } finally {
    await context.close()
  }
})
