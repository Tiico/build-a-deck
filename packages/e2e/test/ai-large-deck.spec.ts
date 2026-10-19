import { readFileSync } from 'node:fs'
import { largeDoc } from '../../server/scripts/large-deck.js'
import { logIn, makeProjectOf } from '../support/api.js'
import { DESK } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// A large deck, the whole way (#1007): a designer whose game has 308 cards of fifteen fields, a full
// rulebook and a template with variants opens it, is told before she asks that the deck goes to the
// provider summarised, asks about it, and gets her answer — through the server's own proxy and the
// stack's fake provider, never a real one. The scaled game is the same one the context builder's
// budget is measured against (`server/scripts/large-deck.ts`).
const KEY = 'sk-ant-api03-good-e2eNotARealKey-0123456789abcdefL308'
const GAME = 'Saloonen i full skala'

test('a designer with a deck of 308 cards is told it goes summarised, asks about it and is answered', async ({ open }) => {
  const desk = await open(DESK, '/')
  await logIn(desk.page.request)
  const { page } = desk
  expect((await page.request.put('/me/ai-key', { data: { provider: 'anthropic', key: KEY } })).status()).toBe(200)
  // The game's pictures and typefaces are the designer's uploads, which this stack has not had; the
  // cards keep their picture column, empty, so the template still draws one.
  const doc = largeDoc()
  const project = await makeProjectOf(page.request, { ...doc, name: GAME, icons: {}, fonts: {}, rows: doc.rows.map((row) => ({ ...row, fields: { ...row.fields, bild: '' } })) })
  await page.goto(project.editorUrl)
  await expect(page.getByRole('heading', { level: 1, name: GAME })).toBeVisible()

  // Said before she asks: the deck goes, but summarised, beside the template, the rules and the table.
  const panel = page.getByRole('complementary', { name: 'AI help' })
  const sent = panel.getByText(/^Sent to Anthropic:/).locator('..')
  await expect(sent).toContainText('308 cards (summarised)')
  await expect(sent).toContainText('the template')
  await expect(sent).toContainText('the rulebook')

  // And the question is answered off the game the server holds.
  const field = panel.getByRole('textbox', { name: 'Ask about the game' })
  await field.fill('Which cards cost the most?')
  await field.press('Enter')
  const answers = panel.locator('[aria-live="polite"]')
  await expect(answers.last()).toHaveAttribute('aria-busy', 'false')
  await expect(answers.last()).toHaveText(`Du frågade: «Which cards cost the most?». Spelet heter ${GAME}.`)

  // One line in the server's log for it, which went well, and nothing of the deck in it.
  const log = process.env['BYD_E2E_SERVER_LOG']
  expect(log, 'the stack says where the server writes its log').toBeTruthy()
  const owner = ((await (await page.request.get(`/projects/${project.id}`)).json()) as { owner: string }).owner
  const mine = () =>
    readFileSync(log!, 'utf8')
      .split('\n')
      .filter((l) => l.includes('"msg":"ai"') && l.includes(owner))
      .map((l) => JSON.parse(l) as Record<string, unknown>)
  await expect.poll(() => mine().length).toBe(1)
  expect(mine()[0]!['outcome']).toBe('ok')
  expect(readFileSync(log!, 'utf8')).not.toContain('Which cards cost the most')
})
