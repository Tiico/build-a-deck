import { expect, test } from '../../support/test.js'
import { logIn, makeProjectOf } from '../../support/api.js'
import { gameDoc } from '../../support/game.js'

// Vad en kolumn är väljs där den görs (#1085, beställarens beslut variant B): en kolumn som görs
// som bild i Tabell tar emot bilder direkt, utan att någon har gått till Mall och bundit ett
// bildlager till den — vilket var det enda sättet förut. Och valet är dokumentets: det står kvar
// efter en omladdning, som allt annat dokumentet bär.
test.use({ viewport: { width: 1280, height: 800 }, locale: 'sv-SE' })

test('a column made a picture in the table takes pictures at once, and still does after a reload', async ({ page }, testInfo) => {
  await logIn(page.request)
  const doc = gameDoc({ name: 'Skogens herrar', cards: 12 })
  doc.rows = doc.rows.map((row) => ({ ...row, fields: { ...row.fields, typ: 'Playcard' } }))
  const project = await makeProjectOf(page.request, doc)
  await page.goto(project.editorUrl)
  await page.locator('#byd-editor-tab-table').click()
  await expect(page.locator('.byd-data-scroll tbody tr').first()).toBeVisible()

  await page.getByRole('button', { name: 'Kolumner', exact: true }).click()
  const door = page.getByRole('group', { name: 'Kolumner', exact: true })
  const form = door.getByRole('form', { name: 'Nytt fält' })
  await form.getByRole('button', { name: 'Bild', exact: true }).click()
  await expect(form.getByRole('textbox', { name: 'Namn' })).toHaveValue('bild1')
  await testInfo.attach('door-picture-chosen', { body: await page.screenshot(), contentType: 'image/png' })
  await form.getByRole('button', { name: 'Lägg till' }).click()

  const cells = page.locator('td.byd-data-image[data-col="bild1"]')
  await expect(cells).toHaveCount(12)
  await expect(cells.first().getByRole('button', { name: /^Välj bild för/ })).toBeVisible()

  // And a text column turned into a picture keeps its text, and says so in its row.
  await page.getByRole('button', { name: 'Kolumner', exact: true }).click()
  await door.getByRole('button', { name: 'Bild, typ' }).click()
  await expect(door.locator('li[data-col="typ"]')).toContainText('12 kort har text i typ.')
  await expect(page.locator('td.byd-data-image[data-col="typ"] .byd-data-kept').first()).toHaveText('Playcard')
  await testInfo.attach('door-typ-made-picture', { body: await page.screenshot(), contentType: 'image/png' })

  await page.reload()
  await page.locator('#byd-editor-tab-table').click()
  await expect(page.locator('td.byd-data-image[data-col="bild1"]')).toHaveCount(12)
  await expect(page.locator('td.byd-data-image[data-col="typ"]')).toHaveCount(12)
})
