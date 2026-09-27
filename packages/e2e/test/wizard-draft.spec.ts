import { logIn } from '../support/api.js'
import { DESK } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// The draft in the guided start (#476): a reload used to throw away everything typed without a
// word. The browser now asks first, and what was typed is still there when the page comes back —
// and the page coming back makes no game by itself.
test.use({ viewport: DESK.viewport, locale: 'sv-SE' })

test('asks before a reload takes the draft, and gives it back after one', async ({ page }) => {
  await logIn(page.request)
  await page.goto('/new')
  await page.getByLabel('Spelets namn').fill('Skogens herrar')
  await page.getByLabel('kort 1 Titel').fill('Drake')

  const asked: string[] = []
  page.on('dialog', (dialog) => {
    asked.push(dialog.type())
    void dialog.accept()
  })
  await page.reload()
  expect(asked, 'the browser asked before the reload').toEqual(['beforeunload'])

  await expect(page.getByLabel('Spelets namn')).toHaveValue('Skogens herrar')
  await expect(page.getByLabel('kort 1 Titel')).toHaveValue('Drake')
  await expect(page).toHaveURL(/\/new/)
  const games = await (await page.request.get('/projects')).json()
  expect(games).toEqual([])
})
