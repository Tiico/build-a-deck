import { expect, test } from '../support/test.js'
import { logIn, makeProject } from '../support/api.js'
import { DESK } from '../support/devices.js'

test.use({ viewport: DESK.viewport, locale: 'sv-SE' })

// A save pressed behind a column the actor refuses, in the built app (#994). Bo names a column
// «Kraft» and presses «Spara» at once, in the moment Ada names it «kraft» from a window of her own
// and saves. Her edit reaches the actor first, so Bo's column is refused (#694, #993), and his save
// makes a version of what the actor holds: Ada's. The editor took what it held as the save left for
// the saved document, refused column included, so once the column was taken off again Bo held
// exactly the version and the header still said «Osparat».
//
// Every frame is the actor's own and arrives in the order it was sent. What the route does is make
// the order certain: Bo's requests leave late.
test('a save sent behind a refused column says «Sparat» over the version it made', async ({ page }) => {
  await logIn(page.request)
  const project = await makeProject(page.request, { name: 'Skogens herrar' })
  const asked: (() => void)[] = []
  let holdingAsked = false
  const heard: string[] = []
  await page.routeWebSocket('**/projects/**/edit**', (ws) => {
    const server = ws.connectToServer()
    ws.onMessage((message) => {
      if (holdingAsked) asked.push(() => server.send(message))
      else server.send(message)
    })
    server.onMessage((message) => {
      const said = typeof message === 'string' ? (JSON.parse(message) as { v?: string }).v : undefined
      if (said) heard.push(said)
      ws.send(message)
    })
  })
  await page.goto(project.editorUrl)
  const tab = page.locator('#byd-editor-tab-table')
  await tab.click()
  await expect(tab).toHaveAttribute('aria-selected', 'true')
  const column = (name: string) => page.getByRole('button', { name: new RegExp(`^${name}[\\s↕↑↓×]*$`) })
  const status = page.locator('.byd-editor-saved-word')

  // Bo makes the column and saves it. Neither has reached the actor yet.
  holdingAsked = true
  await page.getByRole('button', { name: 'Kolumner' }).click()
  const form = page.getByRole('form', { name: 'Nytt fält' })
  await form.getByLabel('Namn').fill('Kraft')
  await form.getByRole('button', { name: 'Lägg till' }).click()
  await expect(column('Kraft')).toBeVisible()
  await expect(status).toHaveText('Osparat')
  await page.locator('.byd-editor-save').click()
  await expect.poll(() => asked.length).toBe(2)

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
  await expect(column('kraft')).toBeVisible()

  // Bo's column and save leave. The column is refused, and the save is answered after it.
  holdingAsked = false
  for (const send of asked.splice(0)) send()
  await expect.poll(() => heard.filter((v) => v === 'saved').length).toBe(2)
  expect(heard.slice(heard.indexOf('refused'))).toEqual(expect.arrayContaining(['refused', 'project', 'saved']))

  await expect(column('Kraft')).toHaveCount(0)
  await expect(column('kraft')).toBeVisible()
  // What Bo holds is the version his save made, so nothing of his is unsaved.
  await expect(status).toHaveText('Sparat')
  await expect(page.locator('.byd-editor-save')).toHaveAttribute('aria-disabled', 'true')
  // And the column did not go without a word (#996): the save was answered after the refusal, and
  // a save puts away only what stood when it was pressed.
  await expect(page.getByRole('alert').filter({ hasText: 'En ändring gick inte att göra och har tagits bort.' })).toHaveText('En ändring gick inte att göra och har tagits bort. Försök igen, eller gör ändringen på ett annat sätt.')
})
