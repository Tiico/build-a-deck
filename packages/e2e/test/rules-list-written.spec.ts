import { logIn, makeProjectOf, startTable } from '../support/api.js'
import { DESK, PHONE } from '../support/devices.js'
import { gameDoc } from '../support/game.js'
import { expect, test } from '../support/test.js'

// A list written in the rulebook's own page, read as a list on the phone (#707; beställarens beslut
// 2026-10-06: «C med A:s genväg»). ＋ only ever made a paragraph, and «- Dra ett kort.⏎- Spela ett
// kort.» closed into one line, so a list could only come in through an import. Now the open block
// chooses its kind — Stycke · Punktlista · Numrerad lista — and a line that opens with «- » or «1. »
// is a list as well. Both ways are taken here, in the built editor, and read on the phone.
test.use({ viewport: DESK.viewport, locale: 'sv-SE' })

test('a list written in the editor without an import is read as a list on the phone (#707)', async ({ page, player }) => {
  await logIn(page.request)
  const doc = gameDoc({ name: 'Skogens herrar', players: 2 }) as ReturnType<typeof gameDoc> & { rules?: unknown }
  doc.rules = {
    title: 'Skogens herrar',
    blocks: [
      { kind: 'heading', id: 'h1', level: 1, text: 'En tur' },
      { kind: 'text', id: 't1', text: 'Varje tur har tre steg.' },
    ],
  }
  const project = await makeProjectOf(page.request, doc)
  await page.goto(project.editorUrl)
  await page.getByRole('tab', { name: 'Regler' }).click()
  const book = page.locator('[data-rulebook]')

  // The shortcut: the lines are written with their marks, and the block closes as a list.
  await book.getByText('Varje tur har tre steg.').click()
  const field = book.getByRole('textbox', { name: /^Text/ })
  await expect(field).toBeFocused()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('Varje tur har tre steg.\n- Dra ett kort.\n- Spela ett kort.')
  await expect(book.getByText('Rader som börjar med «- » blir en punktlista')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(book.locator('ul > li')).toHaveText(['Dra ett kort.', 'Spela ett kort.'])
  await expect(book.locator('p')).toHaveText(['Varje tur har tre steg.'])

  // The chooser: a block added after the list with ＋, and made a numbered list where it is open.
  await book.locator('ul').hover()
  await book.getByRole('button', { name: 'Lägg till efter listan under En tur' }).click()
  await book.getByRole('group', { name: /^Blockets slag/ }).getByRole('button', { name: 'Numrerad lista' }).click()
  await expect(book.getByRole('textbox', { name: /^Punkt 1/ })).toBeFocused()
  await page.keyboard.type('Kasta ned till sju.')
  await page.keyboard.press('Escape')
  await expect(book.locator('ol > li')).toHaveText(['Kasta ned till sju.'])

  await page.locator('.byd-editor-save').click()
  await expect(page.locator('.byd-editor-saved')).toHaveAttribute('data-unsaved', 'false')

  const started = await startTable(page.request, project.id)
  const seat = doc.setup.seats[0]!
  const ada = await player({ ...started, seats: doc.setup.seats }, { name: 'Ada', seat, device: PHONE })
  // The rules stand in «Mer» on the phone (#1147).
  await ada.page.getByRole('tab', { name: /^Mer/ }).click()
  await ada.page.getByRole('button', { name: 'Regler', exact: true }).click()
  const panel = ada.page.locator('.byd-rules-panel')
  // Read as lists, by what a screen reader is handed: two lists, each with its own points.
  const lists = panel.getByRole('list')
  await expect(lists).toHaveCount(2)
  await expect(lists.nth(0).getByRole('listitem')).toHaveText(['Dra ett kort.', 'Spela ett kort.'])
  await expect(lists.nth(1).getByRole('listitem')).toHaveText(['Kasta ned till sju.'])
  expect(await lists.evaluateAll((els) => els.map((el) => el.tagName))).toEqual(['UL', 'OL'])
  await expect(panel.getByText('Varje tur har tre steg.')).toBeVisible()
})
