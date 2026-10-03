import { logIn, makeProjectOf } from '../support/api.js'
import { gameDoc } from '../support/game.js'
import { DESK } from '../support/devices.js'
import { renderWorker } from '../support/render.js'
import { expect, test } from '../support/test.js'

// «Häfte för tryck» from the rulebook tab, through the real renderer (B7, #678). The speltest found
// three faults in the one control: the PDF was answered as image/png and opened as a broken
// picture, the link stood there before the file did and opened raw JSON, and after a change the
// link to the old book stayed. The worker runs beside the app as it does on the box, so the link
// is offered against a queue that takes real time.
test.use({ viewport: DESK.viewport, locale: 'sv-SE' })

test.describe('the booklet for print', () => {
  test.skip(process.env['BYD_E2E_STORE'] !== 'postgres', 'the renderer shares the Postgres queue; a memory run has none')
  let worker: { stop: () => Promise<void> } | null = null
  test.beforeAll(async () => {
    worker = await renderWorker()
  })
  test.afterAll(async () => {
    await worker?.stop()
  })

  test('is offered once the PDF is there, opens as a PDF under the game’s name, and is taken back by a change', async ({ page }) => {
    test.setTimeout(180_000)
    await logIn(page.request)
    const doc = gameDoc({ name: 'Skogens herrar', players: 2, cards: 4 }) as ReturnType<typeof gameDoc> & { rules?: unknown }
    doc.rules = { title: 'Skogens herrar', blocks: [{ kind: 'heading', id: 'h1', level: 1, text: 'Så spelar ni' }, { kind: 'text', id: 't1', text: 'Dra ett kort.' }] }
    const project = await makeProjectOf(page.request, doc)
    await page.goto(project.editorUrl)
    await page.getByRole('tab', { name: 'Regler' }).click()

    await page.getByRole('button', { name: 'Häfte för tryck' }).click()
    const link = page.getByRole('link', { name: 'Öppna häftet' })
    await expect(link).toBeVisible({ timeout: 120_000 })

    // The moment the link is there, the file behind it is: a press now opens the booklet.
    const href = (await link.getAttribute('href'))!
    const res = await page.request.get(href)
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toBe('application/pdf')
    expect(res.headers()['content-disposition']).toBe(`inline; filename="Skogens herrar - regler.pdf"; filename*=UTF-8''${encodeURIComponent('Skogens herrar – regler.pdf')}`)
    expect((await res.body()).subarray(0, 5).toString()).toBe('%PDF-')

    // A change to the book makes the link a link to another book, so the order comes back.
    await page.locator('[data-rulebook]').getByText('Dra ett kort.').click()
    await page.getByLabel('Text under Så spelar ni').fill('Dra två kort.')
    await expect(link).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Häfte för tryck' })).toBeVisible()
  })
})
