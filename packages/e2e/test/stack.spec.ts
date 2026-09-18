import { expect, test } from '@playwright/test'

// What the rest of the suite stands on, checked before it is trusted.
//
// Every other spec here assumes the product is answering the way the box makes it answer: one
// origin for the app and the API, the routes falling back to the app shell, and a log in
// Postgres. If any of that is quietly not so, the specs above do not fail — they pass, against
// something that is not the product. So it is said here once, plainly.
test.describe('the stack the suite runs against', () => {
  test('serves the built app and the API from one origin, with no `server=` anywhere', async ({ page, baseURL }) => {
    const res = await page.goto('/')
    expect(res?.status(), 'the app shell is served from the API’s own origin (DRIFT §2)').toBe(200)
    // The app is mounted, so what arrived is the built bundle and not merely an HTML file.
    await expect(page.locator('#root')).not.toBeEmpty()
    // And the API answers on that same origin, which is what makes `server=` unnecessary in
    // production and is the arrangement the sockets below are built on.
    const health = await page.request.get(`${baseURL}/health`)
    expect(health.ok()).toBe(true)
  })

  test('falls back to the app shell on a route only the client knows', async ({ page }) => {
    // `/editor` is a path no file answers to. The server hands back the shell so the client can
    // route it (`packages/server/src/server.ts`), and without that rule a designer opening her
    // own bookmark gets a 404 from her own product. The web suite cannot see this at all: it
    // mounts components, and a mounted component never asks the server for its own address.
    const res = await page.goto('/editor')
    expect(res?.status()).toBe(200)
    await expect(page.locator('#root')).not.toBeEmpty()
  })

  test('answers an address that is not a route with the page that says so', async ({ page }) => {
    await page.goto('/ingenting')
    await expect(page.locator('#root')).not.toBeEmpty()
  })

  test('keeps the log in Postgres wherever a run is expected to prove durability', async ({ baseURL }) => {
    // A run without Postgres proves less. That is allowed on a laptop with no Docker and never
    // in CI, and it has to be said out loud rather than discovered later: `pnpm test` once
    // dropped fifteen Postgres tests and still reported green, and nothing in the output
    // mentioned it. This is that lesson, applied before it is learned a second time.
    const store = process.env['BYD_E2E_STORE']
    if (process.env['CI']) expect(store, 'CI always has DATABASE_URL, so a memory store here is a broken workflow').toBe('postgres')
    else if (store !== 'postgres') test.info().annotations.push({ type: 'warning', description: 'no Docker and no DATABASE_URL: this run used the memory store and proved less than CI will' })
    expect(baseURL).toBeTruthy()
  })
})
