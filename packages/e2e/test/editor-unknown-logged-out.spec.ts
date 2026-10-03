import { expect, test } from '@playwright/test'
import { logIn, makeProject } from '../support/api.js'

// Whether a game exists is its owner's to know (G1, #754). Logged out, an unknown id said «Vi
// hittar inte spelet» while a real one went to the login card, so anyone without an account could
// try short readable ids and learn which games there are. Both now go to the login card, with the
// way back; only after logging in does the editor say whether the game is there.
test('sends nobody logged in to the login card, whether or not the game exists', async ({ page, browser, baseURL }) => {
  await logIn(page.request)
  const real = await makeProject(page.request, { name: 'Skogens herrar' })

  for (const editorUrl of [real.editorUrl, '/editor?project=finns-inte']) {
    const nobody = await browser.newContext(baseURL ? { baseURL } : {})
    const visitor = await nobody.newPage()
    await visitor.goto(editorUrl)
    await expect(visitor, editorUrl).toHaveURL(/\/login\?/)
    expect(new URL(visitor.url()).searchParams.get('next'), editorUrl).toBe(editorUrl)
    await nobody.close()
  }

  // Logged in, the editor may say there is no such game: the account is known.
  await page.goto('/editor?project=finns-inte')
  await expect(page.locator('[data-status-notice]').getByRole('heading')).toHaveText(/Vi hittar inte spelet|find (the|that) game/i)
})
