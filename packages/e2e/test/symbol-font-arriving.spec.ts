import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
import { logIn, makeProjectOf } from '../support/api.js'
import { DESK } from '../support/devices.js'
import { gameDoc } from '../support/game.js'
import { expect, test } from '../support/test.js'

// A symbol placed on the card and a typeface taken into the game, looked at before their bytes
// have reached the service (#959).
//
// Both are in the document the moment they are chosen (#310, #339), and #907 made the pictures wait
// for their bytes; the symbol and the face did not. The card drew the symbol from its address and
// declared the face at once, the browser asked, got a 404, and kept it: a broken symbol and a card
// in the fallback type until the page was loaded again. Held on the wire here, and the service's
// answer while they are held is the 404 it gives for bytes it does not have — whatever the rest of
// the run has already put into the shared, content-addressed store — so the order is certain.
test.use({ viewport: DESK.viewport, locale: 'sv-SE' })

const FAMILY = 'Kortets typsnitt'
const WOFF2 = readFileSync(new URL('../../web/src/fonts/roboto-condensed-latin-wght-normal.woff2', import.meta.url))

// Every upload waits at the door until `release`, and the bytes it carries are not to be had until
// then: the service does not have them yet. The edit that places them is made before they are sent
// (#310), so a request for them can reach the door before the upload does; it is answered once the
// upload has been seen, and only then is it known to be one for bytes still on their way.
async function holdUploads(page: Page): Promise<{ release: () => void; asked: string[] }> {
  let release!: () => void
  const held = new Promise<void>((resolve) => (release = resolve))
  let open = false
  void held.then(() => (open = true))
  const sent = new Set<string>()
  let posted!: () => void
  const firstPost = new Promise<void>((resolve) => (posted = resolve))
  const asked: string[] = []
  await page.route(
    (url) => url.pathname === '/assets',
    async (route) => {
      if (route.request().method() === 'POST') {
        sent.add(createHash('sha256').update(route.request().postDataBuffer() ?? Buffer.alloc(0)).digest('hex'))
        posted()
        await held
      }
      await route.continue()
    },
  )
  await page.route(
    (url) => /^\/assets\/[0-9a-f]{64}(\/bytes)?$/.test(url.pathname),
    async (route) => {
      const hash = new URL(route.request().url()).pathname.split('/')[2]!
      if (!open) await Promise.race([firstPost, new Promise((resolve) => setTimeout(resolve, 5_000))])
      if (!open && sent.has(hash)) {
        asked.push(hash)
        return route.fulfill({ status: 404, body: '' })
      }
      return route.continue()
    },
  )
  return { release, asked }
}

test('a symbol placed on the card is drawn once its bytes arrive, and not asked for before', async ({ page }) => {
  await logIn(page.request)
  const project = await makeProjectOf(page.request, gameDoc({ name: 'Symbolleken', cards: 3 }))
  await page.goto(project.editorUrl)
  await page.getByRole('tab', { name: 'Mall' }).click()
  const tools = page.getByRole('toolbar', { name: 'Verktyg' })
  await expect(tools).toBeVisible()
  const { release, asked } = await holdUploads(page)

  await tools.getByRole('combobox', { name: 'Ikon' }).click()
  await page.getByRole('listbox', { name: 'Symboler' }).getByRole('option', { name: /svärd/ }).click()
  const icon = page.locator('#canvas [data-element="icon-1"] img.byd-icon')
  await expect(icon).toBeAttached()
  // Whatever it was drawn from has been tried by now, so a request for the bytes would be seen.
  await expect.poll(() => icon.evaluate((img: HTMLImageElement) => img.complete)).toBe(true)
  expect(asked).toEqual([])

  release()
  await expect(icon).toHaveAttribute('src', /\/assets\/[0-9a-f]{64}$/)
  await expect.poll(() => icon.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true)
  expect(asked).toEqual([])
})

test('a typeface taken into the game sets the cards once its bytes arrive, and is not asked for before', async ({ page }) => {
  await logIn(page.request)
  // The template already asks for the family by name, so the file is used the moment it is in.
  const doc = gameDoc({ name: 'Typsnittsleken', cards: 3 })
  for (const el of doc.template.faces['front']!.base) if (el.kind === 'text') el.font.family = FAMILY
  const project = await makeProjectOf(page.request, doc)
  await page.goto(project.editorUrl)
  await page.getByRole('tab', { name: 'Speltema' }).click()
  const fonts = page.getByRole('button', { name: /^Typsnitt/ })
  if ((await fonts.getAttribute('aria-expanded')) === 'false') await fonts.click()
  const { release, asked } = await holdUploads(page)

  await page.getByLabel(/ladda upp typsnitt/i).setInputFiles({ name: `${FAMILY}.woff2`, mimeType: 'font/woff2', buffer: WOFF2 })
  await expect(page.locator(`[data-font="${FAMILY}"]`)).toBeAttached()
  await page.getByRole('tab', { name: 'Kortvägg' }).click()
  const titles = page.locator('.byd-preview [data-element="title"]')
  await expect(titles).toHaveCount(3)
  expect(asked).toEqual([])

  release()
  await expect.poll(() => drawnIn(page, '.byd-preview [data-element="title"]')).toEqual([true, true, true])
  expect(asked).toEqual([])
})

// Whether each node's glyphs were all drawn by a face the page itself loaded (as wall-font.spec).
async function drawnIn(page: Page, selector: string): Promise<boolean[]> {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('DOM.enable')
  await cdp.send('CSS.enable')
  const { root } = (await cdp.send('DOM.getDocument', { depth: -1 })) as { root: { nodeId: number } }
  const { nodeIds } = (await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector })) as { nodeIds: number[] }
  const out: boolean[] = []
  for (const nodeId of nodeIds) {
    const { fonts } = (await cdp.send('CSS.getPlatformFontsForNode', { nodeId })) as { fonts: { glyphCount: number; isCustomFont: boolean }[] }
    const used = fonts.filter((f) => f.glyphCount > 0)
    out.push(used.length > 0 && used.every((f) => f.isCustomFont))
  }
  await cdp.detach()
  return out
}
