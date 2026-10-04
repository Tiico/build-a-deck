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

// A draft with a big picture in it (#686): every keystroke after the picture hit the tab's storage
// quota and was dropped without a word, so a reload gave back the draft from before the picture —
// one card, no picture. The picture is a real 1 × 1 PNG grown to 5 MB, under the 8 MB the service
// keeps, and far over what a tab's storage holds as text.
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
const BIG = Buffer.concat([PIXEL, Buffer.alloc(5 * 1024 * 1024 - PIXEL.length)])

test('gives back a draft with a 5 MB picture and six cards after a reload (#686)', async ({ page }) => {
  await logIn(page.request)
  await page.goto('/new')
  await page.getByLabel('Spelets namn').fill('Skogens herrar')
  await page.getByLabel('kort 1 Illustration').setInputFiles({ name: 'drake.png', mimeType: 'image/png', buffer: BIG })
  await expect(page.getByRole('img', { name: 'Förhandsvisning av Illustration' })).toBeVisible()
  for (let n = 2; n <= 6; n++) {
    await page.getByRole('button', { name: '+ Nytt kort' }).click()
    await page.getByLabel(`kort ${n} Titel`).fill(`Drake ${n}`)
  }

  page.on('dialog', (dialog) => void dialog.accept())
  await page.reload()

  await expect(page.getByLabel('Spelets namn')).toHaveValue('Skogens herrar')
  const tabs = page.locator('.byd-wizard-card-tabs .byd-choice')
  await expect(tabs).toHaveCount(6)
  await expect(tabs.nth(5)).toContainText('Drake 6')
  await tabs.first().click()
  const picture = page.getByRole('img', { name: 'Förhandsvisning av Illustration' })
  await expect(picture).toBeVisible()
  expect((await picture.getAttribute('src'))?.length, 'the whole picture came back').toBeGreaterThan(5 * 1024 * 1024)
  await expect(page.locator('.byd-wizard [role="alert"]')).toHaveCount(0)
})

// The same draft through the login round (#686): «Skapa» without an account keeps the draft and
// goes to log in, and the way back makes the game — with the picture, not the draft from before it.
test('makes the game with its 5 MB picture on the way back from a login (#686)', async ({ page }) => {
  await page.goto('/new')
  await page.getByLabel('Spelets namn').fill('Skogens herrar')
  await page.getByLabel('kort 1 Illustration').setInputFiles({ name: 'drake.png', mimeType: 'image/png', buffer: BIG })
  await expect(page.getByRole('img', { name: 'Förhandsvisning av Illustration' })).toBeVisible()
  await page.getByRole('button', { name: '+ Nytt kort' }).click()
  await page.getByLabel('kort 2 Titel').fill('Drake 2')
  await page.getByRole('button', { name: /Skapa spelet och fortsätt i editorn/ }).click()
  await expect(page).toHaveURL(/\/login\?/)

  await logIn(page.request)
  const sent: number[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/assets') sent.push(request.postDataBuffer()?.length ?? 0)
  })
  const next = new URL(page.url()).searchParams.get('next') ?? ''
  expect(next).toContain('resume=1')
  await page.goto(next)
  await expect(page).toHaveURL(/\/editor\?/)
  expect(sent, 'the picture went up with the game').toContain(BIG.length)
  const games = (await (await page.request.get('/projects')).json()) as unknown[]
  expect(games).toHaveLength(1)
})
