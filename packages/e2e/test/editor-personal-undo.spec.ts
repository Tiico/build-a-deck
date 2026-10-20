import type { APIRequestContext, Page } from '@playwright/test'
import type { ProjectDoc } from '@byd/server'
import { DESK } from '../support/devices.js'
import { twoEditors } from '../support/editors.js'
import { expect, test } from '../support/test.js'

// Personlig ångra i editorn (#1056, L14, D3). Ada äger spelet och Bo redigerar det med henne, var
// och en i sin egen webbläsare. Ett steg tillbaka var förut hela dokumentet som det såg ut före
// Adas ändring, skickat som `restore`: det Bo hunnit skriva i en annan del av spelet försvann tyst,
// på båda skärmarna och i versionen som sparades. Nu tar ångra bara tillbaka det Ada själv ändrade,
// och vägrar med en mening när Bo har ändrat just det sedan dess.
test.use({ viewport: DESK.viewport, locale: 'sv-SE' })

const ADA = 'Ada skrev det här.'
const BO = 'Bo skrev det här.'

const undo = (page: Page) => page.getByRole('button', { name: /^Ångra/ }).first()
const redo = (page: Page) => page.getByRole('button', { name: /^Gör om/ }).first()
const notice = (page: Page) => page.locator('.byd-editor-notice')

async function tab(page: Page, name: 'Tabell' | 'Regler' | 'Mall'): Promise<void> {
  const it = page.getByRole('tab', { name })
  await it.click()
  await expect(it).toHaveAttribute('aria-selected', 'true')
}

// En cell i Tabell skriven över och lämnad, som en formgivare gör det.
async function writeCell(page: Page, cell: string, value: string): Promise<void> {
  await tab(page, 'Tabell')
  const box = page.getByRole('textbox', { name: cell })
  await box.click()
  await box.fill(value)
  await box.press('Tab')
}
const cell = (page: Page, name: string) => page.getByRole('textbox', { name })

// Ett stycke i Regler skrivet över: öppnat där det står, och stängt igen.
async function writeParagraph(page: Page, was: string, now: string): Promise<void> {
  await tab(page, 'Regler')
  const book = page.locator('[data-rulebook]')
  await book.getByText(was).click()
  const field = book.getByRole('textbox', { name: /^Text/ })
  await expect(field).toBeFocused()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type(now)
  await page.keyboard.press('Escape')
  await expect(field).toHaveCount(0)
}
const paragraphs = (page: Page) => page.locator('[data-rulebook] [data-block^="t"] p')

// Lagret `title` på framsidan, flyttat i sidled i egenskapspanelen.
const titleX = (page: Page) => page.locator('.byd-props-f input').first()
async function moveTitle(page: Page, x: string): Promise<void> {
  await tab(page, 'Mall')
  await page.getByRole('button', { name: /^title\b/ }).first().click()
  await titleX(page).fill(x)
  await titleX(page).press('Enter')
}

// Versionen som sparas från Adas editor, läst tillbaka ur lagret.
async function stored(page: Page, request: APIRequestContext, id: string): Promise<ProjectDoc> {
  await page.locator('.byd-editor-save').click()
  await expect(page.locator('.byd-editor-saved-word')).toHaveText('Sparat')
  const res = await request.get(`/projects/${encodeURIComponent(id)}`)
  return (await res.json()) as ProjectDoc
}
const texts = (doc: ProjectDoc) => (doc.rules?.blocks ?? []).flatMap((b) => (b.kind === 'text' ? [b.text] : []))
const title = (doc: ProjectDoc, id: string) => doc.rows.find((r) => r.id === id)?.fields['title']

test('ångra tar tillbaka Adas kort och lämnar Bos stycke i Regler, och gör om lägger tillbaka kortet (#1056)', async ({ browser, baseURL, page }) => {
  const game = await twoEditors(browser, baseURL, page)
  try {
    await page.goto(game.editorUrl)
    await game.bo.goto(game.editorUrl)

    await writeCell(page, 'kort-1 title', ADA)
    await writeParagraph(game.bo, 'Första stycket.', BO)
    // Bos stycke har nått Ada innan hon ångrar.
    await tab(page, 'Regler')
    await expect(paragraphs(page)).toHaveText([BO, 'Andra stycket.'])

    await undo(page).click()
    await expect(page.locator('.byd-editor-confirm')).toHaveText('Tog tillbaka: en ändring i kortleken')
    await expect(paragraphs(page)).toHaveText([BO, 'Andra stycket.'])
    await expect(paragraphs(game.bo)).toHaveText([BO, 'Andra stycket.'])
    await tab(page, 'Tabell')
    await expect(cell(page, 'kort-1 title')).toHaveValue('Björn 1')
    await tab(game.bo, 'Tabell')
    await expect(cell(game.bo, 'kort-1 title')).toHaveValue('Björn 1')

    await redo(page).click()
    await expect(cell(page, 'kort-1 title')).toHaveValue(ADA)
    await expect(cell(game.bo, 'kort-1 title')).toHaveValue(ADA)
    const doc = await stored(page, page.request, game.id)
    expect(title(doc, 'kort-1')).toBe(ADA)
    expect(texts(doc)).toEqual([BO, 'Andra stycket.'])
  } finally {
    await game.close()
  }
})

