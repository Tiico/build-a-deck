import { readFileSync } from 'node:fs'
import { logIn, makeProjectOf } from '../support/api.js'
import { DESK } from '../support/devices.js'
import { gameDoc } from '../support/game.js'
import { expect, test } from '../support/test.js'

// The first question, the whole way (#1001, #940 variant A): an editor without a key that points to
// the profile, a key saved there, the way back to the game, a question in the panel and its answer
// streamed in, an answer stopped half-way, and a provider that says no. The provider is the stack's
// fake (`support/stack.ts`), behind the server's own proxy — never Anthropic or OpenAI — and what the
// server writes to its log is read at the end: who, which provider, how long and how it went, and
// nothing of the key, the game, the question or the answer.
const KEY = 'sk-ant-api03-good-e2eNotARealKey-0123456789abcdefQ1q2'
const GAME = 'Skogens hemliga herrar'

test('a designer adds her key from the editor, asks about her game, stops an answer and is told when the provider says no', async ({ open }) => {
  const desk = await open(DESK, '/')
  await logIn(desk.page.request)
  const { page } = desk
  const project = await makeProjectOf(page.request, gameDoc({ name: GAME, cards: 12 }))
  await page.goto(project.editorUrl)
  await expect(page.getByRole('heading', { level: 1, name: GAME })).toBeVisible()

  // Without a key the panel is a narrow tab at the edge, and the work has the rest.
  const tab = page.getByRole('button', { name: 'AI help' })
  await expect(tab).toHaveAttribute('aria-expanded', 'false')
  expect((await tab.boundingBox())!.width).toBeLessThanOrEqual(45)
  await expect(page.getByRole('textbox', { name: 'Ask about the game' })).toHaveCount(0)
  await tab.click()
  const panel = page.getByRole('complementary', { name: 'AI help' })
  const toProfile = panel.getByRole('link', { name: 'Add a key on your profile' })
  await expect(toProfile).toBeFocused()
  await toProfile.click()

  // The profile, with the game carried along.
  await expect(page).toHaveURL(new RegExp(`/profile\\?from=${project.id}$`))
  const box = page.getByRole('region', { name: 'AI key' })
  await box.getByLabel('API key').fill(KEY)
  await box.getByRole('button', { name: 'Save and test' }).click()
  await expect(box.getByText(/the key ending in/)).toContainText('…Q1q2')
  // The filled way back, which is the page's first action once the key is saved.
  await page.locator('.byd-primary').getByText(`Back to ${GAME}`, { exact: true }).click()

  // Back in the editor, the panel stands open beside the work and says what is sent to whom.
  await expect(page.getByRole('heading', { level: 1, name: GAME })).toBeVisible()
  await expect(panel).toBeVisible()
  expect(Math.round((await panel.boundingBox())!.width)).toBe(380)
  await expect(panel.getByText(/^Sent to Anthropic:/).locator('..')).toContainText('12 cards')
  const field = panel.getByRole('textbox', { name: 'Ask about the game' })

  // A question, and the answer as it streams in, read off the game the server holds.
  await field.fill('What is the game called?')
  await field.press('Enter')
  const answers = panel.locator('[aria-live="polite"]')
  await expect(answers.last()).toHaveAttribute('aria-busy', 'false')
  await expect(answers.last()).toHaveText(`Du frågade: «What is the game called?». Spelet heter ${GAME}.`)
  await expect(field).toHaveValue('')
  await expect(field).toBeFocused()

  // A long answer, stopped half-way with Escape: the send is the stop meanwhile, in the same place.
  await field.fill('Tell me everything [slow]')
  await field.press('Enter')
  await expect(answers.last()).toContainText('Ett')
  await expect(panel.getByRole('button', { name: 'Cancel' })).toBeVisible()
  await field.press('Escape')
  await expect(panel.getByText('Cancelled.')).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Send' })).toBeVisible()

  // A provider that is overloaded is said in plain words, with the way to ask again.
  await field.fill('Once more [overloaded]')
  await field.press('Enter')
  const alert = panel.getByRole('alert')
  await expect(alert).toContainText('Anthropic is overloaded right now')
  await expect(alert.getByRole('button', { name: 'Try again' })).toBeVisible()

  // The server's log: a line per question, and nothing of what was asked or answered.
  const log = process.env['BYD_E2E_SERVER_LOG']
  expect(log, 'the stack says where the server writes its log').toBeTruthy()
  await expect.poll(() => readFileSync(log!, 'utf8').split('\n').filter((l) => l.includes('"msg":"ai"')).length).toBeGreaterThanOrEqual(3)
  const written = readFileSync(log!, 'utf8')
  const lines = written
    .split('\n')
    .filter((l) => l.includes('"msg":"ai"'))
    .map((l) => JSON.parse(l) as Record<string, unknown>)
  expect(lines.slice(-3).map((l) => l['outcome'])).toEqual(['ok', 'cancelled', 'overloaded'])
  for (const line of lines) expect(Object.keys(line).sort()).toEqual(['account', 'ms', 'msg', 'outcome', 'provider'])
  for (const secret of [KEY.slice(0, 24), 'What is the game called', 'Tell me everything', 'Du frågade']) expect(written).not.toContain(secret)
})
