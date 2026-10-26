import type { Page } from '@playwright/test'
import { logIn, makeProject, startTable, withQuery } from '../support/api.js'
import { DESK, TV } from '../support/devices.js'
import { watchWire } from '../support/frames.js'
import { expect, test } from '../support/test.js'

// Tärningar som designern lägger i fliken Bord ligger på bordet som startas (#1139, K28).
//
// Raden i editorn skriver `setup.dice` genom projektets redigeringar; servern bygger bordet ur den
// sparade versionen med `setupFromProject`. Det som bara en riktig stack kan vara fel om är hela
// vägen: valen i den byggda editorn, versionen som sparas, och bordet som föds ur den.
test.use({ viewport: DESK.viewport })

// Hur många tärningar av en sort tråden har sagt att en zon har: varje komponent med sorten som
// `cardRef`, räknad på sitt eget id. Tärningar är offentliga (B6), så alla får veta dem.
function diceIn(frames: readonly string[], zone: string, kind: string): number {
  const ids = new Set<string>()
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) return void node.forEach(walk)
    if (node === null || typeof node !== 'object') return
    const o = node as Record<string, unknown>
    if (o['zone'] === zone && o['cardRef'] === kind && typeof o['id'] === 'string') ids.add(o['id'])
    Object.values(o).forEach(walk)
  }
  for (const frame of frames) {
    try {
      walk(JSON.parse(frame))
    } catch {
      continue
    }
  }
  return ids.size
}

async function openBord(page: Page): Promise<string> {
  await logIn(page.request)
  const project = await makeProject(page.request, { name: 'Tärningsspelet', players: 3, counters: [], cards: 6 })
  await page.goto(`${project.editorUrl}&lang=sv`)
  await expect(page.getByText('Tärningsspelet').first()).toBeVisible()
  await page.locator('#byd-editor-tab-tables').click()
  return project.id
}

// ＋ Tärning sits in the menu of the zone it is laid in (#1403, beslut C).
async function addIn(page: Page, node: string, item: string): Promise<void> {
  await page.getByRole('button', { name: `Lägg till i ${node}` }).click()
  await page.getByRole('menuitem', { name: item }).click()
}

test.describe('tärningarna i fliken Bord', () => {
  test('läggs till i editorn, sparas och ligger där de ska när ett bord startas', async ({ page, browser, baseURL }) => {
    const project = await openBord(page)

    // «2 d6 per spelare i Framför»: en yta vid platserna, så varje plats får två i sin egen.
    await addIn(page, 'Framför', '＋ Tärning')
    await expect(page.getByRole('spinbutton', { name: 'Antal för tärning 1' })).toBeFocused()
    await page.getByRole('spinbutton', { name: 'Antal för tärning 1' }).fill('2')
    await page.getByRole('spinbutton', { name: 'Antal för tärning 1' }).press('Enter')
    await expect(page.getByRole('combobox', { name: 'Hur antalet räknas för tärning 1' })).toHaveCount(0)

    // «1 d20 totalt i Spelyta», med tangentbordet hela vägen: ＋, pilarna till Tärning, Enter.
    await page.getByRole('button', { name: 'Lägg till i Spelyta' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('menuitem', { name: '＋ Yta' })).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('menuitem', { name: '＋ Tärning' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('spinbutton', { name: 'Antal för tärning 2' })).toBeFocused()
    await page.getByRole('combobox', { name: 'Sort för tärning 2' }).selectOption({ label: 'd20' })
    await expect(page.getByRole('combobox', { name: 'Hur antalet räknas för tärning 2' })).toHaveValue('total')

    await page.locator('.byd-editor-save').click()
    await expect(page.locator('.byd-editor-saved-word')).toHaveText('Sparat')

    const table = await startTable(page.request, project)
    const tv = await browser.newContext({ viewport: TV.viewport, ...(baseURL ? { baseURL } : {}) })
    const screen = await tv.newPage()
    const wire = watchWire(screen)
    await screen.goto(withQuery(table.tvUrl, 'lang=sv'))
    await expect(screen.locator('.byd-tv-head')).toContainText('Tärningsspelet')

    for (const seat of ['A', 'B', 'C']) await expect.poll(() => diceIn(wire.received(), `mine:${seat}`, 'd6'), { message: `två d6 framför ${seat}` }).toBe(2)
    await expect.poll(() => diceIn(wire.received(), 'table', 'd20'), { message: 'en d20 på spelytan' }).toBe(1)
    expect(diceIn(wire.received(), 'table', 'd6')).toBe(0)
    await tv.close()
  })

  // Raden är en rad med avsikt (#1139, #1403): antal, sort och hur antalet räknas på en linje under
  // radens namn, inne i kolumnen, och krysset på namnets rad och inte bland fälten.
  test('håller fälten på en rad i kolumnen, krysset på namnets rad', async ({ page }) => {
    await openBord(page)
    await addIn(page, 'Spelyta', '＋ Tärning')
    await addIn(page, 'Framför', '＋ Tärning')
    const column = (await page.locator('.byd-setup-side').boundingBox())!
    for (const n of [1, 2]) {
      // Fälten står bakom raden; den senast lagda står öppen, den andra öppnas.
      const row = page.locator(`[data-material-row="die:${n - 1}"]`)
      if ((await row.getAttribute('data-open')) !== 'true') await row.locator('.byd-setup-name').click()
      const box = async (name: string, role: 'spinbutton' | 'combobox' | 'button') => (await page.getByRole(role, { name }).boundingBox())!
      const count = await box(`Antal för tärning ${n}`, 'spinbutton')
      const kind = await box(`Sort för tärning ${n}`, 'combobox')
      const remove = await box(`Ta bort tärning ${n}`, 'button')
      const mid = (b: { y: number; height: number }) => b.y + b.height / 2
      expect(Math.abs(mid(kind) - mid(count)), `tärning ${n}: sorten på antalets rad`).toBeLessThan(2)
      expect(kind.x + kind.width, `tärning ${n}: fälten inne i kolumnen`).toBeLessThanOrEqual(column.x + column.width + 1)
      expect(remove.y + remove.height, `tärning ${n}: krysset över fälten`).toBeLessThanOrEqual(count.y + 1)
      if (n === 1) {
        const mode = await box(`Hur antalet räknas för tärning ${n}`, 'combobox')
        expect(Math.abs(mid(mode) - mid(count)), `tärning ${n}: räkningen på antalets rad`).toBeLessThan(2)
        expect(mode.x + mode.width, `tärning ${n}: räkningen inne i kolumnen`).toBeLessThanOrEqual(column.x + column.width + 1)
      }
    }
  })
})
