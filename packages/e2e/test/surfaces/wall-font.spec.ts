import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { logIn, makeProjectOf } from '../../support/api.js'
import { gameDoc } from '../../support/game.js'

// The game's own typeface reaches the cards on the wall in production (#472).
//
// `/assets/<hash>` answers with a 302 to the object store as soon as there is one (DRIFT §4), and
// R2's final response carries no `access-control-allow-origin`. A web font is always fetched in
// CORS mode, and CORS is checked on every response in a redirect chain, so the face never loaded:
// every `FontFace` on the wall stood in `error`, and `font-display: block` kept the text invisible
// until the browser gave up and set it in the fallback. Without an object store the server serves
// the bytes itself, so every test and every development machine was green.
//
// The stack here has no object store either, so the redirect is played by the page: what the
// server would answer with R2 behind it, and what R2 then answers with — the file, and no CORS.
const FAMILY = 'Kortets typsnitt'
const WOFF2 = readFileSync(new URL('../../../web/src/fonts/roboto-condensed-latin-wght-normal.woff2', import.meta.url))
const R2 = 'https://objects.example'

test('the wall sets its cards in the game’s own typeface when the file lives in an object store (#472)', async ({ page }) => {
  await logIn(page.request)
  const upload = await page.request.post('/assets', { headers: { 'content-type': 'font/woff2' }, data: WOFF2 })
  expect(upload.status()).toBe(201)
  const { hash } = (await upload.json()) as { hash: string }

  const doc = gameDoc({ name: 'Typsnittsleken', cards: 6 })
  for (const el of doc.template.faces['front']!.base) if (el.kind === 'text') el.font.family = FAMILY
  doc.fonts = { [FAMILY]: { stack: `"${FAMILY}", serif`, asset: `asset:${hash}` } }
  const project = await makeProjectOf(page.request, doc)

  // What production answers: our own redirect carries CORS, the object store's file does not.
  await page.route(
    (url) => url.pathname === `/assets/${hash}`,
    (route) => route.fulfill({ status: 302, headers: { location: `${R2}/byd-assets/assets/${hash}?signed`, 'access-control-allow-origin': new URL(route.request().url()).origin } }),
  )
  await page.route(`${R2}/**`, (route) => route.fulfill({ status: 200, contentType: 'font/woff2', body: WOFF2 }))

  await page.goto(project.editorUrl)
  await expect(page.locator('.byd-preview').first()).toBeVisible()

  // The rig is production's shape and not a stand-in that happens to pass: a CORS read of the
  // shown path fails here exactly as it does against R2.
  const shown = await page.evaluate((h) => fetch(`/assets/${h}`, { mode: 'cors' }).then(() => 'read', () => 'refused'), hash)
  expect(shown).toBe('refused')

  // Every card's text is set in the face the document declared, not in whatever the machine had.
  // Chromium says through CDP which face it drew each node with and whether that face came from
  // the page; reading `document.fonts` would not do, since every card declares the face anew and
  // only one of those declarations is ever the one loaded.
  const titles = page.locator('.byd-preview [data-element="title"]')
  await expect(titles).toHaveCount(6)
  await expect.poll(() => drawnIn(page, '.byd-preview [data-element="title"]')).toEqual(Array(6).fill(true))
  expect(await drawnIn(page, '.byd-preview [data-element="body"]')).toEqual(Array(6).fill(true))
})

// Whether each node's glyphs were all drawn by a face the page itself loaded.
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
