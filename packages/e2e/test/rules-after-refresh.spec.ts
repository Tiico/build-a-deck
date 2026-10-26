import { logIn, makeProject, makeProjectOf, startTable, withQuery } from '../support/api.js'
import { gameDoc } from '../support/game.js'
import { PHONE, TV } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// «Uppdatera» flyttar ett bord som spelar till projektets nuvarande rev (C7), och boken följer med
// (B7, #677). Speltestet 2026-10-02 skrev regler mitt i ett test, tryckte «Uppdatera» och fick
// «Spelet uppdaterades till rev-2» i SENAST — men ingen «Regler» på telefonen eller TV:n, och TV:ns
// rubrik stod kvar på rev-1. Servern läste versionen ur sessionens startrad, och skärmarna läste
// den en gång när de öppnades.
test('a table updated to a version with rules hands out the book and names the version, without a reload (#677)', async ({ request, open, player }) => {
  await logIn(request)
  const project = await makeProject(request, { name: 'Skogens herrar', players: 2 })
  const table = await startTable(request, project.id)
  const seats = gameDoc({ players: 2 }).setup.seats
  const tv = await open(TV, withQuery(table.tvUrl, 'lang=sv'))
  // The phone in a hand (C4): a computer's window draws the desk since #1310, with the book in its head.
  const ada = await player({ ...table, seats }, { name: 'Ada', seat: seats[0]!, device: PHONE })
  // And a computer at the same table, whose desk carries the book in its head (#1310).
  const bo = await player({ ...table, seats }, { name: 'Bo', seat: seats[1]! })
  await expect(bo.page.locator('.byd-desk')).toBeVisible()
  await expect(bo.page.getByRole('button', { name: 'Rules', exact: true })).toHaveCount(0)
  await expect(tv.page.getByRole('heading', { level: 1 })).toHaveText('Skogens herrar version 1')
  await expect(ada.page.locator('.byd-player > header')).toBeVisible()
  // On the phone the rules stand in «More» (#1147), which is open for both readings.
  await ada.page.getByRole('tab', { name: /^More/ }).click()
  await expect(ada.page.getByRole('button', { name: 'Rules', exact: true })).toHaveCount(0)
  await expect(tv.page.getByRole('button', { name: 'Regler', exact: true })).toHaveCount(0)

  const doc = gameDoc({ name: 'Skogens herrar', players: 2 }) as ReturnType<typeof gameDoc> & { rules?: unknown }
  doc.rules = { title: 'Skogens herrar', blocks: [{ kind: 'heading', id: 'h1', level: 1, text: 'Så spelar ni' }, { kind: 'text', id: 't1', text: 'Dra ett kort.' }] }
  const put = await request.put(`/projects/${encodeURIComponent(project.id)}`, { data: { rev: 1, ...doc } })
  expect(put.status()).toBe(200)
  expect((await request.post(`/sessions/${encodeURIComponent(table.session)}/refresh`)).status()).toBe(200)

  // The title changes with the line that says so, not after a reload.
  await expect(tv.page.getByText('Spelet uppdaterades till version 2').first()).toBeVisible()
  await expect(tv.page.getByRole('heading', { level: 1 })).toHaveText('Skogens herrar version 2')
  await tv.page.getByRole('button', { name: 'Regler', exact: true }).click()
  await expect(tv.page.locator('.byd-rules-panel').getByRole('heading', { name: 'Så spelar ni' })).toBeVisible()
  await expect(ada.page.getByRole('button', { name: 'Rules', exact: true })).toBeVisible()
  await expect(bo.page.locator('.byd-desk-head').getByRole('button', { name: 'Rules', exact: true })).toBeVisible()
})

// En högs egna åtgärder är versionens (K14), och «Uppdatera» flyttar bordet dit (C7). Beställaren
// skrev om en åtgärd på leken, tryckte «Uppdatera bordet» och fick den gamla åtgärden vid bordet
// tills det stängdes och öppnades igen: `version.change` bar korten men inte högarna, så bordet
// höll startversionens åtgärder.
test('a table updated to a version whose pile asks for something else offers the new action, without a reload', async ({ request, open }) => {
  await logIn(request)
  const withAction = (label: string, n: number) => {
    const doc = gameDoc({ name: 'Skogens herrar', players: 2 })
    const deal = { id: 'a1', label, steps: [{ v: 'deal' as const, each: { of: 'number' as const, n }, to: { at: 'hands' as const }, face: 'keep' as const }] }
    return { ...doc, setup: { ...doc.setup, zones: doc.setup.zones.map((z) => (z.id === doc.setup.deckZone ? { ...z, actions: [deal] } : z)) } }
  }
  const before = withAction('Dela ut två', 2)
  const project = await makeProjectOf(request, before)
  const table = await startTable(request, project.id)
  const tv = await open(TV, withQuery(table.tvUrl, 'lang=sv'))
  const pile = tv.page.locator(`.byd-pile[data-zone="${before.setup.deckZone}"]`)
  const action = tv.page.getByRole('button', { name: /^Dela ut/ })
  await pile.locator('.byd-pile-top').click()
  await expect(action).toHaveCount(1)
  await expect(action).toHaveAccessibleName(/^Dela ut två/)
  await tv.page.keyboard.press('Escape')

  const put = await request.put(`/projects/${encodeURIComponent(project.id)}`, { data: { rev: 1, ...withAction('Dela ut tre', 3) } })
  expect(put.status()).toBe(200)
  expect((await request.post(`/sessions/${encodeURIComponent(table.session)}/refresh`)).status()).toBe(200)

  await expect(tv.page.getByText('Spelet uppdaterades till version 2').first()).toBeVisible()
  await pile.locator('.byd-pile-top').click()
  await expect(action).toHaveCount(1)
  await expect(action).toHaveAccessibleName(/^Dela ut tre/)
})
