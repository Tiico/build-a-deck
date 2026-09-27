import type { ProjectDoc } from '../../web/src/editor/types.js'
import { logIn, makeProjectOf, type Table } from '../support/api.js'
import { PHONE } from '../support/devices.js'
import { gameDoc } from '../support/game.js'
import { expect, test } from '../support/test.js'

// The table ends while the rulebook is open on a phone (#483, fynd 2; G3, #83). The book is drawn
// at z-index 40 and the survey at 35, and `inert` does not change which of them is painted on top:
// the player saw the book, and the book took the presses the survey was waiting for.
test('puts the survey over an open rulebook when the table ends', async ({ request, player, host }) => {
  await logIn(request)
  const doc = gameDoc({ name: 'Skogens herrar', players: 2 }) as unknown as ProjectDoc
  doc.rules = { title: 'Skogens herrar', blocks: [{ kind: 'heading', id: 'h1', level: 1, text: 'Så spelar ni' }, { kind: 'text', id: 't1', text: 'Dra ett kort.' }] }
  const project = await makeProjectOf(request, doc)
  const res = await request.post(`/projects/${encodeURIComponent(project.id)}/sessions`)
  const started = (await res.json()) as { id: string; code: string; hostKey: string }
  const table: Table = {
    session: started.id,
    code: started.code,
    hostKey: started.hostKey,
    seats: doc.setup.seats,
    tableUrl: `/table?session=${encodeURIComponent(started.id)}&host=${encodeURIComponent(started.hostKey)}&mode=table`,
    tvUrl: `/table?session=${encodeURIComponent(started.id)}&host=${encodeURIComponent(started.hostKey)}&mode=tv`,
  }
  const ada = await player(table, { name: 'Ada', seat: doc.setup.seats[0]!, device: PHONE })
  await ada.page.getByRole('button', { name: 'Rules', exact: true }).click()
  await expect(ada.page.getByRole('dialog', { name: 'Rules' })).toBeVisible()

  const hosting = await host(table)
  await hosting.send([{ v: 'session.end' } as never])
  const survey = ada.page.locator('.byd-survey')
  await expect(survey).toBeVisible()
  // Read off the painted screen and not off hit-testing: the book lies inside the play view that
  // an ended table makes inert, and hit-testing passes through inert, so the survey took the presses
  // while the book was what the player saw. What is painted in the middle of the screen has to be
  // the survey's own ground.
  const ground = await survey.evaluate((el) => getComputedStyle(el).backgroundColor)
  const shot = (await ada.page.screenshot()).toString('base64')
  const painted = await ada.page.evaluate(async (png) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob())
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(bitmap, 0, 0)
    // The lower middle, where the survey has nothing of its own drawn but its ground.
    const [r, g, b] = ctx.getImageData(Math.round(bitmap.width / 2), Math.round(bitmap.height * 0.6), 1, 1).data
    return `rgb(${r}, ${g}, ${b})`
  }, shot)
  // Not vacuous: the book's paper is light and the survey's ground is not, so the two can be told apart.
  expect(ground).not.toBe('rgb(247, 243, 234)')
  expect(painted).toBe(ground)
})
