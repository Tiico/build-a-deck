import { logIn, makeProjectOf } from '../support/api.js'
import { DESK } from '../support/devices.js'
import { gameDoc } from '../support/game.js'
import { expect, test } from '../support/test.js'

// Refining a proposal before it is accepted, the whole way (#1004, #940 variant A): a designer asks
// for three cards, lays them on the wall, leaves one out with «Choose parts…» and refines the rest
// from the line under the proposal; the refined proposal streams in and takes the old one's place in
// the panel and on the wall. A second refine stopped half-way leaves the refined proposal waiting,
// and only accepting it writes anything — one edit, one step back. The provider is the stack's fake
// behind the server's own proxy, whose `[förfina]` answers with the proposal revised.
const KEY = 'sk-ant-api03-good-e2eNotARealKey-0123456789abcdefR4f1'
const GAME = 'Skogens förfinade'

test('a designer refines a proposal, sees the refined one replace it on the wall, stops a second refine half-way, accepts, and takes it back', async ({ open }) => {
  const desk = await open(DESK, '/')
  await logIn(desk.page.request)
  const { page, wire } = desk
  expect((await page.request.put('/me/ai-key', { data: { provider: 'anthropic', key: KEY } })).status()).toBe(200)
  const project = await makeProjectOf(page.request, gameDoc({ name: GAME, cards: 6 }))
  await page.goto(project.editorUrl)
  await expect(page.getByRole('heading', { level: 1, name: GAME })).toBeVisible()
  const panel = page.getByRole('complementary', { name: 'AI help' })
  const wall = page.locator('.byd-wall-card')
  await expect(wall).toHaveCount(6)
  const edits = () => wire.sent().filter((f) => f.includes('"t":"edit"')).map((f) => JSON.parse(f) as { intent: { v: string; edits?: { v: string; fields?: Record<string, unknown> }[]; doc?: { rows: unknown[] } } })

  const ask = panel.getByRole('textbox', { name: 'Ask about the game' })
  await ask.fill('Three cheap cards [kort:3]')
  await ask.press('Enter')
  const first = panel.getByRole('group', { name: 'Proposal · 3 new cards' })
  await first.getByRole('button', { name: 'Show on the wall' }).click()
  const ghosts = page.locator('.byd-wall-card[data-proposed]')
  await expect(ghosts).toHaveCount(3)

  // The second card is left out, from the keyboard: the choice lands on the first part.
  await first.getByRole('button', { name: 'Choose parts…' }).click()
  await expect(first.getByRole('checkbox', { name: 'Include Förslag 1' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(first.getByRole('checkbox', { name: 'Include Förslag 2' })).toBeFocused()
  await page.keyboard.press('Space')
  await expect(ghosts).toHaveCount(2)

  // The line under the proposal refines it now, and says that the proposal goes with it.
  const line = panel.getByRole('textbox', { name: 'Refine the proposal or ask something new' })
  await expect(line).toHaveAttribute('placeholder', 'Refine the proposal — “make them milder”, “fewer cards”…')
  await expect(panel.locator('.byd-ai-chip').first()).toHaveText('the proposal')
  await line.fill('Make them pricier [förfina]')
  await line.press('Enter')
  await expect(panel.getByText('Replaced by the refined proposal below.')).toBeVisible()
  const refined = panel.getByRole('group', { name: 'Proposal · 2 new cards' })
  await expect(refined.locator('.byd-ai-card-name')).toHaveText(['Förslag 1 (förfinat)', 'Förslag 3 (förfinat)'])
  // Each name is said whole, wrapping within its card's width (#1005): clipped, it read «Förslag 1 (fö…».
  for (const name of await refined.locator('.byd-ai-card-name > span').all()) {
    expect(await name.evaluate((el) => el.scrollWidth <= el.clientWidth && getComputedStyle(el).textOverflow !== 'ellipsis')).toBe(true)
    const [box, card] = [await name.boundingBox(), await name.locator('xpath=ancestor::li[1]').boundingBox()]
    expect(box!.x + box!.width).toBeLessThanOrEqual(card!.x + card!.width + 0.5)
  }
  // On the wall the refined proposal stands where the old one stood, whole.
  await expect(ghosts).toHaveCount(2)
  await expect(ghosts.nth(0)).toHaveAccessibleName('Proposal: Förslag 1 (förfinat)')
  await expect(ghosts.nth(1)).toHaveAccessibleName('Proposal: Förslag 3 (förfinat)')
  await expect(refined.getByRole('button', { name: 'Show on the wall' })).toHaveAttribute('aria-pressed', 'true')
  expect(edits()).toEqual([])

  // A second refine, stopped once its first card has come: the refined proposal stays waiting, on
  // the wall as it was.
  await line.fill('Even pricier [förfina] [sakta]')
  await line.press('Enter')
  await expect(panel.getByRole('group', { name: 'Proposal on its way · 1 new card' })).toBeVisible()
  await panel.getByRole('button', { name: 'Cancel' }).click()
  await expect(panel.getByText('Cancelled.')).toBeVisible()
  await expect(panel.getByRole('group', { name: /^Proposal on its way/ })).toHaveCount(0)
  await expect(panel.getByText('Replaced by the refined proposal below.')).toHaveCount(1)
  await expect(ghosts).toHaveCount(2)
  await expect(ghosts.nth(0)).toHaveAccessibleName('Proposal: Förslag 1 (förfinat)')
  await expect(line).toBeVisible()
  expect(edits()).toEqual([])

  // Accepted in one step, as the refined proposal, and taken back with one.
  await refined.getByRole('button', { name: 'Accept all' }).click()
  await expect(panel.getByText('Accepted: 2 new cards in the deck.')).toBeVisible()
  await expect(ghosts).toHaveCount(0)
  await expect(wall).toHaveCount(8)
  expect(edits()).toHaveLength(1)
  expect(edits()[0]!.intent.v).toBe('compound')
  expect(edits()[0]!.intent.edits!.map((e) => e.fields?.['title'])).toEqual(['Förslag 1 (förfinat)', 'Förslag 3 (förfinat)'])
  await page.getByRole('button', { name: 'Undo the accepted proposal' }).click()
  await expect(wall).toHaveCount(6)
  expect(edits()).toHaveLength(2)
  expect(edits()[1]!.intent.v).toBe('restore')
  expect(edits()[1]!.intent.doc!.rows).toHaveLength(6)
})
