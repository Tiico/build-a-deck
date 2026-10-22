import { expect, test } from '../support/test.js'
import { logIn, makeProject } from '../support/api.js'
import { DESK } from '../support/devices.js'

test.use({ viewport: DESK.viewport, locale: 'sv-SE' })

// A column the actor refuses, in the built app (#993). Bo names a column «Kraft» in the moment Ada
// names it «kraft» from a window of her own. Her edit reaches the actor first, and the actor folds a
// name that differs only in its capitals into the column it has (#694), so Bo's is refused. Kept in
// his editor, Bo's column stood beside Ada's under an «Osparat» no save could take away, and nothing
// said the column he made had not been taken.
//
// Every frame is the actor's own and arrives in the order it was sent. What the route does is make
// the order certain: Bo's requests leave late.
test('a column refused because a colleague named it first is taken off the editor, and that is said', async ({ page }) => {
  await logIn(page.request)
  const project = await makeProject(page.request, { name: 'Skogens herrar' })
  const asked: (() => void)[] = []
  let holdingAsked = false
  let refusals = 0
  await page.routeWebSocket('**/projects/**/edit**', (ws) => {
    const server = ws.connectToServer()
    ws.onMessage((message) => {
      if (holdingAsked) asked.push(() => server.send(message))
      else server.send(message)
    })
    server.onMessage((message) => {
      const said = typeof message === 'string' ? (JSON.parse(message) as { v?: string }).v : undefined
      if (said === 'refused') refusals += 1
      ws.send(message)
    })
  })
  await page.goto(project.editorUrl)
  const tab = page.locator('#byd-editor-tab-table')
  await tab.click()
  await expect(tab).toHaveAttribute('aria-selected', 'true')
  const column = (name: string) => page.getByRole('button', { name: new RegExp(`^${name}[\\s↕↑↓×]*$`) })

  // Bo makes the column. It is on his table at once, and has not reached the actor yet.
  holdingAsked = true
  await page.getByRole('button', { name: 'Kolumner' }).click()
  const form = page.getByRole('form', { name: 'Nytt fält' })
  await form.getByLabel('Namn').fill('Kraft')
  await form.getByRole('button', { name: 'Lägg till' }).click()
  await expect(column('Kraft')).toBeVisible()
  await expect.poll(() => asked.length).toBeGreaterThan(0)

  // Ada names the same column with other capitals, and saves it.
  const ada = await page.context().newPage()
  await ada.goto('/')
  await ada.evaluate(async (id) => {
    const line = new WebSocket(`${location.origin.replace(/^http/, 'ws')}/projects/${encodeURIComponent(id)}/edit?name=Ada`)
    await new Promise<void>((resolve, reject) => {
      line.onmessage = (event) => {
        const said = JSON.parse(String(event.data)) as { v: string }
        if (said.v === 'project') {
          line.send(JSON.stringify({ t: 'edit', intent: { v: 'addField', field: 'kraft' } }))
          line.send(JSON.stringify({ t: 'save' }))
        }
        if (said.v === 'saved') resolve()
      }
      line.onclose = () => reject(new Error('Ada was not let in'))
    })
    line.close()
  }, project.id)
  await ada.close()
  // Bo has heard it: both columns stand on his table while his own is still on its way.
  await expect(column('kraft')).toBeVisible()

  holdingAsked = false
  for (const send of asked.splice(0)) send()
  await expect.poll(() => refusals).toBe(1)

  await expect(page.getByRole('alert').filter({ hasText: 'En ändring' })).toHaveText('En ändring gick inte att göra och har tagits bort. Spelet visar nu samma sak för alla.')
  await expect(column('Kraft')).toHaveCount(0)
  await expect(column('kraft')).toBeVisible()
  // What Bo holds is Ada's saved version, so nothing of his is unsaved.
  await expect(page.locator('.byd-editor-saved-word')).toHaveText('Sparat')
})
