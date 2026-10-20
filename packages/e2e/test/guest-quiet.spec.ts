import type { Page } from '@playwright/test'
import { tableWithRules } from '../support/api.js'
import { PHONE } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// Two small things a guest met on every table before the beta (#744).

// A guest is never logged in (G1), so «not logged in» is the answer every guest page expects to
// hear — and it was heard as a 401, which the browser writes in the console as an error on every
// page a guest opens. The only console error in the whole player's journey, and it was not one.
const errorsOn = (page: Page): string[] => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`${msg.text()} — ${msg.location().url}`)
  })
  page.on('pageerror', (err) => errors.push(err.message))
  return errors
}

test('a guest walks from the code to the hand without a console error', async ({ table, open }) => {
  const phone = await open(PHONE, '/')
  const errors = errorsOn(phone.page)
  for (const path of ['/', `/join?code=${table.code}`, '/claim']) {
    await phone.page.goto(path)
    await expect(phone.page.locator('#root')).not.toBeEmpty()
    // Whatever the page asks for on its own has been asked and answered.
    await phone.page.waitForLoadState('networkidle')
  }
  await phone.page.goto(`/join?code=${table.code}`)
  await phone.page.locator('button[data-seat="B"]').click()
  await phone.page.locator('form input').fill('Signe')
  await phone.page.locator('form button[type="submit"]').click()
  await phone.page.waitForURL('**/play*')
  await expect(phone.page.locator('[data-page="player"]')).toBeVisible()
  await phone.page.waitForLoadState('networkidle')
  expect(errors).toEqual([])
})

// The survey asks how clear the rules were (G3), and a game with no rulebook has no rules to be
// clear: the players learned it from the designer in the room. There it asks how easy the game
// was to understand — the same scale about the same thing, so a game that later gets a book is
// still read on one line.
test.describe('the survey after a session', () => {
  const second = async (page: Page) => {
    const survey = page.locator('.byd-survey')
    await expect(survey).toHaveAttribute('data-survey', 'fun')
    await survey.getByRole('button', { name: '4', exact: true }).click()
    await survey.getByRole('button', { name: 'Next' }).click()
    await expect(survey).toHaveAttribute('data-survey', 'clarity')
    return survey.getByRole('heading', { level: 2 })
  }

  test('asks how easy the game was to understand at a table without a rulebook', async ({ table, player, host }) => {
    const ada = await player(table, { name: 'Ada', seat: table.seats[0]!, device: PHONE })
    await (await host(table)).send([{ v: 'session.end' } as never])
    await expect(await second(ada.page)).toHaveText('How easy was the game to understand?')
  })

  test('asks how clear the rules were where there were rules', async ({ request, player, host }) => {
    const table = await tableWithRules(request, { players: 2 })
    const ada = await player(table, { name: 'Ada', seat: table.seats[0]!, device: PHONE })
    await (await host(table)).send([{ v: 'session.end' } as never])
    await expect(await second(ada.page)).toHaveText('How clear were the rules?')
  })
})
