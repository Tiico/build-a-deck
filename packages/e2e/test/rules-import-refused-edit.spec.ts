import { expect, test } from '../support/test.js'
import { logIn, makeProject } from '../support/api.js'
import { DESK } from '../support/devices.js'

test.use({ viewport: DESK.viewport, locale: 'sv-SE' })

const BOOK = ['# Skogens herrar', '', '# Översikt', '', 'Två till fem spelare.', '', '# En tur', '', 'Dra ett kort.'].join('\n')
const markdown = (name: string, text: string) => ({ name, mimeType: 'text/markdown', buffer: Buffer.from(text) })

// An edit refused while an import's save is in the air, in the built app (#991). Bo types into a
// card in the moment Ada takes the card away: his edit leaves late, reaches the actor after her
// removal and is refused, and his import was asked for behind it. The refusal is the edit's. Read
// as the save's, the import said «Importen kunde inte sparas» about a version that was made, and
// the version lost the name that is the book's way back (B4).
//
// Every frame is the actor's own and arrives in the order it was sent. What the route does is make
// the order certain: Bo's requests leave late, and the actor's «saved» reaches him late.
test('an edit refused beside an import leaves the import its version and its name', async ({ page }) => {
  await logIn(page.request)
  const project = await makeProject(page.request, { name: 'Skogens herrar' })
  const asked: (() => void)[] = []
  const saved: (() => void)[] = []
  let holdingAsked = false
  let holdingSaved = true
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
      if (holdingSaved && said === 'saved') saved.push(() => ws.send(message))
      else ws.send(message)
    })
  })
  await page.goto(project.editorUrl)

  // Bo writes in the card. What he wrote has not reached the actor yet.
  const tab = page.locator('#byd-editor-tab-table')
  await tab.click()
  await expect(tab).toHaveAttribute('aria-selected', 'true')
  const cell = page.getByRole('textbox', { name: 'kort-1 title' })
  holdingAsked = true
  await cell.fill('Drakhona')
  await expect.poll(() => asked.length).toBeGreaterThan(0)

  // Ada takes the card away, with the same game open in a window of her own.
  const ada = await page.context().newPage()
  await ada.goto('/')
  await ada.evaluate(async (id) => {
    const line = new WebSocket(`${location.origin.replace(/^http/, 'ws')}/projects/${encodeURIComponent(id)}/edit?name=Ada`)
    await new Promise<void>((resolve, reject) => {
      line.onmessage = (event) => {
        const said = JSON.parse(String(event.data)) as { v: string }
        if (said.v === 'project') line.send(JSON.stringify({ t: 'edit', intent: { v: 'removeRow', cardRef: 'kort-1' } }))
        if (said.v === 'edits') resolve()
      }
      line.onclose = () => reject(new Error('Ada was not let in'))
    })
    line.close()
  }, project.id)
  await ada.close()
  // Bo has heard it: the card is gone from his table too.
  await expect(cell).toHaveCount(0)

  // And he imports the book, behind the edit that is still on its way.
  await page.getByRole('tab', { name: 'Regler' }).click()
  await page.getByLabel('Importera från fil').setInputFiles(markdown('regler.md', BOOK))
  await page.getByRole('region', { name: 'Vad importen gör med filen' }).getByRole('button', { name: 'Gör boken' }).click()
  await expect(page.locator('[data-rulebook]')).toContainText('En tur')

  holdingAsked = false
  for (const send of asked.splice(0)) send()
  // The edit is refused and the version is made; its answer is held until the refusal is in.
  await expect.poll(() => refusals).toBeGreaterThan(0)
  await expect.poll(() => saved.length).toBe(1)
  holdingSaved = false
  for (const deliver of saved.splice(0)) deliver()

  const versions = async () => (await (await page.request.get(`/projects/${encodeURIComponent(project.id)}/versions`)).json()) as { rev: number; label?: string }[]
  await expect.poll(async () => (await versions()).flatMap((v) => (v.label ? [v.label] : []))).toEqual(['Importerad: regler.md'])
  await expect(page.getByText('Importen kunde inte sparas')).toHaveCount(0)
  const rev = (await versions()).find((v) => v.label === 'Importerad: regler.md')?.rev
  const doc = (await (await page.request.get(`/projects/${encodeURIComponent(project.id)}/versions/${rev}`)).json()) as { rules?: { source?: { file?: string } } }
  expect(doc.rules?.source?.file).toBe('regler.md')
})
