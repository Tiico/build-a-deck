import { logIn, makeProjectOf } from '../support/api.js'
import { DESK } from '../support/devices.js'
import { cardTitle, gameDoc } from '../support/game.js'
import { expect, test } from '../support/test.js'

// A template proposal, the whole way (#1005, #940 variant A): a designer describes a card type in
// words; the proposal is a face in the template's element model with a new field and its values,
// drawn on a few of the deck's cards in the panel with what the physical check says of it, and laid
// on the wall where the whole deck is drawn with it by the one renderer (E2). Accepting it is one
// composite edit over the editor's line — the field, the face and the values — taken back with one
// step; and a template with an element outside the card is refused with the reason, writing
// nothing. The provider is the stack's fake behind the server's own proxy, whose `[mall]` and
// `[mall-trasig]` answer with such templates.
const KEY = 'sk-ant-api03-good-e2eNotARealKey-0123456789abcdefM4l1'
const GAME = 'Skogens mallar'

test('a designer asks for a template, sees it on the wall with its warnings, accepts it in one step, takes it back, and is told why a broken one is refused', async ({ open }) => {
  const desk = await open(DESK, '/')
  await logIn(desk.page.request)
  const { page, wire } = desk
  expect((await page.request.put('/me/ai-key', { data: { provider: 'anthropic', key: KEY } })).status()).toBe(200)
  const doc = gameDoc({ name: GAME, cards: 6 })
  const project = await makeProjectOf(page.request, doc)
  await page.goto(project.editorUrl)
  await expect(page.getByRole('heading', { level: 1, name: GAME })).toBeVisible()
  const panel = page.getByRole('complementary', { name: 'AI help' })
  const field = panel.getByRole('textbox', { name: 'Ask about the game' })
  const wallCard = (cardRef: string) => page.locator(`.byd-wall-card[data-card-ref="${cardRef}"]`)
  const edits = () => wire.sent().filter((f) => f.includes('"t":"edit"')).map((f) => JSON.parse(f) as { intent: { v: string; edits?: { v: string; field?: string; cardRef?: string; value?: unknown }[]; parts?: { at: string[]; to?: unknown }[] } })
  await expect(page.locator('.byd-wall-card')).toHaveCount(6)

  await field.fill('A card with its power in a coin in the corner [mall]')
  await field.press('Enter')
  const proposal = panel.getByRole('group', { name: 'Proposal · new template for the front, 1 new field' })
  await expect(proposal.getByRole('button', { name: 'Accept all' })).toBeVisible()
  // A few of the deck's cards, drawn by the one renderer with the proposed template.
  await expect(proposal.locator('.byd-ai-card[data-template] .byd-preview').first().locator('[data-element="coin"]')).toBeVisible()
  await expect(proposal).toContainText('New field: kraft')
  await expect(proposal).toContainText('2 cards get a value')
  // What the physical check says of it, before it is accepted, and without stopping it (E5).
  const checks = proposal.locator('.byd-ai-checks')
  await expect(checks).toContainText('Physical check')
  await expect(checks).toContainText('text too small · 2 cards')
  // Only what is on the face the proposal draws, for the cards it only redraws: the game's own back
  // is not the proposal's to answer for.
  await expect(checks).not.toContainText('short of the bleed')

  // On the wall: the whole deck drawn with it, each card marked, and the new values old → new.
  const crownCheck = page.locator('.byd-wall-crown').getByRole('button', { name: /^Physical check/ })
  await proposal.getByRole('button', { name: 'Show on the wall' }).click()
  await expect(page.locator('.byd-wall-card[data-changed]')).toHaveCount(6)
  await expect(wallCard('kort-1').locator('[data-element="coin"]')).toBeVisible()
  await expect(wallCard('kort-3').locator('[data-element="coin"]')).toHaveCount(0)
  await expect(page.locator('.byd-wall-cell:has([data-card-ref="kort-1"]) .byd-wall-changes')).toContainText('kraft: — → 1')
  await expect(wallCard('kort-3')).toHaveAccessibleName(`Changed in the proposal: ${cardTitle(2)}, drawn with the proposed template`)
  // The wall's own check reads the deck as the proposal draws it, and its report says the small text.
  await crownCheck.click()
  await expect(page.locator('.byd-wall-view').getByText('text too small').first()).toBeVisible()
  await page.keyboard.press('Escape')
  expect(edits()).toEqual([])

  // Accepted, nothing deselected: one line, the field, the face and the values.
  await proposal.getByRole('button', { name: 'Accept all' }).click()
  await expect(panel.getByText('Accepted: new template for the front and 1 new field.')).toBeVisible()
  expect(edits()).toHaveLength(1)
  expect(edits()[0]!.intent.v).toBe('compound')
  expect(edits()[0]!.intent.edits!.map((e) => [e.v, e.field ?? null, e.cardRef ?? null])).toEqual([
    ['addField', 'kraft', null],
    ['replaceFace', null, null],
    ['setCell', 'kraft', 'kort-1'],
    ['setCell', 'kraft', 'kort-2'],
  ])
  await expect(page.locator('.byd-wall-card[data-changed]')).toHaveCount(0)
  await expect(wallCard('kort-1').locator('[data-element="coin"]')).toBeVisible()
  await page.getByRole('tab', { name: 'Data' }).click()
  await expect(page.getByRole('textbox', { name: 'kort-2 kraft' })).toHaveValue('2')
  await page.getByRole('tab', { name: 'Card wall' }).click()

  // Taken back with one step: the template and the deck as they were.
  await page.getByRole('button', { name: 'Undo the accepted proposal' }).click()
  await expect(wallCard('kort-1').locator('[data-element="coin"]')).toHaveCount(0)
  expect(edits()).toHaveLength(2)
  // A step back writes back only what the step changed (#1056), never the whole document.
  expect(edits()[1]!.intent.v).toBe('revert')
  // Only the template and the column's cells are named: nothing else of the game is written back.
  expect(edits()[1]!.intent.parts!.every((p) => p.at[0] === 'template' || p.at[0] === 'rows')).toBe(true)

  // A template with its title past the card's edge is refused, with the reason, and writes nothing.
  await field.fill('Another one [mall-trasig]')
  await field.press('Enter')
  const refused = panel.getByRole('alert').filter({ hasText: 'The proposal could not be used' })
  await expect(refused).toContainText('The template’s layer “title” lies outside the card.')
  await expect(refused).toContainText('The answer from the AI could not be used. Nothing in the game changed.')
  expect(edits()).toHaveLength(2)
})
