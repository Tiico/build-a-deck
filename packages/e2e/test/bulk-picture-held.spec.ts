import type { Page } from '@playwright/test'
import { CARD_STANDARD_63x88 } from '@byd/engine'
import { newElement } from '../../web/src/editor/canvas.js'
import type { ProjectDoc } from '../../web/src/editor/types.js'
import { logIn, makeProjectOf } from '../support/api.js'
import { dropOn } from '../support/drop.js'
import { DESK } from '../support/devices.js'
import { gameDoc } from '../support/game.js'
import { expect, test } from '../support/test.js'

// A picture chosen from the library for the marked cards waits in the action row until «Sätt
// bild på N kort» is pressed, the way a dropped picture and an uploaded file already do (E1).
// It used to be written the moment the library's own button was pressed, leaving the row empty
// and its button disabled — the designer's report of 2026-10-22: the picture was set as soon as
// it was chosen and not when the button was clicked.
test.use({ viewport: DESK.viewport, locale: 'sv-SE' })

// The smallest real PNG: one transparent pixel, so the library can draw what it holds.
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

function withPictureColumn(): ProjectDoc {
  const doc = gameDoc({ name: 'Skogens herrar', cards: 3 }) as unknown as ProjectDoc
  const el = newElement('image', { taken: ['frame', 'title', 'body'], field: 'bild', card: CARD_STANDARD_63x88.physical })
  doc.template.faces['front']!.base.push(el)
  return doc
}

// A card that holds a picture offers to replace it; one that holds none offers to choose (L73).
const holdsOne = (page: Page, cardRef: string) => page.getByRole('button', { name: `Byt bild för ${cardRef}` })

test('a picture chosen from the library for the marked cards is held in the row until its button is pressed', async ({ page }, testInfo) => {
  await logIn(page.request)
  const project = await makeProjectOf(page.request, withPictureColumn())
  await page.goto(project.editorUrl)
  await page.locator('#byd-editor-tab-table').click()
  // The game gets a picture the way the playtest gave it one: a file into a card's own cell —
  // dropped on its tile, since L73.
  await dropOn(page.getByRole('group', { name: 'Bild för kort-1' }), { name: 'drake.png', mimeType: 'image/png', buffer: PIXEL })
  await expect(holdsOne(page, 'kort-1')).toBeVisible()

  await page.getByLabel('markera kort-2').check()
  await page.getByLabel('markera kort-3').check()
  const row = page.getByRole('toolbar', { name: 'Markerade kort' })
  await row.getByRole('button', { name: 'Sätt fält' }).click()
  await row.getByLabel('Kolumn').selectOption('bild')
  const setButton = row.getByRole('button', { name: 'Sätt bild på 2 kort' })
  await expect(setButton).toBeDisabled()

  // The row's tile (L73): named «Välj …» while the row is empty and «Byt …» once it holds a
  // picture, so it is found by its slot and not by its name.
  const opener = row.getByRole('group', { name: 'Bild för de markerade korten' }).getByRole('button')
  await expect(opener).toHaveAccessibleName('Välj bild för de markerade korten')
  await opener.click()
  const dialog = page.getByRole('dialog', { name: 'Bilder i spelet' })
  await expect(dialog.getByText('2 markerade kort, bildfältet bild')).toBeVisible()
  await dialog.getByRole('button', { name: 'drake.png', exact: true }).click()
  await testInfo.attach('library-picked', { body: await page.screenshot(), contentType: 'image/png' })
  await dialog.getByRole('button', { name: 'Välj bilden' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(opener).toBeFocused()

  // The row holds the picture; the cards do not have it yet.
  await expect(row.locator('img[alt="Bild för de markerade korten"]')).toBeVisible()
  await expect(holdsOne(page, 'kort-2')).toHaveCount(0)
  await expect(holdsOne(page, 'kort-3')).toHaveCount(0)
  await expect(setButton).toBeEnabled()
  await testInfo.attach('row-holds-picture', { body: await page.screenshot(), contentType: 'image/png' })

  await setButton.click()
  await expect(holdsOne(page, 'kort-2')).toBeVisible()
  await expect(holdsOne(page, 'kort-3')).toBeVisible()
  await expect(page.getByText('Bilden drake.png ligger nu på 2 kort.')).toBeVisible()
  // The row lets the picture go once it is set: a held picture and a new marking is a picture
  // written by mistake.
  await expect(row.locator('img[alt="Bild för de markerade korten"]')).toHaveCount(0)
  await testInfo.attach('cards-written', { body: await page.screenshot(), contentType: 'image/png' })

  // And it is the document's, not the screen's.
  await page.reload()
  await page.locator('#byd-editor-tab-table').click()
  await expect(holdsOne(page, 'kort-2')).toBeVisible()
  await expect(holdsOne(page, 'kort-3')).toBeVisible()
})
