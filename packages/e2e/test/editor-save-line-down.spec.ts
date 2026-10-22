import { expect, test } from '../support/test.js'
import { logIn, makeProject } from '../support/api.js'
import { DESK } from '../support/devices.js'

test.use({ viewport: DESK.viewport, locale: 'sv-SE' })

// A save the line takes with it, in the built app (#1018). The designer presses «Spara» and the
// wifi goes in the same moment: the save is answered over that line or not at all. The editor said
// «Bordet tog inte emot draget. Försök igen om en stund.» under the button — the felt's sentence
// about a move, and nothing about her work or whether «Spara» was safe to press again.
//
// The route lets every frame through until the page asks for a version, and then breaks the line
// the way a network that drops does, with no close frame. The line that comes back is let alone.
test('a save the line goes under says so in the editor’s words, and the next save goes through', async ({ page }) => {
  await logIn(page.request)
  const project = await makeProject(page.request, { name: 'Skogens herrar' })
  let broken = false
  await page.routeWebSocket('**/projects/**/edit**', (ws) => {
    const server = ws.connectToServer()
    ws.onMessage((message) => {
      const asked = typeof message === 'string' ? (JSON.parse(message) as { t?: string }).t : undefined
      if (asked === 'save' && !broken) {
        broken = true
        void ws.close({ code: 1006 })
        return
      }
      server.send(message)
    })
  })
  await page.goto(project.editorUrl)
  const tab = page.locator('#byd-editor-tab-table')
  await tab.click()
  await expect(tab).toHaveAttribute('aria-selected', 'true')
  const status = page.locator('.byd-editor-saved-word')
  await page.getByRole('button', { name: 'Kolumner' }).click()
  const form = page.getByRole('form', { name: 'Nytt fält' })
  await form.getByLabel('Namn').fill('Kraft')
  await form.getByRole('button', { name: 'Lägg till' }).click()
  await expect(status).toHaveText('Osparat')

  await page.locator('.byd-editor-save').click()

  const notice = page.locator('.byd-editor-notice')
  await expect(notice).toHaveText('Servern svarade inte, så det gick inte att spara. Dina ändringar finns kvar här, så försök igen.')
  await expect(notice).not.toContainText('Bordet')
  await expect(status).toHaveText('Osparat')

  // And it is: once the line is back, the same press makes the version, and the news goes with it.
  await expect(page.locator('.byd-editor-save')).toHaveAttribute('aria-disabled', 'false')
  await page.locator('.byd-editor-save').click()
  await expect(status).toHaveText('Sparat')
  await expect(notice).toHaveCount(0)
})