test('ångra i Regler tar tillbaka Adas stycke och lämnar Bos (#1056)', async ({ browser, baseURL, page }) => {
  const game = await twoEditors(browser, baseURL, page)
  try {
    await page.goto(game.editorUrl)
    await game.bo.goto(game.editorUrl)

    await writeParagraph(page, 'Första stycket.', ADA)
    await tab(game.bo, 'Regler')
    await expect(paragraphs(game.bo)).toHaveText([ADA, 'Andra stycket.'])
    await writeParagraph(game.bo, 'Andra stycket.', BO)
    await expect(paragraphs(page)).toHaveText([ADA, BO])

    await undo(page).click()
    await expect(paragraphs(page)).toHaveText(['Första stycket.', BO])
    await expect(paragraphs(game.bo)).toHaveText(['Första stycket.', BO])
    expect(texts(await stored(page, page.request, game.id))).toEqual(['Första stycket.', BO])
  } finally {
    await game.close()
  }
})

test('ångra i Mall tar tillbaka Adas flytt och lämnar Bos kort (#1056)', async ({ browser, baseURL, page }) => {
  const game = await twoEditors(browser, baseURL, page)
  try {
    await page.goto(game.editorUrl)
    await game.bo.goto(game.editorUrl)

    await moveTitle(page, '9')
    await writeCell(game.bo, 'kort-2 title', BO)
    await tab(page, 'Tabell')
    await expect(cell(page, 'kort-2 title')).toHaveValue(BO)

    await tab(page, 'Mall')
    await undo(page).click()
    await expect(page.locator('.byd-editor-confirm')).toHaveText('Tog tillbaka: en ändring i mallen')
    await page.getByRole('button', { name: /^title\b/ }).first().click()
    await expect(titleX(page)).toHaveValue('5')
    await expect(cell(game.bo, 'kort-2 title')).toHaveValue(BO)
    const doc = await stored(page, page.request, game.id)
    expect(title(doc, 'kort-2')).toBe(BO)
    expect(doc.template.faces['front']?.base.find((e) => e.id === 'title')).toMatchObject({ x: 5 })
  } finally {
    await game.close()
  }
})

test('ångra vägrar med en mening när Bo har ändrat samma cell sedan dess, och skriver inte över honom (#1056)', async ({ browser, baseURL, page }) => {
  const game = await twoEditors(browser, baseURL, page)
  try {
    await page.goto(game.editorUrl)
    await game.bo.goto(game.editorUrl)

    await writeCell(page, 'kort-1 title', ADA)
    await tab(game.bo, 'Tabell')
    await expect(cell(game.bo, 'kort-1 title')).toHaveValue(ADA)
    await writeCell(game.bo, 'kort-1 title', BO)
    await expect(cell(page, 'kort-1 title')).toHaveValue(BO)

    await undo(page).click()
    await expect(notice(page)).toHaveText('Det gick inte att ångra en ändring i kortleken: någon annan har ändrat samma sak sedan dess. Inget skrevs över.')
    await expect(cell(page, 'kort-1 title')).toHaveValue(BO)
    await expect(cell(game.bo, 'kort-1 title')).toHaveValue(BO)
    // Steget som inte gick att ta tillbaka är borta ur stacken: knappen har inget mer att ångra.
    await expect(undo(page)).toHaveAttribute('aria-disabled', 'true')
    expect(title(await stored(page, page.request, game.id), 'kort-1')).toBe(BO)
  } finally {
    await game.close()
  }
})

test('ångra i Mall vägrar när Bo har flyttat samma lager sedan dess (#1056)', async ({ browser, baseURL, page }) => {
  const game = await twoEditors(browser, baseURL, page)
  try {
    await page.goto(game.editorUrl)
    await game.bo.goto(game.editorUrl)

    await moveTitle(page, '9')
    await tab(game.bo, 'Mall')
    await game.bo.getByRole('button', { name: /^title\b/ }).first().click()
    await expect(titleX(game.bo)).toHaveValue('9')
    await moveTitle(game.bo, '12')
    await expect(titleX(page)).toHaveValue('12')

    await undo(page).click()
    await expect(notice(page)).toHaveText('Det gick inte att ångra en ändring i mallen: någon annan har ändrat samma sak sedan dess. Inget skrevs över.')
    await expect(titleX(page)).toHaveValue('12')
    await expect(titleX(game.bo)).toHaveValue('12')
  } finally {
    await game.close()
  }
})

