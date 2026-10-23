import type { Page } from '@playwright/test'
import { join, logIn, makeProjectOf, startTable } from '../support/api.js'
import { DESK, PHONE } from '../support/devices.js'
import { gameDoc } from '../support/game.js'
import { expect, test } from '../support/test.js'

// The designer reads the playtest (#1010, beställarens val 2026-10-18), in the built app. A table
// is played from two phones, one of them flags a moment, the table ends, both phones answer the
// survey — and the designer finds it all in the Bord tab: the ended table's row says what came of
// it, and the line opens Resultat on that table.
const answer = async (page: Page, scales: string[], change: string) => {
  const survey = page.locator('.byd-survey')
  await expect(survey).toBeVisible()
  for (const n of scales) {
    await survey.getByRole('button', { name: n, exact: true }).click()
    await survey.getByRole('button', { name: 'Next' }).click()
  }
  await survey.getByRole('textbox').fill(change)
  await survey.getByRole('button', { name: 'Send' }).click()
  await expect(survey.getByText(/^Thank you/)).toBeVisible()
}

test('the designer reads the phones’ answers and the flag in the Resultat view', async ({ open, request, host }) => {
  const desk = await open(DESK, '/')
  await logIn(desk.page.request)
  const doc = gameDoc({ name: 'Skogens herrar', players: 2, cards: 6 })
  const project = await makeProjectOf(desk.page.request, doc)
  const started = await startTable(desk.page.request, project.id)
  const table = { ...started, seats: doc.setup.seats }

  const seats = doc.setup.seats
  const ada = await open(PHONE, (await join(request, table, { name: 'Ada', seat: seats[0]! })).playUrl)
  const bo = await open(PHONE, (await join(request, table, { name: 'Bo', seat: seats[1]! })).playUrl)
  await expect(ada.page.getByText('Ada').first()).toBeVisible()
  await expect(bo.page.getByText('Bo').first()).toBeVisible()
  const dealer = await host(table)
  await dealer.send([{ v: 'draw', from: 'draw', to: 'table', count: 1 } as never])

  // Ada flags a moment from her phone, with a word about it.
  // The flag stands in «More» on the phone (#1147).
  await ada.page.getByRole('tab', { name: /^More/ }).click()
  await ada.page.getByRole('button', { name: 'Flag' }).click()
  const sheet = ada.page.getByRole('dialog')
  await sheet.getByRole('textbox').fill('The dragon is too strong')
  await sheet.getByRole('button', { name: 'Flag' }).click()
  await expect(ada.page.getByRole('status').filter({ hasText: 'Flagged' }).first()).toBeVisible()

  await dealer.send([{ v: 'session.end' } as never])
  await answer(ada.page, ['4', '3', '2'], 'A shorter round')
  await answer(bo.page, ['2', '4', '5'], 'More cards to draw')

  // The designer, in the editor's Bord tab.
  await desk.page.goto(project.editorUrl)
  await desk.page.getByRole('tab', { name: 'Tables' }).click()
  await desk.page.getByRole('button', { name: 'Ended tables · 1' }).click()
  const line = desk.page.getByRole('button', { name: `Answers and flags from ${table.code}: 2 answers · 1 flag` })
  await expect(line).toBeVisible()
  await line.click()

  await expect(desk.page.getByRole('heading', { level: 2, name: 'Version 1' })).toBeFocused()
  await expect(desk.page.getByRole('button', { name: 'Results', pressed: true })).toBeVisible()
  await expect(desk.page.getByRole('button', { name: table.code, pressed: true })).toBeVisible()
  await expect(desk.page.getByText('2 of 2 players answered', { exact: false })).toBeVisible()
  await expect(desk.page.getByText('A shorter round')).toBeVisible()
  await expect(desk.page.getByText('More cards to draw')).toBeVisible()
  await expect(desk.page.getByText(/move 1 of 1/)).toBeVisible()
  await expect(desk.page.getByText(/«The dragon is too strong»/)).toBeVisible()
  const fun = desk.page.getByRole('table', { name: /How the answers fall per question for version 1/ }).getByRole('row', { name: /^Fun/ })
  await expect(fun.getByRole('cell').nth(1)).toContainText('1 answered 2')
  await expect(fun.getByRole('cell').nth(3)).toContainText('1 answered 4')
})

// A flag about a card (#1142, beställarens val 2026-10-22): from the phone, «Flagga», «Ett kort…»
// and a tap on the card in the hand — which neither reads nor plays it — and the designer finds
// the very card in the flag's row in Resultat, and lifts it.
test('a card pointed out from the phone is the card in the flag’s row in Resultat', async ({ open, request, host }) => {
  const desk = await open(DESK, '/')
  await logIn(desk.page.request)
  const doc = gameDoc({ name: 'Skogens herrar', players: 2, cards: 6 })
  const project = await makeProjectOf(desk.page.request, doc)
  const started = await startTable(desk.page.request, project.id)
  const table = { ...started, seats: doc.setup.seats }
  const ada = await open(PHONE, (await join(request, table, { name: 'Ada', seat: doc.setup.seats[0]! })).playUrl)
  await expect(ada.page.getByText('Ada').first()).toBeVisible()
  const dealer = await host(table)
  await dealer.send([{ v: 'deal', from: 'draw', to: ['hand:A'], each: 2 } as never])
  const cards = ada.page.locator('[data-hand] [data-hand-card]')
  await expect(cards).toHaveCount(2)

  // The flag stands in «More» on the phone (#1147).
  await ada.page.getByRole('tab', { name: /^More/ }).click()
  await ada.page.getByRole('button', { name: 'Flag' }).click()
  await ada.page.getByRole('dialog').getByRole('textbox').fill('Too much text')
  await ada.page.getByRole('button', { name: /A card/ }).click()
  await expect(ada.page.getByRole('status', { name: 'Tap the card it is about' })).toBeVisible()
  // The hand is a tab away, and a tab still turns while a card is pointed out.
  await ada.page.getByRole('tab', { name: /^Hand/ }).click()
  await cards.nth(1).tap()
  await expect(ada.page.locator('.byd-inspect')).toHaveCount(0)
  const sheet = ada.page.getByRole('dialog', { name: 'Flag the card' })
  // The card in the sheet is the one tapped.
  const title = (await sheet.locator('.byd-flag-about-words b').textContent())!
  expect(await cards.nth(1).getAttribute('aria-label')).toContain(title)
  await expect(sheet.getByRole('textbox')).toHaveValue('Too much text')
  await sheet.getByRole('button', { name: 'Flag', exact: true }).click()
  await expect(ada.page.getByRole('status').filter({ hasText: 'Flagged' }).first()).toBeVisible()
  await expect(cards).toHaveCount(2)
  await dealer.send([{ v: 'session.end' } as never])

  await desk.page.goto(project.editorUrl)
  await desk.page.getByRole('tab', { name: 'Tables' }).click()
  await desk.page.getByRole('button', { name: 'Results' }).click()
  const thumb = desk.page.getByRole('button', { name: `Show ${title} as the card was` })
  await expect(thumb).toBeVisible()
  await expect(desk.page.getByText(`${title} · in Ada’s hand · the same in the latest version`)).toBeVisible()
  await thumb.click()
  const lifted = desk.page.getByRole('dialog', { name: `${title} as the card was` })
  await expect(lifted).toContainText('when Ada flagged it')
  await expect(lifted).toContainText('«Too much text»')
  await desk.page.keyboard.press('Escape')
  await expect(lifted).toHaveCount(0)
  await expect(thumb).toBeFocused()
})
