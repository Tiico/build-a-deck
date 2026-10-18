import { logIn, makeProjectOf } from '../support/api.js'
import { DESK } from '../support/devices.js'
import { gameDoc } from '../support/game.js'
import { expect, test } from '../support/test.js'

// New cards as a proposal, the whole way (#1002, #940 variant A): a designer asks for three cards
// and sees them arrive in the panel one at a time, lays them on the wall among her deck's cards,
// accepts them in one step — one edit over the editor's line, one step back — and takes them back;
// discards a second proposal, which changes nothing; and is told when a third is not one the game
// can take. The provider is the stack's fake behind the server's own proxy, never a real one.
const KEY = 'sk-ant-api03-good-e2eNotARealKey-0123456789abcdefP1p2'
const GAME = 'Skogens förslag'

test('a designer asks for cards, sees them stream in and on the wall, accepts them in one step and takes them back, discards another, and is told when one is unusable', async ({ open }) => {
  const desk = await open(DESK, '/')
  await logIn(desk.page.request)
  const { page, wire } = desk
  expect((await page.request.put('/me/ai-key', { data: { provider: 'anthropic', key: KEY } })).status()).toBe(200)
  const project = await makeProjectOf(page.request, gameDoc({ name: GAME, cards: 6 }))
  await page.goto(project.editorUrl)
  await expect(page.getByRole('heading', { level: 1, name: GAME })).toBeVisible()
  const panel = page.getByRole('complementary', { name: 'AI help' })
  const field = panel.getByRole('textbox', { name: 'Ask about the game' })
  const wall = page.locator('.byd-wall-card')
  await expect(wall).toHaveCount(6)

  // Three cards, a card at a time: the first is drawn while the rest are still being written. What
  // the panel drew is written down by the page itself as it changes, since a poll from here can step
  // over a state that lasts less than its interval.
  await page.evaluate(`(() => {
    const seen = (window.__drawn = [])
    new MutationObserver(() => {
      const group = document.querySelector('.byd-ai-proposal[aria-busy]')
      const now = (group ? group.querySelectorAll('.byd-ai-card').length : 0) + ':' + (document.querySelector('.byd-ai-decide') ? 'decide' : 'wait')
      if (seen[seen.length - 1] !== now) seen.push(now)
    }).observe(document.body, { subtree: true, childList: true, attributes: true })
  })()`)
  await field.fill('Three cheap cards [kort:3] [sakta]')
  await field.press('Enter')
  const proposal = panel.getByRole('group', { name: /^Proposal/ })
  const cards = proposal.locator('.byd-ai-card')
  await expect(cards).toHaveCount(1)
  await expect(proposal).toHaveAttribute('aria-busy', 'true')
  await expect(proposal.getByRole('button', { name: 'Accept all' })).toHaveCount(0)
  await expect(proposal.getByRole('button', { name: 'Accept all' })).toBeVisible()
  const drawn = (await page.evaluate('window.__drawn')) as string[]
  // One card, then two, then three, and only then the way to accept them.
  expect(drawn.filter((d) => d !== '0:wait')).toEqual(['1:wait', '2:wait', '3:wait', '3:decide'])
  await expect(cards).toHaveCount(3)
  await expect(proposal).toHaveAttribute('aria-label', 'Proposal · 3 new cards')
  // Each one drawn by the one renderer, with what the model proposed on it.
  await expect(cards.nth(2).locator('.byd-preview')).toContainText('Förslag 3')

  // On the wall, among the deck's cards, as ghosts that are not in the game.
  await proposal.getByRole('button', { name: 'Show on the wall' }).click()
  const ghosts = page.locator('.byd-wall-card[data-proposed]')
  await expect(ghosts).toHaveCount(3)
  await expect(wall).toHaveCount(9)
  await expect(ghosts.first()).toBeInViewport()
  await expect(ghosts.first()).toHaveAccessibleName('Proposal: Förslag 1')
  await expect(ghosts.first()).toContainText('Proposal')
  expect(wire.sent().filter((f) => f.includes('"t":"edit"'))).toEqual([])

  // Accepted in one step: one edit over the editor's line, a composite of three new rows.
  await proposal.getByRole('button', { name: 'Accept all' }).click()
  await expect(panel.getByText('Accepted: 3 new cards in the deck.')).toBeVisible()
  await expect(ghosts).toHaveCount(0)
  await expect(wall).toHaveCount(9)
  const edits = () => wire.sent().filter((f) => f.includes('"t":"edit"')).map((f) => JSON.parse(f) as { intent: { v: string; edits?: { v: string }[]; doc?: { rows: unknown[] } } })
  expect(edits()).toHaveLength(1)
  expect(edits()[0]!.intent.v).toBe('compound')
  expect(edits()[0]!.intent.edits!.map((e) => e.v)).toEqual(['addRow', 'addRow', 'addRow'])

  // And taken back with one step: one more line, and the deck as it was.
  const undo = page.getByRole('button', { name: 'Undo the accepted proposal' })
  await undo.click()
  await expect(wall).toHaveCount(6)
  expect(edits()).toHaveLength(2)
  expect(edits()[1]!.intent.v).toBe('restore')
  expect(edits()[1]!.intent.doc!.rows).toHaveLength(6)

  // A second proposal, discarded: nothing is sent, and the deck is as it was.
  await field.fill('Two more [kort:2]')
  await field.press('Enter')
  const second = panel.getByRole('group', { name: 'Proposal · 2 new cards' })
  await second.getByRole('button', { name: 'Discard' }).click()
  await expect(panel.getByText('Discarded. Nothing changed.')).toBeVisible()
  expect(edits()).toHaveLength(2)
  await expect(wall).toHaveCount(6)

  // A proposal the game cannot take is said to be the AI's, with the reason.
  await field.fill('Two odd ones [oanvändbart]')
  await field.press('Enter')
  const alert = panel.getByRole('alert')
  await expect(alert).toContainText('The proposal could not be used')
  await expect(alert).toContainText('Card 2 (“Förslag 2”) writes in the field “trolldom”, which the game does not have.')
  await expect(alert.getByRole('button', { name: 'Try again' })).toBeVisible()
  expect(edits()).toHaveLength(2)
  await expect(wall).toHaveCount(6)
})
