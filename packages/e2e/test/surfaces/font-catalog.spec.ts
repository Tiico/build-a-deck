import { expect, test } from '@playwright/test'
import { logIn, makeProject } from '../../support/api.js'

// The suite's editor is read in English (`support/*` logs in with no language of its own), so
// the names below are the English catalogue's. The Swedish side of the same surface is held in
// `packages/web/test/template-font-catalog.test.tsx`.

// «Katalogen nås aldrig utan handling från designern: ingen förhämtning vid sidladdning» (L27),
// and DRIFT §12: only the designer's browser reaches Google, and the box gains no new outgoing
// dependency. That is a claim about addresses, so it is read off the traffic and not off the
// screen — the same rule the hidden-information gate follows.
//
// Google is intercepted rather than really fetched. The request is still made, made by the real
// code, and counted here; what is not done is reaching out of CI. A test that needed the network
// would be a test that goes red when Google is slow, and would say nothing more than this one.
const GOOGLE = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//

// What `css2` answers a browser with: one `@font-face` per subset, each named in the comment
// above it. The latin cut is the one the project keeps.
const SHEET = (family: string) => `/* latin-ext */
@font-face { font-family: '${family}'; font-weight: 400 900; src: url(https://fonts.gstatic.com/s/x/ext.woff2) format('woff2'); }
/* latin */
@font-face { font-family: '${family}'; font-weight: 400 900; src: url(https://fonts.gstatic.com/s/x/latin.woff2) format('woff2'); }
`
const WOFF2 = Buffer.from([119, 79, 70, 50, 0, 1, 0, 0])

test.describe('the typeface catalog reaches Google only when the designer asks (#329, L27, DRIFT §12)', () => {
  test('asks fonts.googleapis.com and fonts.gstatic.com for nothing at page load, and for the samples only once the picker is opened', async ({ page }) => {
    const asked: string[] = []
    await page.route(GOOGLE, async (route) => {
      const url = route.request().url()
      asked.push(url)
      await (url.includes('googleapis.com')
        ? route.fulfill({ status: 200, contentType: 'text/css', body: SHEET('Cinzel') })
        : route.fulfill({ status: 200, contentType: 'font/woff2', body: WOFF2 }))
    })

    await logIn(page.request)
    const project = await makeProject(page.request)
    await page.goto(project.editorUrl, { waitUntil: 'load' })
    await page.locator('#byd-editor-tab-template').click()
    const open = page.getByRole('button', { name: /search google fonts/i })
    await expect(open).toBeVisible()
    // The editor is up, the properties column is drawn, the way in is on the screen — and
    // nothing has gone to Google. Nor is the reading vacuous: the page did go to the network,
    // for its own document, its own sheet and its own project.
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
    expect(asked).toEqual([])

    await open.click()
    // One sheet for the whole page of hits, and it is the first thing Google is asked for.
    await expect(page.getByRole('list', { name: /matches/i })).toBeVisible()
    await expect.poll(() => asked.length).toBeGreaterThan(0)
    expect(asked.every((url) => url.startsWith('https://fonts.googleapis.com/css2?family='))).toBe(true)
  })

  test('brings the chosen family home as the project’s own asset, off gstatic and never off the server', async ({ page }) => {
    const asked: string[] = []
    await page.route(GOOGLE, async (route) => {
      const url = route.request().url()
      asked.push(url)
      await (url.includes('googleapis.com')
        ? route.fulfill({ status: 200, contentType: 'text/css', body: SHEET('Cinzel') })
        : route.fulfill({ status: 200, contentType: 'font/woff2', body: WOFF2 }))
    })
    // What the editor itself asks its own origin for, so «the server never reaches Google» is
    // read as an upload of bytes the browser already has and not as a proxy.
    const uploads: string[] = []
    page.on('request', (r) => {
      if (r.method() === 'POST' && new URL(r.url()).pathname === '/assets') uploads.push(r.url())
    })

    await logIn(page.request)
    const project = await makeProject(page.request)
    await page.goto(project.editorUrl, { waitUntil: 'load' })
    await page.locator('#byd-editor-tab-template').click()
    await page.getByRole('button', { name: /search google fonts/i }).click()
    await page.getByRole('searchbox', { name: /search google fonts/i }).fill('cinzel')
    await page.getByRole('button', { name: /^add cinzel$/i }).click()

    // The whole variable file, which is what L27 asks for, and its latin cut.
    await expect.poll(() => asked).toContain('https://fonts.googleapis.com/css2?family=Cinzel:wght@400..900&display=swap')
    await expect.poll(() => asked).toContain('https://fonts.gstatic.com/s/x/latin.woff2')
    // And it is the project's own asset now: the bytes went up to this origin, from the browser.
    await expect.poll(() => uploads.length).toBe(1)
    // In the list, with the badge and the licence the catalog knew.
    const row = page.locator('li[data-font="Cinzel"]')
    await expect(row).toContainText(/catalog/i)
    await expect(row.getByLabel(/licence for cinzel/i)).toHaveValue('OFL 1.1')
    await expect(row.getByLabel(/creator of cinzel/i)).toHaveValue('Natanael Gama')
  })
})
