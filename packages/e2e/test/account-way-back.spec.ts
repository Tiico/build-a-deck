import { join, logIn } from '../support/api.js'
import { DESK, PHONE } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// The way back after «Spara till ditt konto» (#690, beslut 2026-10-06). The save is offered once the
// survey is sent; the login comes back to the phone through `next=`; the claim and its way back
// replace history rather than add to it, so Back never claims again; and «Öppna bordet» on
// the start page takes the guest to her own seat and hand rather than to the picker.

test('saving after the survey comes back to the phone, and Back lands on the page before the claim', async ({ player, host, tableOf }) => {
  const table = await tableOf({ players: 2 })
  const ada = await player(table, { name: 'Ada', seat: 'A', device: PHONE })
  const { page } = ada
  await expect(page.getByText('Ada').first()).toBeVisible()
  const hosting = await host(table)
  await hosting.send([{ v: 'session.end' } as never])
  await expect(page.locator('.byd-survey')).toBeVisible()

  // Not offered while the survey is being answered: before, the guest who saved first came back
  // to a start page that said «enkät inte besvarad» and had no way to the survey.
  const save = page.getByRole('link', { name: 'Save to your account' })
  await expect(save).toHaveCount(0)
  for (const n of ['4', '3', '2']) {
    await page.getByRole('button', { name: n, exact: true }).click()
    await page.getByRole('button', { name: 'Next' }).click()
  }
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('Thank you, Ada.')).toBeVisible()
  const thanks = page.url()
  const before = await page.evaluate(() => history.length)

  await save.click()
  await page.getByLabel('Email').fill(`e2e-${crypto.randomUUID()}@example.com`)
  await page.getByRole('button', { name: 'Send sign-in link' }).click()
  // A first login is asked what the others should call it (#1254), then the terms (#1272): the same
  // steps as any new account, and they replace themselves too.
  await page.getByRole('button', { name: 'Skip' }).click()
  await page.getByRole('button', { name: 'Accept and continue' }).click()

  // Back on the phone, on the thanks, which say it is saved.
  await expect(page.getByText('Saved to your account.')).toBeVisible()
  await expect(page.getByText('Thank you, Ada.')).toBeVisible()
  expect(new URL(page.url()).pathname).toBe('/play')
  await expect(save).toHaveCount(0)
  // The table is the account's now.
  const played = (await (await page.request.get('/me/played')).json()) as { session: string; seat: string }[]
  expect(played).toEqual([expect.objectContaining({ session: table.session, seat: 'A' })])

  // One step for the whole round: the claim page and the login card were replaced, not stacked.
  expect(await page.evaluate(() => history.length)).toBe(before + 1)
  await page.goBack()
  await expect(page).toHaveURL(thanks)
  await expect(page.getByText('Thank you, Ada.')).toBeVisible()
})

test('«Open the table» takes the guest to her own seat and hand, not to the picker', async ({ request, open, host, tableOf }) => {
  const table = await tableOf({ players: 2, counters: [], cards: 6, copies: 1 })
  const dealer = await host(table)
  await dealer.send([{ v: 'draw', from: 'draw', to: 'hand:A', count: 3 }])
  const seat = await join(request, table, { name: 'Ada', seat: 'A' })
  const phone = await open(PHONE, seat.playUrl)
  await expect(phone.page.locator('[data-hand-card]')).toHaveCount(3)

  const desk = await open(DESK, '/')
  await logIn(desk.page.request)
  expect((await desk.page.request.post('/guests/claim', { data: { token: seat.token } })).status()).toBe(200)
  await desk.page.goto('/')
  await desk.page.getByRole('link', { name: 'Open the table' }).click()

  // Her seat and her hand, on the screen a laptop is suggested: no picker, no name to type again.
  await expect(desk.page.locator('[data-hand-card]')).toHaveCount(3)
  const at = new URL(desk.page.url())
  expect(at.pathname).toBe('/online')
  expect(at.searchParams.get('seat')).toBe('A')
  // Her name in no address and her token in the fragment (#1278).
  expect(at.searchParams.has('name')).toBe(false)
  expect(at.searchParams.has('token')).toBe(false)
  expect(new URLSearchParams(at.hash.slice(1)).get('token')).toBeTruthy()
  await expect(desk.page.getByRole('textbox', { name: /name/i })).toHaveCount(0)
})
