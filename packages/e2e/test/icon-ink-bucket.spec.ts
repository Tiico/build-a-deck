import { expect, test } from '../support/test.js'
import type { ProjectDoc } from '../../web/src/editor/types.js'
import { logIn, makeProjectOf } from '../support/api.js'
import { DESK } from '../support/devices.js'
import { gameDoc } from '../support/game.js'

// A coloured icon as the box shows it (#1087). The compiler draws one as a block of colour cut out
// by the file — a CSS mask — and a mask is fetched in CORS mode, unlike an `<img>`. On the box
// `/assets/<hash>` answers with a redirect to the object store, whose answer carries no
// `access-control-allow-origin`, so the mask failed to load and a failed mask hides everything:
// the icon went transparent the moment it was given a colour. Without an object store the app
// serves the bytes itself and the icon is drawn, which is why only a stack with one can say it.
test.use({ viewport: DESK.viewport })

const STAR = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>'

test('an icon given a colour is drawn in it when its file comes from the object store', async ({ page }) => {
  test.skip(process.env['BYD_E2E_STORE'] !== 'postgres', 'the object store holds pictures only beside Postgres; a memory run keeps them in the process')
  expect(process.env['R2_ENDPOINT'], 'the stack runs without an object store').toBeTruthy()

  await logIn(page.request)
  const up = await page.request.post('/assets', { headers: { 'content-type': 'image/svg+xml' }, data: Buffer.from(STAR) })
  expect(up.ok(), await up.text()).toBe(true)
  const { hash } = (await up.json()) as { hash: string }
  const doc = gameDoc({ name: 'Röda stjärnor', cards: 1 }) as unknown as ProjectDoc
  doc.icons = { stjarna: `asset:${hash}` }
  doc.template.faces['front']!.base.push({ kind: 'icons', id: 'ikoner', x: 5, y: 60, w: 53, h: 20, bind: { literal: 'stjarna' }, iconMm: 16, color: '#d00000' } as never)
  const project = await makeProjectOf(page.request, doc)

  await page.goto(project.editorUrl)
  await page.locator('#byd-editor-tab-template').click()
  const icon = page.locator('[data-element="ikoner"] .byd-ink').first()
  await expect(icon).toBeVisible()

  // What is painted, not what is declared: the declaration is the same whether the mask loaded.
  await expect
    .poll(async () => {
      const shot = await icon.screenshot()
      return page.evaluate(async (png) => {
        const img = new Image()
        img.src = `data:image/png;base64,${png}`
        await img.decode()
        const canvas = new OffscreenCanvas(img.width, img.height)
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0)
        const px = ctx.getImageData(0, 0, img.width, img.height).data
        let red = 0
        for (let i = 0; i < px.length; i += 4) if (px[i]! > 180 && px[i + 1]! < 60 && px[i + 2]! < 60) red++
        return red / (img.width * img.height)
      }, shot.toString('base64'))
    })
    .toBeGreaterThan(0.5)
})
