import { readFileSync } from 'node:fs'
import { logIn, makeProjectOf } from '../support/api.js'
import { DESK } from '../support/devices.js'
import { gameDoc } from '../support/game.js'
import { renderWorker } from '../support/render.js'
import { expect, test } from '../support/test.js'

// Länkbilden (#1417, L91) i den byggda appen, med renderaren bredvid och R2 på ett eget ursprung som
// på lådan (DRIFT §4). Rumskodens länk visar Decksters hand tills designern har öppnat lådan, och
// sedan «Visa upp» som stillbild. «Spara bilden» i «Visa upp» laddar ner samma fil, byte för byte:
// en nedladdning genom R2:s omdirigering, som ingen sida läser och som därför inte behöver CORS.
test.use({ viewport: DESK.viewport, locale: 'sv-SE', acceptDownloads: true })

// The size a JPEG says it is, off its frame header.
function jpegSize(bytes: Uint8Array): { w: number; h: number } | null {
  for (let i = 2; i + 8 < bytes.length; ) {
    if (bytes[i] !== 0xff) return null
    const marker = bytes[i + 1]!
    const length = (bytes[i + 2]! << 8) | bytes[i + 3]!
    if (marker >= 0xc0 && marker <= 0xc2) return { h: (bytes[i + 5]! << 8) | bytes[i + 6]!, w: (bytes[i + 7]! << 8) | bytes[i + 8]! }
    i += 2 + length
  }
  return null
}

test.describe('länkbilden', () => {
  test.skip(process.env['BYD_E2E_STORE'] !== 'postgres', 'the renderer shares the Postgres queue; a memory run has none')
  let worker: { stop: () => Promise<void> } | null = null
  test.beforeAll(async () => {
    worker = await renderWorker()
  })
  test.afterAll(async () => {
    await worker?.stop()
  })

  test('följer heron, och «Spara bilden» laddar ner samma fil', async ({ page, baseURL }) => {
    test.setTimeout(180_000)
    await logIn(page.request)
    const project = await makeProjectOf(page.request, gameDoc({ name: 'Skogens råd', cards: 30, copies: 2 }))
    const table = (await (await page.request.post(`/projects/${project.id}/sessions`)).json()) as { code: string }
    // What a previewer reads: the bytes the server sends, without running the page.
    const image = async () => {
      const html = await (await page.request.get(`/${table.code}`, { headers: { accept: 'text/html' } })).text()
      return /<meta property="og:image" content="([^"]*)"/.exec(html)?.[1]
    }
    expect(await image()).toBe(`${baseURL}/og-image.png`)

    await page.goto(project.editorUrl)
    await page.locator('#byd-editor-tab-box').click()
    await expect(page.locator('.byd-box-net')).toBeVisible()
    await page.getByRole('button', { name: 'Visa upp' }).click()
    await expect(page.locator('.byd-box-show')).toHaveAttribute('data-look', 'show', { timeout: 5000 })

    const downloading = page.waitForEvent('download', { timeout: 120_000 })
    await page.getByRole('button', { name: 'Spara bilden' }).click()
    const download = await downloading
    expect(download.suggestedFilename()).toBe('Skogens råd.jpg')
    const saved = new Uint8Array(readFileSync((await download.path())!))
    expect(jpegSize(saved)).toEqual({ w: 1200, h: 630 })

    // The box has been opened, and its still is drawn: the room's link names it at the public origin.
    await expect.poll(image, { timeout: 30_000 }).toMatch(new RegExp(`^${baseURL}/faces/[0-9a-f]{64}$`))
    // Fetched as a previewer fetches it, without the designer's login, through the bucket's redirect.
    const anonymous = await page.context().browser()!.newContext()
    try {
      const shown = await anonymous.request.get((await image())!)
      expect(shown.status()).toBe(200)
      expect(shown.headers()['content-type']).toBe('image/jpeg')
      expect(Buffer.compare(Buffer.from(await shown.body()), Buffer.from(saved))).toBe(0)
    } finally {
      await anonymous.close()
    }
  })
})
