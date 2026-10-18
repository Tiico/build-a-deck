import type { Page } from '@playwright/test'
import { join, tableWithRules } from '../support/api.js'
import { PHONE } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// Who answered the survey is the admission's to say (#1021, G3): the phone and the observer send
// the token they sat and watched under, and the answers land under their own names — the ones
// the designer will read. Before, the server took the name and the seat out of the body.
const answer = async (page: Page, scales: string[], change: string) => {
  const survey = page.locator('.byd-survey')
  for (const n of scales) {
    await survey.getByRole('button', { name: n, exact: true }).click()
    await survey.getByRole('button', { name: 'Next' }).click()
  }
  await survey.getByRole('textbox').fill(change)
  await survey.getByRole('button', { name: 'Send' }).click()
}

test('the phone’s and the observer’s answers arrive under their own admissions', async ({ request, player, host, open }) => {
  // A table with a project behind it, so the designer — this request's login — may read its answers.
  const table = await tableWithRules(request, { players: 2 })
  const ada = await player(table, { name: 'Ada', seat: table.seats[0]!, device: PHONE })
  const cilla = await join(request, table, { name: 'Cilla' })
  const watching = await open(PHONE, cilla.observeUrl)
  await expect(ada.page.getByText('Ada').first()).toBeVisible()
  await (await host(table)).send([{ v: 'session.end' } as never])

  await expect(ada.page.locator('.byd-survey')).toBeVisible()
  await answer(ada.page, ['4', '3', '2'], 'Draken är för stark')
  await expect(ada.page.getByText('Thank you, Ada.')).toBeVisible()
  await expect(watching.page.locator('.byd-survey')).toBeVisible()
  await answer(watching.page, ['5', '4', '3'], 'Roligt att titta på')
  await expect(watching.page.getByText('Thank you, Cilla.')).toBeVisible()

  const read = await request.get(`/sessions/${encodeURIComponent(table.session)}/surveys`)
  expect(read.status()).toBe(200)
  const listed = (await read.json()) as { who: string; seat: string | null; observer: boolean; answers: { fun: number; change: string } }[]
  expect(listed.map((s) => ({ who: s.who, seat: s.seat, observer: s.observer, fun: s.answers.fun, change: s.answers.change })).sort((a, b) => a.who.localeCompare(b.who))).toEqual([
    { who: 'Ada', seat: table.seats[0], observer: false, fun: 4, change: 'Draken är för stark' },
    { who: 'Cilla', seat: null, observer: true, fun: 5, change: 'Roligt att titta på' },
  ])
})
