import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '../support/test.js'
import { gameDoc } from '../support/game.js'
import { DESK } from '../support/devices.js'
import { serverWith } from '../support/stack.js'
import { acceptTerms } from '../support/api.js'

test.use({ viewport: DESK.viewport, locale: 'sv-SE' })

// The read-only mode in the built app (#1492, beställarens beslut variant A, G5): a designer whose Pro
// has lapsed, on a box with the free tier's ceilings in `BYD_PLANS`. Mina spel says once why and marks
// the game that is read-only; the game still opens, the editor says before any edit that it cannot be
// changed, and the game can be exported. The lapse is the operator's own `plan` script against the
// stack's database, as on the box, so this journey needs the Postgres run; the memory run has no
// database for the script to reach, and `store.spec.ts` says that run proves less.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const PLANS = JSON.stringify({ default: 'free', plans: { free: { projects: 1, cardRowsPerProject: 3 }, pro: {} } })
const database = process.env['BYD_E2E_DATABASE_URL']
const plan = (...args: string[]) => {
  const ran = spawnSync(process.execPath, ['--import', 'tsx', join('scripts', 'plan.ts'), ...args], { cwd: join(ROOT, 'packages', 'server'), env: { ...process.env, DATABASE_URL: database, BYD_PLANS: PLANS }, encoding: 'utf8' })
  expect(ran.status, `${ran.stdout}${ran.stderr}`).toBe(0)
}

let planned: { origin: string; stop: () => Promise<void> }
test.beforeAll(async () => {
  if (database) planned = await serverWith({ BYD_PLANS: PLANS })
})
test.afterAll(async () => {
  await planned?.stop()
})

test('a designer whose Pro has lapsed is told why her game is read-only, can read it, and can export it', async ({ page }) => {
  test.skip(!database, 'the lapse is the plan script against the stack’s database')
  const at = (path: string) => `${planned.origin}${path}`
  const email = `e2e-${crypto.randomUUID()}@example.com`
  expect((await page.request.post(at('/auth/login'), { data: { email } })).ok()).toBe(true)
  await acceptTerms(page.request, planned.origin)
  plan('set', email, 'pro')
  const kajen = await page.request.post(at('/projects'), { data: gameDoc({ name: 'Kajen', cards: 3 }) })
  expect(kajen.status()).toBe(201)
  const made = await page.request.post(at('/projects'), { data: gameDoc({ name: 'Skogens råd', cards: 4 }) })
  expect(made.status()).toBe(201)
  const { id } = (await made.json()) as { id: string }
  plan('lapse', email)

  // Mina spel: the band once, and the game saved last marked with its reason, «Exportera…» for «Starta bord».
  await page.goto(at('/'))
  const band = page.getByRole('region', { name: 'Läsläge' })
  await expect(band).toContainText('1 spel är i läsläge.')
  const hero = page.locator(`.byd-home-game[data-project="${id}"]`)
  await expect(hero.locator('[data-read-only-why]')).toHaveText('4 kort, och Gratis rymmer 3 per spel.')
  await expect(hero.getByRole('button', { name: 'Starta bord' })).toHaveCount(0)
  await hero.getByRole('button', { name: 'Exportera…' }).click()
  await expect(page.getByRole('dialog', { name: 'Exportera «Skogens råd»' })).toBeVisible()

  // The editor says it before any edit, in the reading band, and the game reads as it is.
  await page.goto(at(`/editor?project=${encodeURIComponent(id)}`))
  await expect(page.locator('#byd-editor-reading')).toContainText('Skogens råd har 4 kort, och Gratis rymmer 3 per spel.')
  await page.locator('#byd-editor-tab-table').click()
  await expect(page.locator('.byd-data tbody tr[data-card-ref]')).toHaveCount(4)
})
