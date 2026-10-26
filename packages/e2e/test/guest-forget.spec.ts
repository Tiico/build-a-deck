import type { Page } from '@playwright/test'
import { tableWithRules } from '../support/api.js'
import { PHONE, TV } from '../support/devices.js'
import { mentions } from '../support/frames.js'
import { expect, test } from '../support/test.js'

// A guest removes her own name from her phone (#1281, G6, F5; beställarens val C med en ändring):
// where she leaves the table, and under the thanks once it has ended. Keeping the name is the first
// choice; removing it is the quieter button under both ways out. What it does is the server's
// erasure with her own token (#1279), and that is proved on the wire, as hidden information is
// (CLAUDE.md): a screen that connects afterwards is sent her name in no frame, while the search is
// shown to work first on a screen that connected before.
//
// And a masked seat is said as «No name» on the table and to the others, never as the placeholder
// U+E000 the store keeps in its place.

// A name no word of the product's contains, so that finding it means finding her.
const NAME = 'Vendela Qvist'
const PLACEHOLDER = ''

const answer = async (page: Page) => {
  const survey = page.locator('.byd-survey')
  for (const n of ['4', '3', '2']) {
    await survey.getByRole('button', { name: n, exact: true }).tap()
    await survey.getByRole('button', { name: 'Next' }).tap()
  }
  await survey.getByRole('textbox').fill('Kortare rundor')
  await survey.getByRole('button', { name: 'Send' }).tap()
}

test('leaving and removing my name from the phone: asked first, done, and gone from what a new screen is sent', async ({ tableOf, player, open }) => {
  const table = await tableOf({ players: 2, counters: [], cards: 6, copies: 1 })
  const ada = await player(table, { name: NAME, seat: 'A', device: PHONE })
  const bo = await player(table, { name: 'Bo', seat: 'B', device: PHONE })
  await expect(ada.page.getByText(NAME).first()).toBeVisible()
  // The search works: the name is on the wire of a screen that was there.
  await bo.wire.until((frame) => frame.includes(NAME))

  await ada.page.getByRole('tab', { name: /^More/ }).tap()
  await ada.page.getByRole('button', { name: 'Leave… or end the table' }).tap()
  const sheet = ada.page.getByRole('dialog', { name: 'Leave the table?' })
  // Keeping the name is the first way out; removing it is the last button before Cancel.
  await expect(sheet.getByRole('button')).toHaveText(['Leave the table', 'End for everyone', 'Leave and remove my name…', 'Cancel'])
  await expect(sheet.getByText('With your name kept, the designer knows who did and said what.')).toBeVisible()
  await sheet.getByRole('button', { name: 'Leave and remove my name…' }).tap()

  const ask = ada.page.getByRole('alertdialog', { name: 'Leave and remove your name?' })
  await expect(ask).toContainText(`the name you sat under, ${NAME}`)
  await ask.getByRole('button', { name: 'Yes, leave and remove' }).tap()
  await expect(ada.page.getByRole('heading', { name: 'You have left the table, and your name is removed.' })).toBeVisible()
  await expect(ada.page.getByText('The backups forget them within eight days.')).toBeVisible()

  // Bo's phone, reloaded, reads the table's moves under the masked name, said in words.
  await bo.page.reload()
  await bo.page.getByRole('tab', { name: /^Table/ }).tap()
  await expect(bo.page.getByText('No name took seat A')).toBeVisible()
  const read = await bo.page.locator('body').innerText()
  expect(read).not.toContain(NAME)
  expect(read).not.toContain(PLACEHOLDER)

  // A screen that connects now is sent her name in no frame.
  const tv = await open(TV, table.tvUrl, { facesReady: true })
  await tv.wire.until((frame) => frame.includes('"snapshot"'))
  expect(mentions(tv.wire.received(), NAME)).toEqual([])
  expect(tv.wire.received().join('\n')).not.toContain(NAME)
  expect(await tv.page.locator('body').innerText()).not.toContain(PLACEHOLDER)
})

