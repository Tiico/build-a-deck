import type { Page } from '@playwright/test'
import { CARD_STANDARD_63x88 } from '@byd/engine'
import { newElement } from '../../web/src/editor/canvas.js'
import type { ProjectDoc } from '../../web/src/editor/types.js'
import { logIn, makeProjectOf } from '../support/api.js'
import { DESK } from '../support/devices.js'
import { gameDoc } from '../support/game.js'
import { expect, test } from '../support/test.js'

// A picture uploaded from a card's own cell, the way the playtest did it (#742).
//
// Three things were wrong on that path. The picture came into the library with no name, so Media
// called it «Bild på kort-1» while the same file uploaded from Media kept its own (L22). The picker
// offered `image/*`, so an SVG could be chosen and was then refused. And a 19.6 MB photo travelled
// the whole way to the server before the 413 came back — tens of seconds over a home line for a
// certain no — and every refusal left resource errors in the console. The gate's rules are the
// protocol's, so the browser asks them first and nothing that is certain to be refused leaves it.
// In Swedish, because the refusals are matched in the words the playtest read them in.
test.use({ viewport: DESK.viewport, locale: 'sv-SE' })

// The smallest real PNG: one transparent pixel, so the library can draw what it holds.
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

function withPictureColumn(): ProjectDoc {
  const doc = gameDoc({ name: 'Skogens herrar', cards: 3 }) as unknown as ProjectDoc
  const el = newElement('image', { taken: ['frame', 'title', 'body'], field: 'bild', card: CARD_STANDARD_63x88.physical })
  doc.template.faces['front']!.base.push(el)
  return doc
}

// Every POST to `/assets`, and every console error and failed response, from the moment it is
// started — so a refusal can be shown to have cost nothing on the wire and said nothing there.
function watch(page: Page): { posts: string[]; errors: string[] } {
  const seen = { posts: [] as string[], errors: [] as string[] }
  page.on('request', (req) => {
    if (req.method() === 'POST' && new URL(req.url()).pathname === '/assets') seen.posts.push(req.url())
  })
  page.on('response', (res) => {
    if (res.status() >= 400) seen.errors.push(`${res.status()} ${new URL(res.url()).pathname}`)
  })
  page.on('console', (msg) => {
    if (msg.type() === 'error') seen.errors.push(msg.text())
  })
  return seen
}

async function openTable(page: Page) {
  await logIn(page.request)
  const project = await makeProjectOf(page.request, withPictureColumn())
  await page.goto(project.editorUrl)
  const tab = page.locator('#byd-editor-tab-table')
  await tab.click()
  await expect(tab).toHaveAttribute('aria-selected', 'true')
  const upload = page.getByLabel('Ladda upp bild för kort-1')
  await expect(upload).toBeAttached()
  return upload
}

test.describe('a picture uploaded from a card cell (#742)', () => {
  test('offers only the four formats the gate takes', async ({ page }) => {
    const upload = await openTable(page)
    expect(await upload.getAttribute('accept')).toBe('image/png,image/jpeg,image/gif,image/webp')
  })

  test('refuses a 9 MB file and an SVG at once, without a POST and without a console error', async ({ page }) => {
    const upload = await openTable(page)
    const seen = watch(page)
    // Where the table says what became of an upload: the strip above it, where the pictures are.
    const said = page.locator('.byd-data-images [role="alert"]')

    const heavy = Buffer.alloc(9 * 1024 * 1024)
    PIXEL.copy(heavy)
    await upload.setInputFiles({ name: 'stor.png', mimeType: 'image/png', buffer: heavy })
    await expect(said).toHaveText('filen är för stor (max 8 MB)')

    await upload.setInputFiles({ name: 'logga.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') })
    await expect(said).toHaveText('filen är inte PNG, JPEG, GIF eller WebP')

    expect(seen.posts).toEqual([])
    expect(seen.errors).toEqual([])
    // And the card was not touched: nothing is drawn from bytes that never came.
    await expect(page.getByRole('button', { name: 'Ta bort bild för kort-1' })).toHaveCount(0)
  })

  test('brings the picture into the library under its file name, and the tile says it', async ({ page }) => {
    const upload = await openTable(page)
    const seen = watch(page)
    await upload.setInputFiles({ name: 'drake.png', mimeType: 'image/png', buffer: PIXEL })
    await expect(page.getByRole('button', { name: 'Ta bort bild för kort-1' })).toBeVisible()
    // Non-vacuity: this upload did go over the wire, so the refusals above were the browser's.
    expect(seen.posts).toHaveLength(1)

    await page.locator('#byd-editor-tab-media').click()
    const tile = page.locator('[data-media-panel] li[data-asset]')
    await expect(tile).toHaveCount(1)
    await expect(tile.getByRole('button', { name: 'drake.png', exact: true })).toBeVisible()
    await expect(tile.locator('.byd-media-name')).toHaveText('drake.png')
    await expect(tile.locator('.byd-media-name')).toBeVisible()
  })
})
