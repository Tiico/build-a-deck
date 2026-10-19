import { logIn, makeProjectOf } from '../support/api.js'
import { DESK } from '../support/devices.js'
import { gameDoc } from '../support/game.js'
import { expect, test } from '../support/test.js'

// Rule text as a proposal, the whole way (#1006, #940 variant A): a designer asks for help with her
// rulebook; the proposal is blocks in the book's own format placed after the book's last block, with
// the zone it names written by id; «Show in the rulebook» takes her to Regler, where the book's own
// rendering draws the new blocks marked and the zone by its name. Accepting is one composite edit
// over the editor's line, taken back with one step; and rule text naming a zone the game does not
// have is refused with the reason, writing nothing. The provider is the stack's fake behind the
// server's own proxy, whose `[regler]` and `[regler-trasig]` answer with such rule text.
const KEY = 'sk-ant-api03-good-e2eNotARealKey-0123456789abcdefR3gl'
const GAME = 'Skogens regler'

test('a designer asks for rules, sees them marked in the rulebook with names, accepts them in one step, takes them back, and is told why broken ones are refused', async ({ open }) => {
  const desk = await open(DESK, '/')
  await logIn(desk.page.request)
  const { page, wire } = desk
  expect((await page.request.put('/me/ai-key', { data: { provider: 'anthropic', key: KEY } })).status()).toBe(200)
  const doc = { ...gameDoc({ name: GAME, cards: 4 }), rules: { title: GAME, blocks: [{ kind: 'heading' as const, id: 'b1', level: 1 as const, text: 'Overview' }, { kind: 'text' as const, id: 'b2', text: 'A game about the forest.' }] } }
  const zone = doc.setup.zones[0]!
  const project = await makeProjectOf(page.request, doc)
  await page.goto(project.editorUrl)
  await expect(page.getByRole('heading', { level: 1, name: GAME })).toBeVisible()
  const panel = page.getByRole('complementary', { name: 'AI help' })
  const field = panel.getByRole('textbox', { name: 'Ask about the game' })
  const edits = () => wire.sent().filter((f) => f.includes('"t":"edit"')).map((f) => JSON.parse(f) as { intent: { v: string; edits?: { v: string; after?: string | null; blocks?: { text?: string }[] }[]; doc?: typeof doc } })

  // 1. Ask for rules.
  await field.fill('Write the rules for drawing a card [regler]')
  await field.press('Enter')
  const proposal = panel.getByRole('group', { name: 'Proposal · 1 addition to the rulebook' })
  await expect(proposal.getByRole('button', { name: 'Accept all' })).toBeVisible()
  await expect(proposal).toContainText(`Börja din tur med att dra ett kort från ${zone.name}.`)

  // 2. Shown in the rulebook, marked, with the reference drawn as the zone's name and not its id.
  await proposal.getByRole('button', { name: 'Show in the rulebook' }).click()
  await expect(page.getByRole('tab', { name: 'Rules' })).toHaveAttribute('aria-selected', 'true')
  const book = page.locator('article.byd-rulebook')
  await expect(book.locator('[data-ai="new"]')).toHaveCount(3)
  await expect(book.locator('[data-ai="new"]').first()).toContainText('Proposal')
  await expect(book.locator('[data-ai="new"]').nth(1)).toHaveText(`Börja din tur med att dra ett kort från ${zone.name}. Har du inget kort kvar att dra, blandar du om kasthögen.`)
  await expect(book).not.toContainText('[[')
  await expect(page.getByRole('status').filter({ hasText: 'The AI help’s proposal' })).toContainText('1 addition to the rulebook')
  expect(edits()).toEqual([])

  // 3. Accepted: one line in the log, the rule text placed after the book's last block by id.
  await proposal.getByRole('button', { name: 'Accept all' }).click()
  await expect(panel.getByText('Accepted: 1 addition to the rulebook.')).toBeVisible()
  expect(edits()).toHaveLength(1)
  expect(edits()[0]!.intent.v).toBe('compound')
  expect(edits()[0]!.intent.edits!.map((e) => [e.v, e.after])).toEqual([['spliceRules', 'b2']])
  expect(edits()[0]!.intent.edits![0]!.blocks![1]!.text).toContain(`[[zon:${zone.id}]]`)
  await expect(book.locator('[data-ai]')).toHaveCount(0)
  await expect(book).toContainText(`Börja din tur med att dra ett kort från ${zone.name}.`)

  // 4. Taken back with one step: the book as it was.
  await page.getByRole('button', { name: 'Undo the accepted proposal' }).click()
  await expect(book).not.toContainText('Börja din tur')
  expect(edits()).toHaveLength(2)
  expect(edits()[1]!.intent.v).toBe('restore')
  expect(edits()[1]!.intent.doc!.rules).toEqual(doc.rules)

  // 5. Rule text naming a zone the game does not have is refused, with the reason, and writes nothing.
  await field.fill('Again [regler-trasig]')
  await field.press('Enter')
  const refused = panel.getByRole('alert').filter({ hasText: 'The proposal could not be used' })
  await expect(refused).toContainText('Rule text 1 (“Att dra kort”) names the zone “finns-inte”, which the game does not have.')
  await expect(refused).toContainText('It was the AI’s answer that could not be used, not your game.')
  expect(edits()).toHaveLength(2)
})