// Ett nytt kort, och en ny kolumn från Bo (#1069). Kolumnen skriver en tom cell i varje kort, Adas
// också, och den räknades som att Bo hade ändrat hennes kort: ångra vägrades. Den tomma cellen är
// ingenting Bo skrev, så kortet går, och Bos kolumn står kvar på de andra korten.
const NEW_CARD = 'kort-13'
async function addCard(page: Page): Promise<void> {
  await tab(page, 'Tabell')
  await page.getByRole('button', { name: '+ Nytt kort' }).click()
  await expect(page.locator(`tr[data-card-ref="${NEW_CARD}"]`)).toBeVisible()
}
async function addColumn(page: Page, name: string): Promise<void> {
  await tab(page, 'Tabell')
  await page.getByRole('button', { name: 'Kolumner' }).click()
  const form = page.getByRole('form', { name: 'Nytt fält' })
  await form.getByLabel('Namn').fill(name)
  await form.getByRole('button', { name: 'Lägg till' }).click()
  await page.keyboard.press('Escape')
}
const card = (page: Page, id: string) => page.locator(`tr[data-card-ref="${id}"]`)

test('ångra tar bort Adas nya kort fast Bo har lagt till en kolumn sedan, och Bos kolumn står kvar (#1069)', async ({ browser, baseURL, page }) => {
  const game = await twoEditors(browser, baseURL, page)
  try {
    await page.goto(game.editorUrl)
    await game.bo.goto(game.editorUrl)

    await addCard(page)
    await tab(game.bo, 'Tabell')
    await expect(card(game.bo, NEW_CARD)).toBeVisible()
    await addColumn(game.bo, 'Kraft')
    await expect(cell(page, `${NEW_CARD} Kraft`)).toHaveValue('')

    await undo(page).click()
    await expect(page.locator('.byd-editor-confirm')).toHaveText('Tog tillbaka: en ändring i kortleken')
    await expect(notice(page)).toHaveCount(0)
    for (const editor of [page, game.bo]) {
      await expect(card(editor, NEW_CARD)).toHaveCount(0)
      await expect(cell(editor, 'kort-1 Kraft')).toHaveValue('')
    }
    const doc = await stored(page, page.request, game.id)
    expect(doc.rows.map((r) => r.id)).not.toContain(NEW_CARD)
    expect(doc.rows.every((r) => r.fields['Kraft'] === '')).toBe(true)
  } finally {
    await game.close()
  }
})

test('ångra vägrar ta bort Adas nya kort när Bo har skrivit i det, i sin nya kolumn (#1069)', async ({ browser, baseURL, page }) => {
  const game = await twoEditors(browser, baseURL, page)
  try {
    await page.goto(game.editorUrl)
    await game.bo.goto(game.editorUrl)

    await addCard(page)
    await tab(game.bo, 'Tabell')
    await expect(card(game.bo, NEW_CARD)).toBeVisible()
    await addColumn(game.bo, 'Kraft')
    await writeCell(game.bo, `${NEW_CARD} Kraft`, '3')
    await expect(cell(page, `${NEW_CARD} Kraft`)).toHaveValue('3')

    await undo(page).click()
    await expect(notice(page)).toHaveText('Det gick inte att ångra en ändring i kortleken: någon annan har ändrat samma sak sedan dess. Inget skrevs över.')
    await expect(cell(page, `${NEW_CARD} Kraft`)).toHaveValue('3')
    await expect(cell(game.bo, `${NEW_CARD} Kraft`)).toHaveValue('3')
  } finally {
    await game.close()
  }
})

test('gör om vägrar när Bo har skrivit i cellen efter att Ada ångrat (#1056)', async ({ browser, baseURL, page }) => {
  const game = await twoEditors(browser, baseURL, page)
  try {
    await page.goto(game.editorUrl)
    await game.bo.goto(game.editorUrl)

    await writeCell(page, 'kort-1 title', ADA)
    await undo(page).click()
    await expect(cell(page, 'kort-1 title')).toHaveValue('Björn 1')
    await tab(game.bo, 'Tabell')
    await expect(cell(game.bo, 'kort-1 title')).toHaveValue('Björn 1')
    await writeCell(game.bo, 'kort-1 title', BO)
    await expect(cell(page, 'kort-1 title')).toHaveValue(BO)

    await redo(page).click()
    await expect(notice(page)).toHaveText('Det gick inte att göra om en ändring i kortleken: någon annan har ändrat samma sak sedan dess. Inget skrevs över.')
    await expect(cell(page, 'kort-1 title')).toHaveValue(BO)
    await expect(cell(game.bo, 'kort-1 title')).toHaveValue(BO)
  } finally {
    await game.close()
  }
})
