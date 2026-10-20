import { logIn, makeProject } from '../support/api.js'
import { DESK } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// A tab closed over unsaved work leaves that work in the project's actor (D3): the log carries
// the tail between saves, and the next editor is handed it. That editor used to take what it was
// handed for saved, so the header said «Saved» over a seat count the store had never held, and
// «Start a table» — which saves first only what is unsaved (L5) — started the table from the old
// version, four seats on the television while the editor said three (#764).
test.use({ viewport: DESK.viewport })

test('an editor opened on work nobody saved says so, and the table it starts has that work in it', async ({ page, context }) => {
  await logIn(page.request)
  const project = await makeProject(page.request, { name: 'Svansen', players: 4, cards: 4 })
  const seats = async () => {
    const got = (await (await context.request.get(`/projects/${encodeURIComponent(project.id)}`)).json()) as { rev: number; setup: { seats: unknown[] } }
    return { rev: got.rev, seats: got.setup.seats.length }
  }
  const stepper = (on: typeof page) => on.getByRole('spinbutton', { name: /Number of players/ })
  const bord = async (on: typeof page, players: string) => {
    await on.goto(project.editorUrl)
    await expect(on.getByText('Svansen').first()).toBeVisible()
    await on.locator('#byd-editor-tab-tables').click()
    await expect(stepper(on)).toHaveValue(players)
  }

  // A second tab on the same game, which is how it is known that the actor has the edit before
  // the first tab goes: it sees it land.
  const witness = await context.newPage()
  await bord(witness, '4')
  await bord(page, '4')
  await page.getByRole('button', { name: 'One player fewer' }).click()
  await expect(page.locator('.byd-editor-saved')).toHaveAttribute('data-unsaved', 'true')
  await expect(stepper(witness)).toHaveValue('3')
  await page.close()

  // The game opened again, in a fresh tab: three seats, and not saved.
  const again = await context.newPage()
  await bord(again, '3')
  await expect(again.locator('.byd-editor-saved')).toHaveAttribute('data-unsaved', 'true')
  expect(await seats()).toEqual({ rev: 1, seats: 4 })

  // Starting a table saves first, so the table has the seats the editor shows.
  const primary = again.locator('.byd-editor-primary:not(.byd-editor-caret)')
  await expect(primary).toHaveText('Start a table')
  await primary.click()
  await expect(primary).toHaveAccessibleName('Update the table')
  expect(await seats()).toEqual({ rev: 2, seats: 3 })
  const tables = (await (await again.request.get(`/projects/${encodeURIComponent(project.id)}/sessions`)).json()) as { version: string }[]
  expect(tables.map((t) => t.version)).toEqual(['rev-2'])
  await expect(again.locator('.byd-editor-saved')).toHaveAttribute('data-unsaved', 'false')
  await witness.close()
})
