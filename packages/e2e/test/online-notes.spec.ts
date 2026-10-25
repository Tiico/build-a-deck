import { join, withQuery } from '../support/api.js'
import { DESK } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// Bordets anteckningsblock, dator till dator (#1131, beställarens beslut B · Spalten): två spelare på
// /online skriver i samma block. Det ena fönstret skriver och bockar, det andra ser raden med vem som
// skrev den, och en hopfälld spalt säger att någon annan har skrivit.
test.describe('the notepad between two computers (#1131)', () => {
  test.use({ viewport: DESK.viewport })

  test('a row written at one computer reaches the other with who wrote it, is ticked there, and lights the folded rail', async ({ tableOf, open, request }) => {
    const table = await tableOf({ players: 2, counters: [], cards: 8, copies: 1 })
    const ada = await join(request, table, { name: 'Ada', seat: 'A' })
    const bo = await join(request, table, { name: 'Bo', seat: 'B' })
    const { page: adas } = await open(DESK, withQuery(ada.onlineUrl, `lang=sv`))
    const { page: bos } = await open(DESK, withQuery(bo.onlineUrl, `lang=sv`))
    const notesOf = (page: typeof adas) => page.getByRole('complementary', { name: 'Anteckningar' })

    // The column stands beside the felt, and the page still never scrolls sideways (L10).
    await expect(notesOf(adas)).toBeVisible()
    await expect(notesOf(adas).getByText(/Det ni skriver här ser alla vid bordet/)).toBeVisible()
    expect(await adas.evaluate('document.documentElement.scrollWidth <= innerWidth')).toBe(true)

    await notesOf(adas).getByRole('textbox', { name: 'Ny anteckning' }).fill('Poäng: Ada 7, Bo 4')
    await notesOf(adas).getByRole('textbox', { name: 'Ny anteckning' }).press('Enter')
    const row = notesOf(bos).getByRole('listitem').filter({ hasText: 'Poäng: Ada 7, Bo 4' })
    await expect(row).toBeVisible()
    await expect(row.locator('[data-note-by]')).toHaveText('Ada')

    await row.getByRole('checkbox', { name: 'Klar: Poäng: Ada 7, Bo 4' }).check()
    await expect(notesOf(adas).getByRole('checkbox', { name: 'Klar: Poäng: Ada 7, Bo 4' })).toBeChecked()

    // Bo folds his column; Ada writes; Bo's rail says so, and opening it shows the row.
    await notesOf(bos).getByRole('button', { name: 'Anteckningar' }).click()
    await expect(notesOf(bos).getByRole('list')).toHaveCount(0)
    await notesOf(adas).getByRole('textbox', { name: 'Ny anteckning' }).fill('Bo har en extra tur')
    await notesOf(adas).getByRole('textbox', { name: 'Ny anteckning' }).press('Enter')
    const rail = notesOf(bos).getByRole('button', { name: 'Anteckningar, nytt från någon annan' })
    await expect(rail).toBeVisible()
    await rail.click()
    await expect(notesOf(bos).getByRole('listitem').filter({ hasText: 'Bo har en extra tur' })).toBeVisible()

    // A row rewritten where it stands at one computer is the row at the other.
    await notesOf(bos).getByRole('button', { name: 'Ändra: Bo har en extra tur' }).click()
    await notesOf(bos).getByRole('textbox', { name: 'Ändra: Bo har en extra tur' }).fill('Bo har två extra turer')
    await notesOf(bos).getByRole('textbox', { name: 'Ändra: Bo har en extra tur' }).press('Enter')
    await expect(notesOf(adas).getByRole('listitem').filter({ hasText: 'Bo har två extra turer' }).locator('[data-note-by]')).toHaveText('Ada')
  })
})
