import { readFileSync } from 'node:fs'
import { strFromU8, unzipSync } from 'fflate'
import { logIn, makeProjectOf } from '../support/api.js'
import { gameDoc } from '../support/game.js'
import { DESK } from '../support/devices.js'
import { renderWorker } from '../support/render.js'
import { expect, test } from '../support/test.js'

// The print package from «Mina spel» (#1208, beslut B 2026-10-23): the page with its five parts and
// its packing slip, prepared by Testtryckeriet as the box registers it, and the zip it hands over
// once the renderer has drawn every file. The worker runs beside the app as it does on the box.
test.use({ viewport: DESK.viewport })

test.describe('the print package', () => {
  test.skip(process.env['BYD_E2E_STORE'] !== 'postgres', 'the renderer shares the Postgres queue; a memory run has none')
  let worker: { stop: () => Promise<void> } | null = null
  test.beforeAll(async () => {
    worker = await renderWorker()
  })
  test.afterAll(async () => {
    await worker?.stop()
  })

  test('shows what a printer would get and downloads it as a zip with a file per side and the rulebook', async ({ page }) => {
    test.setTimeout(180_000)
    await logIn(page.request)
    // A game a printer would take: the back's colour runs out into the bleed, so the print checks
    // (E5) let its cards through; two of its cards in two copies, two dice and a rulebook.
    const doc = gameDoc({ name: 'Skogens herrar', players: 2, cards: 3, dice: [{ faces: 6, count: 2, zone: 'table' }] }) as ReturnType<typeof gameDoc> & { template: { faces: Record<string, { base: Record<string, unknown>[] }> } }
    for (const el of doc.template.faces['back']?.base ?? []) if (el['id'] === 'bg') Object.assign(el, { x: -3, y: -3, w: 69, h: 94 })
    const rules = { title: 'Skogens herrar', blocks: [{ kind: 'text', id: 't1', text: 'Dra ett kort.' }] }
    const { id } = await makeProjectOf(page.request, { ...doc, rules })
    await page.goto('/?lang=sv')

    await page.getByRole('button', { name: 'Fler val för Skogens herrar' }).click()
    await page.getByRole('button', { name: 'Tryckpaketet…' }).click()
    await expect(page).toHaveURL(new RegExp(`/print-package\\?project=${id}`))
    await expect(page.getByRole('heading', { level: 1, name: /^Tryckpaketet/ })).toBeVisible()
    await expect(page).toHaveTitle('Tryckpaketet · Skogens herrar · Deckster')
    for (const name of ['Så skärs ett kort', 'Leken: 3 kort', 'Det som inte trycks', 'Testtryckeriets krav', 'Paketet']) await expect(page.getByRole('region', { name })).toBeVisible()
    const slip = page.getByRole('complementary', { name: 'Följesedel' })
    await expect(slip).toContainText('Exempel · inget riktigt pris')
    await expect(slip).toContainText('Testtryckeriet låtsas trycka i Sverige, inom EU.')
    // The card is drawn as its file, with the bleed the printer asks for, by the one renderer (E2).
    await expect(page.locator('#byd-print-knife [data-card]')).toHaveAttribute('data-bleed', '3')

    const download = page.waitForEvent('download', { timeout: 150_000 })
    await slip.getByRole('button', { name: 'Ladda ner tryckpaketet' }).click()
    const saved = await download
    expect(saved.suggestedFilename()).toBe('Skogens herrar v1 tryckpaket.zip')
    const files = unzipSync(new Uint8Array(readFileSync((await saved.path())!)))
    expect(Object.keys(files).sort()).toEqual(['LASMIG.md', 'manifest.json', 'tryck/kort-1-back.pdf', 'tryck/kort-1-front.pdf', 'tryck/kort-2-front.pdf', 'tryck/kort-3-front.pdf', 'tryck/regelhafte.pdf'])
    for (const [name, bytes] of Object.entries(files)) if (name.endsWith('.pdf')) expect(strFromU8(bytes.subarray(0, 5)), name).toBe('%PDF-')
    const manifest = JSON.parse(strFromU8(files['manifest.json']!)) as { provider: { id: string }; errors: unknown[]; order: { cards: unknown[]; hardware: { count: number }[] } }
    expect(manifest.provider.id).toBe('testtryckeriet')
    expect(manifest.errors).toEqual([])
    expect(manifest.order.cards).toHaveLength(3)
    expect(manifest.order.hardware.map((h) => h.count)).toEqual([2])
    expect(strFromU8(files['LASMIG.md']!)).toContain('Ingen beställning är lagd.')
    await expect(page.locator('[data-status-live="polite"]')).toHaveText('Tryckpaketet är nedladdat.')
  })
})