test('removing my name and my answers under the thanks: the seat stays taken as «No name» on the table', async ({ request, player, host, open }) => {
  // A table with a project behind it, so the designer — this request's login — may read its answers.
  const table = await tableWithRules(request, { players: 2 })
  const ada = await player(table, { name: NAME, seat: table.seats[0]!, device: PHONE })
  await expect(ada.page.getByText(NAME).first()).toBeVisible()
  await (await host(table)).send([{ v: 'session.end' } as never])
  await answer(ada.page)
  await expect(ada.page.getByText(`Thank you, ${NAME}.`)).toBeVisible()

  const surveys = async () => (await (await request.get(`/sessions/${encodeURIComponent(table.session)}/surveys`)).json()) as { who: string }[]
  expect((await surveys()).map((s) => s.who)).toEqual([NAME])
  const before = await open(TV, table.tableUrl, { facesReady: true })
  await before.wire.until((frame) => frame.includes(NAME))

  const thanks = ada.page.locator('.byd-survey-thanks')
  await expect(thanks.getByText('With your name kept, the designer knows who did and said what.')).toBeVisible()
  await thanks.getByRole('button', { name: 'Remove my name and my answers…' }).tap()
  const ask = ada.page.getByRole('alertdialog', { name: 'Remove your name and your answers?' })
  await expect(ask).toContainText('your survey answers')
  await ask.getByRole('button', { name: 'Yes, remove' }).tap()
  await expect(ada.page.getByText('Your name and your answers are removed.')).toBeVisible()
  await expect(ada.page.getByText('Thank you.', { exact: true })).toBeVisible()
  await expect(ada.page.getByRole('link', { name: 'Save to your account' })).toHaveCount(0)
  expect(await surveys()).toEqual([])
  // Answers that are gone are tied to no version (#1353), and a reload says what was done, as the
  // server knows it, rather than the thanks for answers that are no longer there.
  await expect(thanks).not.toContainText('tied to')
  await ada.page.reload()
  await expect(ada.page.getByText('Your name and your answers are removed.')).toBeVisible()
  await expect(ada.page.getByText('Thank you.', { exact: true })).toBeVisible()
  await expect(ada.page.locator('.byd-survey-thanks')).not.toContainText('tied to')
  await expect(ada.page.getByRole('button', { name: 'Answer again' })).toHaveCount(0)

  // The table, opened now: her seat is still taken, under the masked name in words, and no frame
  // carries her name.
  const tv = await open(TV, table.tvUrl, { facesReady: true })
  await tv.wire.until((frame) => frame.includes('"snapshot"'))
  expect(tv.wire.received().join('\n')).not.toContain(NAME)
  await expect(tv.page.getByText('No name').first()).toBeVisible()
  const shown = await tv.page.locator('body').innerText()
  expect(shown).not.toContain(PLACEHOLDER)
  expect(shown).not.toContain(NAME)
})

// A guest who answered and opens her link again in a new tab (#1355, beställarens beslut): the
// phone asks the server, and shows the thanks with «Answer again» and the way to remove her name
// rather than the first question. Answering again says that the new answer replaces the first.
test('the link opened again in a new tab shows the thanks, and answering again replaces the first answer', async ({ request, player, host }) => {
  const table = await tableWithRules(request, { players: 2 })
  const ada = await player(table, { name: NAME, seat: table.seats[0]!, device: PHONE })
  await expect(ada.page.getByText(NAME).first()).toBeVisible()
  await (await host(table)).send([{ v: 'session.end' } as never])
  await answer(ada.page)
  await expect(ada.page.getByText(`Thank you, ${NAME}.`)).toBeVisible()
  const surveys = async () => (await (await request.get(`/sessions/${encodeURIComponent(table.session)}/surveys`)).json()) as { who: string; answers: { fun: number } }[]

  const again = await ada.page.context().newPage()
  await again.goto(ada.page.url())
  await expect(again.getByText(`Thank you, ${NAME}.`)).toBeVisible()
  await expect(again.getByText('Four questions, one minute', { exact: false })).toHaveCount(0)
  await expect(again.getByRole('button', { name: 'Remove my name and my answers…' })).toBeVisible()
  await again.getByRole('button', { name: 'Answer again' }).tap()
  await expect(again.getByText('Your new answer replaces the first.')).toBeVisible()
  const survey = again.locator('.byd-survey')
  for (const n of ['1', '1', '1']) {
    await survey.getByRole('button', { name: n, exact: true }).tap()
    await survey.getByRole('button', { name: 'Next' }).tap()
  }
  await survey.getByRole('button', { name: 'Send' }).tap()
  await expect(again.getByText(`Thank you, ${NAME}.`)).toBeVisible()
  expect((await surveys()).map((s) => [s.who, s.answers.fun])).toEqual([[NAME, 1]])
})
