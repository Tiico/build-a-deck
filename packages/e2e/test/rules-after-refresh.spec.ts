import { logIn, makeProject, startTable } from '../support/api.js'
import { gameDoc } from '../support/game.js'
import { TV } from '../support/devices.js'
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
  const tv = await open(TV, `${table.tvUrl}&lang=sv`)
  const ada = await player({ ...table, seats }, { name: 'Ada', seat: seats[0]! })
  await expect(tv.page.getByRole('heading', { level: 1 })).toHaveText('Skogens herrar rev-1')
  await expect(ada.page.locator('.byd-player > header')).toBeVisible()
  await expect(ada.page.getByRole('button', { name: 'Rules', exact: true })).toHaveCount(0)
  await expect(tv.page.getByRole('button', { name: 'Regler', exact: true })).toHaveCount(0)

  const doc = gameDoc({ name: 'Skogens herrar', players: 2 }) as ReturnType<typeof gameDoc> & { rules?: unknown }
  doc.rules = { title: 'Skogens herrar', blocks: [{ kind: 'heading', id: 'h1', level: 1, text: 'Så spelar ni' }, { kind: 'text', id: 't1', text: 'Dra ett kort.' }] }
  const put = await request.put(`/projects/${encodeURIComponent(project.id)}`, { data: { rev: 1, ...doc } })
  expect(put.status()).toBe(200)
  expect((await request.post(`/sessions/${encodeURIComponent(table.session)}/refresh`)).status()).toBe(200)

  // The title changes with the line that says so, not after a reload.
  await expect(tv.page.getByText('Spelet uppdaterades till rev-2').first()).toBeVisible()
  await expect(tv.page.getByRole('heading', { level: 1 })).toHaveText('Skogens herrar rev-2')
  await tv.page.getByRole('button', { name: 'Regler', exact: true }).click()
  await expect(tv.page.locator('.byd-rules-panel').getByRole('heading', { name: 'Så spelar ni' })).toBeVisible()
  await expect(ada.page.getByRole('button', { name: 'Rules', exact: true })).toBeVisible()
})
