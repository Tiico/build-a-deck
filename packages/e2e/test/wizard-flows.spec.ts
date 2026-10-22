import { logIn } from '../support/api.js'
import { DESK } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// Three of the guide's ways out, as the playtest of 2026-10-02 walked them (#732). Each is walked
// the way a designer walks it, in the built app, with the words the playtest read.
test.use({ viewport: DESK.viewport, locale: 'sv-SE' })

// The door past the guided start (L42, L9): with a title written on card 1, «Skapa ett tomt spel i
// editorn» made a game of no cards and no fields, without a word. It asks first now — the tool's
// one question — and «Avbryt», the answer it opens on, leaves the guide as it was.
test('asks before the empty game leaves behind the cards that were filled in', async ({ page }) => {
  await logIn(page.request)
  await page.goto('/new')
  await page.getByLabel('Spelets namn').fill('Kråkkriget')
  await page.getByLabel('kort 1 Titel').fill('Den gamla björnen')
  const blank = page.getByRole('button', { name: 'Skapa tomt spel' })
  await blank.click()

  const asked = page.getByRole('alertdialog')
  await expect(asked).toContainText('Korten och fälten du har gjort här följer inte med')
  await expect(asked.getByRole('button', { name: 'Avbryt' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(asked).toHaveCount(0)
  await expect(blank).toBeFocused()
  await expect(page).toHaveURL(/\/new/)
  await expect(page.getByLabel('kort 1 Titel')).toHaveValue('Den gamla björnen')
  expect(await (await page.request.get('/projects')).json()).toEqual([])

  await blank.click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Ja, skapa ett tomt spel' }).click()
  await expect(page).toHaveURL(/\/editor\?/)
  expect(await (await page.request.get('/projects')).json()).toHaveLength(1)
})

// The refusal under a picture (#476) was about the picture that stayed. «Ta bort» took that picture
// away and left «Bilden är större än 8 MB» standing under «Ingen bild vald», as if the removal had
// been refused too.
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
const NINE_MB = Buffer.concat([PIXEL, Buffer.alloc(9 * 1024 * 1024 - PIXEL.length)])

test('takes the refusal away with the picture «Ta bort» removes', async ({ page }) => {
  await logIn(page.request)
  await page.goto('/new')
  const file = page.getByLabel('kort 1 Illustration')
  await file.setInputFiles({ name: 'drake.png', mimeType: 'image/png', buffer: PIXEL })
  const picture = page.getByRole('img', { name: 'Förhandsvisning av Illustration' })
  await expect(picture).toBeVisible()
  await file.setInputFiles({ name: 'stor.png', mimeType: 'image/png', buffer: NINE_MB })
  const refusal = page.locator('[data-image-field] [role="alert"]')
  await expect(refusal).toHaveText('Bilden är större än 8 MB. Välj en mindre bild.')
  await expect(picture).toBeVisible()

  await page.locator('[data-image-field]').getByRole('button', { name: 'Ta bort' }).click()
  await expect(picture).toHaveCount(0)
  await expect(page.locator('[data-image-field]').getByText('Ingen bild vald')).toBeVisible()
  await expect(refusal).toHaveCount(0)
})

// The guide lists the fields Titel, Kostnad, Regeltext, Illustration; the table the editor opens on
// showed the picture first and the cost last, because it read the columns off the frame face by
// face (L4, L44). The order the fields were listed in is the order the game is made with.
test('opens the editor s table with the columns in the order the guide listed them', async ({ page }) => {
  await logIn(page.request)
  await page.goto('/new')
  await page.getByLabel('Spelets namn').fill('Kolumnerna')
  await page.getByRole('button', { name: /Skapa spelet/ }).click()
  await expect(page).toHaveURL(/\/editor\?/)
  await page.locator('#byd-editor-tab-table').click()
  // The count stands on the rail beside the card's id, before them all (#695).
  const listed = ['antal', 'title', 'Kostnad', 'Regeltext', 'Illustration']
  await expect(page.locator('table.byd-data th[data-col]').first()).toBeVisible()
  const columns = await page.locator('table.byd-data th[data-col]').evaluateAll((cells) => cells.map((cell) => cell.getAttribute('data-col')))
  expect(columns.filter((col) => listed.includes(col!))).toEqual(listed)
})
