import { logIn, makeProjectOf } from '../support/api.js'
import { DESK } from '../support/devices.js'
import { cardTitle, gameDoc } from '../support/game.js'
import { expect, test } from '../support/test.js'

// Changed cards and «Välj delar…», the whole way (#1003, #940 variant A): a designer chooses a card on
// the wall and ticks another in Data, asks for a change with them as the question's context, sees
// old → new in the table's comparison and on the wall in the proposal's own words, leaves one changed
// card and one new card out with «Choose parts…» by keyboard, accepts the rest — one edit over the
// editor's line — and takes it back with one step. The provider is the stack's fake behind the
// server's own proxy, never a real one.
const KEY = 'sk-ant-api03-good-e2eNotARealKey-0123456789abcdefC3d4'
const GAME = 'Skogens ändringar'

test('a designer selects cards, asks for a change, sees old → new on the wall and in Data, accepts chosen parts in one step and takes them back', async ({ open }) => {
  const desk = await open(DESK, '/')
  await logIn(desk.page.request)
  const { page, wire } = desk
  expect((await page.request.put('/me/ai-key', { data: { provider: 'anthropic', key: KEY } })).status()).toBe(200)
  // Six cards with a column of numbers, so a change is a number as well as a word.
  const doc = gameDoc({ name: GAME, cards: 6 })
  doc.rows = doc.rows.map((row, i) => ({ ...row, fields: { ...row.fields, kostnad: i + 2 } }))
  const project = await makeProjectOf(page.request, doc)
  await page.goto(project.editorUrl)
  await expect(page.getByRole('heading', { level: 1, name: GAME })).toBeVisible()
  const panel = page.getByRole('complementary', { name: 'AI help' })
  const field = panel.getByRole('textbox', { name: 'Ask about the game' })
  const chips = panel.locator('.byd-ai-chip')
  const wallCard = (cardRef: string) => page.locator(`.byd-wall-card[data-card-ref="${cardRef}"]`)
  await expect(page.locator('.byd-wall-card')).toHaveCount(6)

  // The card chosen on the wall and the row ticked in Data are the question's context, said first.
  await wallCard('kort-2').click()
  await expect(chips.first()).toHaveText(`selected: ${cardTitle(1)}`)
  await page.getByRole('tab', { name: 'Data' }).click()
  await page.getByRole('checkbox', { name: 'mark kort-3' }).check()
  await expect(chips.first()).toHaveText('2 marked')
  await field.fill('Make these cheaper, and two more [ändra:2] [kort:2]')
  await field.press('Enter')
  const proposal = panel.getByRole('group', { name: 'Proposal · 2 new cards, 2 changed cards' })
  await expect(proposal.getByRole('button', { name: 'Accept all' })).toBeVisible()
  await expect(proposal.locator('.byd-ai-card[data-changed]').first()).toContainText('kostnad: 3 → 2')

  // In Data, through the table's own comparison and in the proposal's words.
  await proposal.getByRole('button', { name: 'Show in the table' }).click()
  const strip = page.locator('.byd-data-compare')
  await expect(strip).toContainText('The AI help’s proposal')
  await expect(strip).not.toContainText('Compare with')
  await expect(page.locator('tr[data-card-ref="kort-2"] td[data-col="kostnad"] .byd-data-was')).toHaveText('3')
  await expect(page.locator('tr[data-card-ref="kort-2"] td[data-col="kostnad"]')).toContainText('2')
  await expect(page.locator('tr[data-change="added"]')).toHaveCount(2)

  // On the wall, the changed cards in their places, marked and with old → new under them.
  await page.getByRole('tab', { name: 'Card wall' }).click()
  await expect(page.locator('.byd-wall-card[data-changed]')).toHaveCount(2)
  await expect(page.locator('.byd-wall-card[data-proposed]')).toHaveCount(2)
  await expect(wallCard('kort-2')).toContainText('Changed')
  await expect(page.locator('.byd-wall-cell:has([data-card-ref="kort-2"]) .byd-wall-changes')).toContainText(`title: ${cardTitle(1)} → ${cardTitle(1)} II`)
  await expect(wallCard('kort-2')).toHaveAccessibleName(`Changed in the proposal: ${cardTitle(1)} — title: ${cardTitle(1)} → ${cardTitle(1)} II, kostnad: 3 → 2`)
  expect(wire.sent().filter((f) => f.includes('"t":"edit"'))).toEqual([])

  // «Choose parts…»: the keys land on the first part, and Space leaves it out; the second changed
  // card is left out the same way. The wall shows only what accepting would do.
  await proposal.getByRole('button', { name: 'Choose parts…' }).click()
  const first = proposal.getByRole('checkbox', { name: 'Include Förslag 1' })
  await expect(first).toBeFocused()
  await page.keyboard.press('Space')
  await expect(first).not.toBeChecked()
  await proposal.getByRole('checkbox', { name: `Include ${cardTitle(2)}` }).focus()
  await page.keyboard.press('Space')
  await expect(page.locator('.byd-wall-card[data-proposed]')).toHaveCount(1)
  await expect(page.locator('.byd-wall-card[data-changed]')).toHaveCount(1)
  await expect(wallCard('kort-3')).not.toHaveAttribute('data-changed')

  // Accepted: one edit over the editor's line, exactly the chosen parts.
  await expect(proposal).toContainText('2 of 4 parts chosen')
  await proposal.getByRole('button', { name: 'Accept chosen' }).click()
  await expect(panel.getByText('Accepted: 1 new card and 1 changed card.')).toBeVisible()
  const edits = () => wire.sent().filter((f) => f.includes('"t":"edit"')).map((f) => JSON.parse(f) as { intent: { v: string; edits?: { v: string; cardRef?: string; field?: string; value?: unknown }[]; doc?: { rows: { id: string; fields: Record<string, unknown> }[] } } })
  expect(edits()).toHaveLength(1)
  expect(edits()[0]!.intent.v).toBe('compound')
  expect(edits()[0]!.intent.edits!.map((e) => [e.v, e.cardRef, e.field ?? null])).toEqual([
    ['addRow', 'kort-7', null],
    ['setCell', 'kort-2', 'title'],
    ['setCell', 'kort-2', 'kostnad'],
  ])
  await expect(page.locator('.byd-wall-card')).toHaveCount(7)
  await expect(wallCard('kort-2').locator('.byd-preview')).toContainText(`${cardTitle(1)} II`)

  // And taken back with one step: the deck as it was.
  await page.getByRole('button', { name: 'Undo the accepted proposal' }).click()
  await expect(page.locator('.byd-wall-card')).toHaveCount(6)
  expect(edits()).toHaveLength(2)
  expect(edits()[1]!.intent.v).toBe('restore')
  expect(edits()[1]!.intent.doc!.rows.map((r) => [r.id, r.fields['title'], r.fields['kostnad']])).toEqual(doc.rows.map((r) => [r.id, r.fields['title'], r.fields['kostnad']]))
  await expect(wallCard('kort-2').locator('.byd-preview')).not.toContainText(`${cardTitle(1)} II`)
})
