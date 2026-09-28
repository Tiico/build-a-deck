import { readFileSync } from 'node:fs'
import { logIn, makeProjectOf } from '../support/api.js'
import { gameDoc } from '../support/game.js'
import { DESK } from '../support/devices.js'
import { renderWorker } from '../support/render.js'
import { expect, test } from '../support/test.js'

// A game taken out and brought back, from «Mina spel» (G5, #529, beslut B). The export waits on
// the renderer for its print files, so a worker runs beside the app as it does on the box; the
// zip the browser saves is the one brought back in, and the copy is a game of its own.
test.use({ viewport: DESK.viewport })

test.describe('taking a game out and bringing it back', () => {
  test.skip(process.env['BYD_E2E_STORE'] !== 'postgres', 'the renderer shares the Postgres queue; a memory run has none')
  let worker: { stop: () => Promise<void> } | null = null
  test.beforeAll(async () => {
    worker = await renderWorker()
  })
  test.afterAll(async () => {
    await worker?.stop()
  })

  test('exports a game with its print files and imports it again as a copy', async ({ page }) => {
    test.setTimeout(180_000)
    await logIn(page.request)
    // A game a printer would take: the back's colour runs out into the bleed, so the print checks
    // (E5) let its cards through and the zip carries their files.
    const doc = gameDoc({ name: 'Skogens herrar', players: 2, cards: 4 }) as { template: { faces: Record<string, { base: Record<string, unknown>[] }> } }
    for (const el of doc.template.faces['back']?.base ?? []) if (el['id'] === 'bg') Object.assign(el, { x: -3, y: -3, w: 69, h: 94 })
    await makeProjectOf(page.request, doc)
    await page.goto('/?lang=sv')

    await page.getByRole('button', { name: 'Fler val för Skogens herrar' }).click()
    await page.getByRole('button', { name: 'Exportera…' }).click()
    const exporting = page.getByRole('dialog', { name: 'Exportera «Skogens herrar»' })
    await expect(exporting).toContainText('Bordens loggar och enkätsvar följer inte med.')
    await exporting.getByRole('button', { name: 'Förbered export' }).click()
    const download = page.waitForEvent('download')
    await exporting.getByRole('button', { name: 'Ladda ner' }).click({ timeout: 120_000 })
    const saved = await download
    expect(saved.suggestedFilename()).toBe('Skogens herrar rev-1.zip')
    const zip = readFileSync((await saved.path())!)
    // A zip, and one with print files in it: the renderer made them.
    expect(zip.subarray(0, 2).toString()).toBe('PK')
    expect(zip.includes(Buffer.from('tryck/'))).toBe(true)
    await exporting.getByRole('button', { name: 'Stäng' }).click()

    await page.getByRole('button', { name: 'Importera spel…' }).click()
    const importing = page.getByRole('dialog', { name: 'Importera spel' })
    await importing.locator('input[type="file"]').setInputFiles({ name: saved.suggestedFilename(), mimeType: 'application/zip', buffer: zip })
    await expect(importing).toContainText('«Skogens herrar (importerad)» är importerat.')
    await expect(page.locator('.byd-home-game strong', { hasText: 'Skogens herrar (importerad)' })).toBeVisible()
    await importing.getByRole('button', { name: 'Öppna spelet' }).click()
    await expect(page).toHaveURL(/\/editor\?project=/)
    await expect(page.getByText('Skogens herrar (importerad)').first()).toBeVisible()
  })
})
