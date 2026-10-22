import type { Page } from '@playwright/test'
import { logIn, makeProjectOf } from '../support/api.js'
import { DESK } from '../support/devices.js'
import { gameDoc } from '../support/game.js'
import { expect, test } from '../support/test.js'

// The icon sheet while the two libraries are still on their way (#1087, L71).
//
// game-icons and Lucide are several megabytes behind a dynamic import, and Deckster's own symbols
// are in the editor already. The sheet used to wait for all of it before it showed anything, so on
// a busy machine «svärd» found nothing for a minute: `symbol-font-arriving.spec` timed out on the
// Deckster sword with the sheet still saying the libraries were being read in. Held on the wire
// here until the test lets them through, so the order is certain.
test.use({ viewport: DESK.viewport, locale: 'sv-SE' })

async function holdLibraries(page: Page): Promise<() => void> {
  let release!: () => void
  const held = new Promise<void>((resolve) => (release = resolve))
  await page.route(
    (url) => /\/assets\/(icons|icon-sources)-[\w-]+\.js$/.test(url.pathname),
    async (route) => {
      await held
      await route.continue()
    },
  )
  return release
}

test('Deckster’s own symbols are found and taken while the libraries are still loading', async ({ page }) => {
  await logIn(page.request)
  const project = await makeProjectOf(page.request, gameDoc({ name: 'Ikonleken', cards: 3 }))
  const release = await holdLibraries(page)
  await page.goto(project.editorUrl)
  await page.getByRole('tab', { name: 'Mall' }).click()
  const tools = page.getByRole('toolbar', { name: 'Verktyg' })
  await expect(tools).toBeVisible()

  await tools.getByRole('button', { name: 'Ikon', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'Sök i ikonbiblioteken' })
  await sheet.getByRole('searchbox').fill('svärd')
  await expect(sheet.getByRole('status')).toHaveText('Game Icons och Lucide läses in …')
  await expect(sheet.getByRole('button', { name: /^svärd · Deckster/ })).toBeVisible()
  await expect(sheet.getByRole('button', { name: / · Game Icons · / })).toHaveCount(0)

  release()
  await expect(sheet.getByRole('button', { name: /^crossed-swords · Game Icons · / })).toBeVisible()
  await expect(sheet.getByRole('status')).toHaveCount(0)
  // Deckster's own still come first.
  await expect(sheet.getByRole('list', { name: 'Träffar' }).getByRole('button').first()).toHaveAccessibleName(/^svärd · Deckster/)

  await sheet.getByRole('button', { name: /^svärd · Deckster/ }).click()
  await expect(page.locator('#canvas [data-element="icon-1"] img.byd-icon')).toBeAttached()
})
