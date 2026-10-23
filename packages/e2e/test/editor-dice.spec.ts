import type { Page } from '@playwright/test'
import { logIn, makeProject, startTable } from '../support/api.js'
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

test.describe('tärningarna i fliken Bord', () => {
  test('läggs till i editorn, sparas och ligger där de ska när ett bord startas', async ({ page, browser, baseURL }) => {
    const project = await openBord(page)
    const add = page.getByRole('button', { name: '＋ Tärning' })

    // «2 d6 per spelare i Framför»: en yta vid platserna, så varje plats får två i sin egen.
    await add.click()
    await expect(page.getByRole('heading', { name: 'Tärningar' })).toBeVisible()
    await expect(page.getByRole('spinbutton', { name: 'Antal för tärning 1' })).toBeFocused()
    await page.getByRole('spinbutton', { name: 'Antal för tärning 1' }).fill('2')
    await page.getByRole('spinbutton', { name: 'Antal för tärning 1' }).press('Enter')
    await page.getByRole('combobox', { name: 'Yta för tärning 1' }).selectOption({ label: 'Framför' })
    await expect(page.getByRole('combobox', { name: 'Hur antalet räknas för tärning 1' })).toHaveCount(0)

    // «1 d20 totalt i Spelyta», med tangentbordet hela vägen.
    await add.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('spinbutton', { name: 'Antal för tärning 2' })).toBeFocused()
    await page.getByRole('combobox', { name: 'Sort för tärning 2' }).selectOption({ label: 'd20' })
    await page.getByRole('combobox', { name: 'Yta för tärning 2' }).selectOption({ label: 'Spelyta' })
    await expect(page.getByRole('combobox', { name: 'Hur antalet räknas för tärning 2' })).toHaveValue('perSeat')
    await page.getByRole('combobox', { name: 'Hur antalet räknas för tärning 2' }).selectOption('total')

    await page.locator('.byd-editor-save').click()
    await expect(page.locator('.byd-editor-saved-word')).toHaveText('Sparat')

    const table = await startTable(page.request, project)
    const tv = await browser.newContext({ viewport: TV.viewport, ...(baseURL ? { baseURL } : {}) })
    const screen = await tv.newPage()
    const wire = watchWire(screen)
    await screen.goto(`${table.tvUrl}&lang=sv`)
    await expect(screen.locator('.byd-tv-head')).toContainText('Tärningsspelet')

    for (const seat of ['A', 'B', 'C']) await expect.poll(() => diceIn(wire.received(), `mine:${seat}`, 'd6'), { message: `två d6 framför ${seat}` }).toBe(2)
    await expect.poll(() => diceIn(wire.received(), 'table', 'd20'), { message: 'en d20 på spelytan' }).toBe(1)
    expect(diceIn(wire.received(), 'table', 'd6')).toBe(0)
    await tv.close()
  })

  // Raden är två rader med avsikt, inte en rad som råkar brytas (#1139): antal, sort, hur antalet
  // räknas och krysset på den första, «i [yta]» på den andra rakt under antalet. Som en flexrad
  // bröt den var den hade lust, och «i» hängde ensamt vid kanten med krysset efter ytan.
  test('står som två raka rader i kolumnen, krysset sist på den första', async ({ page }) => {
    await openBord(page)
    const add = page.getByRole('button', { name: '＋ Tärning' })
    await add.click()
    await add.click()
    await page.getByRole('combobox', { name: 'Yta för tärning 2' }).selectOption({ label: 'Framför' })
    // Varje rad fyller kolumnen: krysset står på samma ställe vare sig raden har en väljare för hur
    // antalet räknas eller orden «per spelare», som är kortare.
    const ends = await Promise.all([1, 2].map(async (n) => (await page.getByRole('button', { name: `Ta bort tärning ${n}` }).boundingBox())!))
    expect(Math.abs(ends[0]!.x - ends[1]!.x), 'krysset på samma ställe i båda raderna').toBeLessThan(2)
    for (const n of [1, 2]) {
      const box = async (name: string, role: 'spinbutton' | 'combobox' | 'button') => (await page.getByRole(role, { name }).boundingBox())!
      const count = await box(`Antal för tärning ${n}`, 'spinbutton')
      const kind = await box(`Sort för tärning ${n}`, 'combobox')
      const place = await box(`Yta för tärning ${n}`, 'combobox')
      const remove = await box(`Ta bort tärning ${n}`, 'button')
      const mid = (b: { y: number; height: number }) => b.y + b.height / 2
      // Första raden: antal, sort och kryss på samma linje, krysset längst till höger.
      expect(Math.abs(mid(kind) - mid(count)), `tärning ${n}: sorten på antalets rad`).toBeLessThan(2)
      expect(Math.abs(mid(remove) - mid(count)), `tärning ${n}: krysset på antalets rad`).toBeLessThan(2)
      expect(remove.x, `tärning ${n}: krysset efter sorten`).toBeGreaterThan(kind.x + kind.width)
      // Andra raden: ytan under, och den slutar där krysset slutar.
      expect(place.y, `tärning ${n}: ytan under första raden`).toBeGreaterThanOrEqual(count.y + count.height)
      expect(Math.abs(place.x + place.width - (remove.x + remove.width)), `tärning ${n}: ytan når krysset`).toBeLessThan(2)
      // Ordet «i» står vid antalets vänsterkant, inte intryckt.
      const word = (await page.getByRole('combobox', { name: `Yta för tärning ${n}` }).evaluate((el) => {
        const r = el.parentElement!.getBoundingClientRect()
        return { x: r.x }
      }))
      expect(Math.abs(word.x - count.x), `tärning ${n}: «i» rakt under antalet`).toBeLessThan(2)
    }
  })
})
