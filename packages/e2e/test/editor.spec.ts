import { logIn, makeProject } from '../support/api.js'
import { DESK, TV } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// The designer's own way in: a game she owns, opened in the editor, and a table started from it
// (L4, L5, D3).
//
// The editor is the one route the app fetches rather than ships — it has a chunk and a stylesheet
// of its own, linked when the route opens (#186, #95) — so it is also the one route where "does
// the built app actually work" is a question with teeth. A dynamic import that resolves in a dev
// server and 404s in the built app is invisible to every test that mounts a component, and it is
// exactly what this walks through.
//
// The editor is desktop-first by decision (L12), so it is opened at a desk and nowhere else.
test.use({ viewport: DESK.viewport })

test.describe('from the editor to a table', () => {
  test('opens a project the account owns and starts a table from it', async ({ page }) => {
    // `page.request` shares this context's cookie jar, so logging in through it leaves the page
    // logged in — no token is ever handled by hand, and nothing pretends to be a session.
    await logIn(page.request)
    const project = await makeProject(page.request, { name: 'Skogens herrar', players: 4, cards: 9 })

    await page.goto(project.editorUrl)
    // The project's own name, which only arrives once the chunk has loaded, the socket has opened
    // and the actor has handed over its document. Waiting for it is waiting for all three.
    await expect(page.getByText('Skogens herrar').first()).toBeVisible()

    await page.locator('#byd-editor-tab-tables').click()
    await page.locator('.byd-tables-new').click()

    // A table just started has not been played at, so it is filed under the fold for tables that
    // were started and never touched (#176) — and that fold opens by itself for the table this
    // column just started, which the status line names (#480). No click: a click would fold it.
    await expect(page.locator('.byd-tables-started')).toContainText(/started|startat/)
    await expect(page.locator('.byd-tables-group:not([data-group="played"]) .byd-tables-fold').first()).toHaveAttribute('aria-expanded', 'true')

    // A row for the table that now exists, carrying its id.
    const row = page.locator('.byd-table-row').first()
    await expect(row).toBeVisible()
    const session = await row.getAttribute('data-table')
    expect(session, 'the row names the table it is a row for').toBeTruthy()

    // The ways into a table live in the row's own menu (beslut 2026-09-17), with the one that
    // stands ready outside it. The television is in the menu, so it is opened as a designer opens
    // it rather than reached around.
    await row.locator('.byd-tables-more').click()
    const way = row.locator('.byd-tables-menu a[href*="/table"]').first()
    await expect(way, 'the menu offers the television').toBeVisible()
    const href = await way.getAttribute('href')
    expect(href).toContain(session!)

    // And the table is real. The link opens in a tab of the designer's own browser, which is not
    // a convenience — it is the authority. The editor's way in carries `owner=1` and no host key,
    // so what opens the table is the account, and the same address in a browser that is not
    // logged in as her is rightly refused. A test that opened it anywhere else would be asserting
    // that a stranger can walk in.
    const screen = await page.context().newPage()
    await screen.setViewportSize(TV.viewport)
    await screen.goto(href!)
    // The television knows which table it is at: the game's name stands in its own heading.
    await expect(screen.locator('.byd-tv-head')).toContainText('Skogens herrar')
    await screen.close()
  })

  test('will not open someone else’s project', async ({ page, browser, baseURL }) => {
    // A project belongs to an account (D3: permissions are a model, not a field). Another
    // account reaching the same address is told no, in the editor's own words rather than by a
    // stack trace (D5).
    await logIn(page.request)
    const mine = await makeProject(page.request, { name: 'Min lek' })

    const stranger = await browser.newContext({ viewport: DESK.viewport, ...(baseURL ? { baseURL } : {}) })
    const theirs = await stranger.newPage()
    await logIn(theirs.request)
    await theirs.goto(mine.editorUrl)
    await expect(theirs.locator('#root')).not.toBeEmpty()
    await expect(theirs.getByText('Min lek')).toHaveCount(0)
    await stranger.close()
  })
})

test.describe('the header remembers the table (#477)', () => {
  test('after a reload, the primary updates the running table instead of starting a second', async ({ page }) => {
    await logIn(page.request)
    const project = await makeProject(page.request, { name: 'Minnets bord', players: 2, cards: 4 })
    const tables = async () => (await (await page.request.get(`/projects/${encodeURIComponent(project.id)}/sessions`)).json()) as { id: string }[]

    await page.goto(project.editorUrl)
    const primary = page.locator('.byd-editor-primary:not(.byd-editor-caret)')
    await expect(primary).toHaveText('Start a table')
    await primary.click()
    await expect(primary).toHaveAccessibleName('Update the table')
    expect(await tables()).toHaveLength(1)

    await page.reload()
    await expect(page.getByText('Minnets bord').first()).toBeVisible()
    // The table outlived the page; the header knows it without being asked.
    await expect(primary).toHaveAccessibleName('Update the table')
    await expect(page.locator('[data-room-code]')).toHaveText(/\S+/)
    await expect(page.locator('.byd-editor-table-link')).toContainText('The table runs rev-1')
    // What matters is which errand the press went on, and that no second table was born. How long
    // the update then takes is the renderer's business, and not this test's to time (#949): the
    // card faces are shared by every table of the same deck, so when a journey with a render
    // worker (an export, a print) has run beside this one they are already there, the update is
    // over before anything can read «Updating the table…», and the button stands at rest again.
    // So the press is read where it goes — the remembered table's `prepare` — and not in a state
    // that lasts only as long as the queue happens to.
    const [running] = await tables()
    const updated = page.waitForRequest((r) => r.method() === 'POST' && new URL(r.url()).pathname === `/sessions/${encodeURIComponent(running!.id)}/prepare`, { timeout: 10_000 })
    await primary.click()
    await updated
    expect(await tables(), 'the press updated the table the header remembered').toHaveLength(1)
  })
})
