// PROTOTYP #757 — kastas. Sidfoten med kontakt och version, och gästens mening; bara på prototypgrenen.
import { logIn, makeProject, makeTable } from '../support/api.js'
import { expect, test } from '../support/test.js'

test.use({ locale: 'sv-SE' })
const OUT = new URL('../../../docs/ux-audits/2026-10-07-sidfoten/prototyper/757/', import.meta.url).pathname
const CSS = `
  .proto-foot-a { margin: 20px 0 0; text-align: center; font-size: 12px; color: #8b93a7; }
  .proto-foot-a a, .proto-foot-b a { color: inherit; text-decoration: underline; text-underline-offset: 3px; }
  .proto-foot-b { position: fixed; left: 0; right: 0; bottom: 0; z-index: 5; display: flex; justify-content: center; gap: 16px; padding: 10px 16px; font-size: 12px; color: #8b93a7; background: #14161c; border-top: 1px solid #262a35; }
  .proto-guest { margin: 10px 0 0; font-size: 12px; line-height: 1.5; color: #9aa3b8; max-width: 36ch; }
`
const FOOT = (v: string) => `(() => { const f = document.createElement(${JSON.stringify(v === 'A' ? 'p' : 'footer')}); f.className = ${JSON.stringify(v === 'A' ? 'proto-foot-a' : 'proto-foot-b')}; f.innerHTML = '<a href="#">Kontakt</a> · build-your-deck 0.9.3'; ${v === 'A' ? `const host = document.querySelector('.byd-login') || document.querySelector('.byd-home'); host.append(f)` : 'document.body.append(f)'} })()`

for (const size of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`sidfoten ${size.width}`, async ({ page, browser }) => {
    test.setTimeout(240_000)
    await page.setViewportSize(size)
    for (const v of ['idag', 'A', 'B']) {
      await page.goto('/')
      await expect(page.locator('.byd-login')).toBeVisible()
      await page.addStyleTag({ content: CSS })
      if (v !== 'idag') await page.evaluate(FOOT(v))
      await page.waitForTimeout(200)
      await page.screenshot({ path: `${OUT}bilder/login-${v}-${size.width}.png` })
    }
    const ctx = await browser.newContext({ viewport: size, locale: 'sv-SE' })
    const home = await ctx.newPage()
    await logIn(home.request)
    await makeProject(home.request, { name: "Sal's Saloon", players: 4 })
    for (const v of ['idag', 'A', 'B']) {
      await home.goto('/')
      await expect(home.getByText("Sal's Saloon").first()).toBeVisible()
      await home.addStyleTag({ content: CSS })
      if (v !== 'idag') await home.evaluate(FOOT(v))
      await home.waitForTimeout(200)
      await home.screenshot({ path: `${OUT}bilder/hem-${v}-${size.width}.png`, fullPage: true })
    }
    await ctx.close()
  })
}

test('gästens mening på anslutningssidan', async ({ request, browser }) => {
  const table = await makeTable(request, { players: 4 })
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'sv-SE', hasTouch: true, isMobile: true })
  const phone = await ctx.newPage()
  for (const v of ['idag', 'mening']) {
    await phone.goto(`/join?code=${table.code}&lang=sv`)
    await expect(phone.getByLabel('Ditt namn')).toBeVisible()
    await phone.addStyleTag({ content: CSS })
    if (v === 'mening') await phone.evaluate(`(() => { const name = document.querySelector('input'); const p = document.createElement('p'); p.className = 'proto-guest'; p.textContent = 'Vi sparar ditt namn, platsens drag och dina enkätsvar — knutna till bordet, inte till dig.'; (name.closest('label') || name).after(p) })()`)
    await phone.waitForTimeout(200)
    await phone.screenshot({ path: `${OUT}bilder/join-${v}-390.png` })
  }
  await ctx.close()
})
