// PROTOTYP #706 — kastas. Bord-flikens rad: namnet och uppdateringen, tre former; bara på prototypgrenen.
import { logIn, makeProject, startTable } from '../support/api.js'
import { gameDoc } from '../support/game.js'
import { expect, test } from '../support/test.js'

test.use({ locale: 'sv-SE', viewport: { width: 1280, height: 800 } })
const OUT = new URL('../../../docs/ux-audits/2026-10-05-bordsraden/prototyper/706/', import.meta.url).pathname

const CSS = `
  .proto-code { font: 700 13px ui-monospace, monospace !important; letter-spacing: 1.5px; color: #e8eaf0 !important; }
  .proto-up { flex: 1 1 auto; min-height: 44px; border-radius: 8px; font: inherit; font-weight: 700; padding: 0 12px; }
  .proto-strip { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; margin: 0 -8px -8px; padding: 6px 8px 6px 12px; border-top: 1px solid #4a4230; border-radius: 0 0 12px 12px; background: #2a2618; color: #f0d68a; font-size: 12px; }
  .proto-strip span { flex: 1; }
  .proto-strip button { min-height: 32px; border-radius: 8px; font: inherit; font-weight: 700; padding: 0 12px; }
  .proto-who { color: #e8eaf0; font-weight: 700; font-size: 13px; }
  .proto-chip { font: 700 11px ui-monospace, monospace; letter-spacing: 1px; padding: 1px 6px; border-radius: 6px; background: #262b38; color: #e8eaf0; }
`

test('bordsraden', async ({ page, player }) => {
  test.setTimeout(240_000)
  await logIn(page.request)
  const doc = gameDoc({ name: "Sal's Saloon", players: 4 })
  const project = await makeProject(page.request, { name: "Sal's Saloon", players: 4 })
  const one = await startTable(page.request, project.id)
  const two = await startTable(page.request, project.id)
  await player({ ...one, seats: doc.setup.seats } as never, { name: 'Ada', seat: doc.setup.seats[0]! })
  const put = await page.request.put(`/projects/${encodeURIComponent(project.id)}`, { data: { rev: 1, ...doc, name: "Sal's Saloon", rules: { title: "Sal's Saloon", blocks: [{ kind: 'text', id: 't1', text: 'Dra ett kort.' }] } } })
  expect(put.status()).toBe(200)
  const codes: Record<string, string> = { [one.session]: one.code, [two.session]: two.code }

  for (const v of ['idag', 'A', 'B', 'C']) {
    await page.goto(project.editorUrl)
    await expect(page.getByText("Sal's Saloon").first()).toBeVisible()
    await page.locator('#byd-editor-tab-tables').click()
    if (v === 'idag') {
      await page.locator('.byd-tables-new').click()
      await expect(page.locator('.byd-tables-started')).toBeVisible()
    }
    await expect(page.locator('.byd-table-row').first()).toBeVisible()
    await expect(page.locator('.byd-tables-fold').first()).toBeVisible()
    for (const fold of await page.locator('.byd-tables-fold[aria-expanded="false"]').all()) await fold.click()
    await expect.poll(() => page.locator('.byd-table-row').count()).toBeGreaterThanOrEqual(3)
    await page.waitForTimeout(1500)
    await page.addStyleTag({ content: CSS })
    await page.evaluate(`(() => {
      const codes = ${JSON.stringify(codes)}
      const v = ${JSON.stringify(v)}
      for (const row of document.querySelectorAll('.byd-table-row')) {
        const band = (document.body.innerText.match(/rumskod ([A-Z0-9]{6})/) || [])[1]
        const code = codes[row.dataset.table] || band
        if (!code || v === 'idag') continue
        const head = row.querySelector('.byd-tables-head')
        const version = head.querySelector('strong')
        const stale = row.dataset.stale === 'true'
        const em = head.querySelector('.byd-tables-stale')
        const seated = row.querySelector('.byd-tables-line').textContent
        for (const l of row.querySelectorAll('.byd-tables-line')) l.textContent = l.textContent.replace('I dag', 'i dag')
        if (v === 'A') {
          const name = document.createElement('strong'); name.className = 'proto-code'; name.textContent = code
          head.prepend(name)
          version.style.fontWeight = '400'; version.style.color = 'inherit'
          if (stale) {
            em.textContent = 'rev-1, spelet är på rev-2'
            const up = document.createElement('button'); up.className = 'byd-secondary proto-up'; up.textContent = 'Uppdatera till rev-2'
            row.querySelector('.byd-tables-go').prepend(up)
          }
        }
        if (v === 'B') {
          const name = document.createElement('span'); name.className = 'proto-who'
          name.textContent = /Ada/.test(seated) ? 'Adas bord' : 'Bord ' + code
          head.prepend(name)
          if (stale) {
            em.remove()
            const strip = document.createElement('div'); strip.className = 'proto-strip'
            strip.innerHTML = '<span>Kör rev-1 — spelet är på rev-2.</span><button class="byd-secondary">Uppdatera</button>'
            row.append(strip)
          }
        }
        if (v === 'C') {
          const chip = document.createElement('span'); chip.className = 'proto-chip'; chip.textContent = code
          head.prepend(chip)
        }
      }
      const said = document.querySelector('.byd-tables-started')
      if (said) said.textContent = said.textContent.replace(/[0-9a-f]{8}/, 'nytt rumskod')
    })()`)
    if (v === 'C') {
      const row = page.locator(`.byd-table-row[data-table="${one.session}"]`)
      await row.locator('.byd-tables-more').click()
      await page.evaluate(`(() => {
        const menu = document.querySelector('.byd-tables-menu')
        const first = menu.firstElementChild
        const up = first.cloneNode(true); up.textContent = 'Uppdatera till rev-2'; up.removeAttribute('href'); up.style.fontWeight = '700'
        const hr = document.createElement('hr'); hr.className = 'byd-tables-cut'
        menu.prepend(up, hr)
        for (const a of menu.querySelectorAll('.byd-tables-way')) a.textContent = a.textContent.replace(/ [0-9a-f]{8}$/, '')
      })()`)
    }
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${OUT}bilder/${v}.png` })
  }
})
