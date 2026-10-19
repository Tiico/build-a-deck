import { expect, test } from '../support/test.js'
import { logIn, makeProject } from '../support/api.js'
import { DESK } from '../support/devices.js'

test.use({ viewport: DESK.viewport, locale: 'sv-SE' })

const WRITTEN = ['# Skogens herrar', '', '# Översikt', '', 'Två till fem spelare.', '', '# Fusk och straff', '', 'Den som blir påkommen lägger tillbaka handen.'].join('\n')
const FILE = ['# Skogens herrar', '', '# Översikt', '', 'Två till sex spelare.', '', '# Två spelare', '', 'Fyra kort läggs åt sidan.'].join('\n')
const markdown = (name: string, text: string) => ({ name, mimeType: 'text/markdown', buffer: Buffer.from(text) })

// Two imports in the built app, the second pressed before the first was answered (#988). The
// actor's «saved» is held on its way to the page, so the version is made and only the word is late
// — the order a busy machine falls into by accident. Every frame is the actor's own and arrives in
// the order it was sent. Each import has to name the version that holds its own book, or the book
// she wrote by hand has lost its name in the history, which is its only way back (B4).
test('two imports, the second pressed before the first is answered, keep both named versions', async ({ page }) => {
  await logIn(page.request)
  const project = await makeProject(page.request, { name: 'Skogens herrar' })
  const held: (() => void)[] = []
  let holding = true
  await page.routeWebSocket('**/projects/**/edit**', (ws) => {
    const server = ws.connectToServer()
    server.onMessage((message) => {
      const said = typeof message === 'string' ? (JSON.parse(message) as { v?: string }).v : undefined
      if (holding && said === 'saved') held.push(() => ws.send(message))
      else ws.send(message)
    })
  })
  await page.goto(project.editorUrl)
  await page.getByRole('tab', { name: 'Regler' }).click()

  await page.getByLabel('Importera från fil').setInputFiles(markdown('skrivet.md', WRITTEN))
  await page.getByRole('region', { name: 'Vad importen gör med filen' }).getByRole('button', { name: 'Gör boken' }).click()
  await expect(page.locator('[data-rulebook]')).toContainText('Fusk och straff')
  // The first version is made, and its answer is at the door.
  await expect.poll(() => held.length).toBe(1)

  await page.getByLabel('Importera samma fil igen: skrivet.md').setInputFiles(markdown('regler-v4.md', FILE))
  await page.getByRole('region', { name: 'Vad importen gör med boken du har' }).getByRole('button', { name: 'Gör boken' }).click()
  holding = false
  for (const deliver of held.splice(0)) deliver()

  const versions = async () => (await (await page.request.get(`/projects/${encodeURIComponent(project.id)}/versions`)).json()) as { rev: number; label?: string }[]
  await expect.poll(async () => (await versions()).flatMap((v) => (v.label ? [v.label] : []))).toEqual(['Importerad: regler-v4.md', 'Importerad: skrivet.md'])
  const fileOf = async (label: string) => {
    const rev = (await versions()).find((v) => v.label === label)?.rev
    const doc = (await (await page.request.get(`/projects/${encodeURIComponent(project.id)}/versions/${rev}`)).json()) as { rules?: { source?: { file?: string } } }
    return doc.rules?.source?.file
  }
  expect({ first: await fileOf('Importerad: skrivet.md'), second: await fileOf('Importerad: regler-v4.md') }).toEqual({ first: 'skrivet.md', second: 'regler-v4.md' })
})
