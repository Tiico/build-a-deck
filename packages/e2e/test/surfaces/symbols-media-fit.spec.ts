import { expect, test, type Page } from '@playwright/test'
import { deflateSync } from 'node:zlib'
import type { ProjectDoc } from '../../../web/src/editor/types.js'
import { logIn, makeProjectOf } from '../../support/api.js'
import { gameDoc } from '../../support/game.js'

// Symboler and Media at the two desk widths L12 binds (#481, fynd 13, 14 och 16): the crop sheet
// holds a picture on six cards without scrolling, a meaning's row keeps its × beside its name, and
// every ink and every corner of the crop window is a 44 px target.
test.use({ locale: 'sv-SE' })

const WIDTHS = [
  [1280, 800],
  [1024, 768],
] as const

// A plain picture, made here rather than kept as a file: the size is what matters, not the look.
function png(w: number, h: number): Buffer {
  const crc = (buf: Buffer): number => {
    let c = ~0
    for (const byte of buf) {
      c ^= byte
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
    }
    return ~c >>> 0
  }
  const chunk = (type: string, data: Buffer): Buffer => {
    const head = Buffer.alloc(4)
    head.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const tail = Buffer.alloc(4)
    tail.writeUInt32BE(crc(body))
    return Buffer.concat([head, body, tail])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr.set([8, 2, 0, 0, 0], 8)
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 90)])
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: h }, () => row)))), chunk('IEND', Buffer.alloc(0))])
}

const hitOf = (page: Page, selector: string) =>
  page.$$eval(selector, (els) =>
    els.map((el) => {
      // The target is the element and whatever it draws around itself to be pressed.
      const box = el.getBoundingClientRect()
      const before = getComputedStyle(el, '::before')
      const grow = before.content !== 'none' && before.position === 'absolute' ? -parseFloat(before.left) || 0 : 0
      return { what: el.getAttribute('aria-label') ?? '', w: Math.round(box.width + 2 * grow), h: Math.round(box.height + 2 * grow) }
    }),
  )

for (const [width, height] of WIDTHS) {
  test(`the crop sheet holds six cards and its corners are 44 px targets at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await logIn(page.request)
    const up = await page.request.post('/assets', { headers: { 'content-type': 'image/png' }, data: png(600, 400) })
    const { hash } = (await up.json()) as { hash: string }
    const doc = gameDoc({ name: 'Skogens herrar', cards: 8 }) as unknown as ProjectDoc
    doc.template.faces['front']!.base.push({ kind: 'image', id: 'art', x: 4, y: 4, w: 55, h: 36, bind: { field: 'art' } } as never)
    for (const row of doc.rows.slice(0, 6)) row.fields['art'] = `asset:${hash}`
    doc.pictures = { [hash]: { name: 'skog.png' } }
    const project = await makeProjectOf(page.request, doc)
    await page.goto(project.editorUrl)
    await page.locator('#byd-editor-tab-media').click()
    await page.locator('.byd-media-tile').first().click()
    const sheet = page.getByRole('dialog')
    await expect(sheet.locator('.byd-media-crop-card')).toBeVisible()
    expect(await sheet.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(0)
    expect((await hitOf(page, '.byd-crop-corner')).filter(({ w, h }) => w < 44 || h < 44)).toEqual([])
  })

  test(`a meaning's row keeps its × beside its name, and every ink is a 44 px target at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    const doc = gameDoc({ name: 'Skogens herrar', cards: 6 }) as unknown as ProjectDoc
    doc.palette = { fara: '#8f2d20', 'lång-betydelse': '#1d4f8f' }
    await logIn(page.request)
    const project = await makeProjectOf(page.request, doc)
    await page.goto(project.editorUrl)
    await page.locator('#byd-editor-tab-symbols').click()
    await page.getByRole('button', { name: /Ta in sköld/ }).click()
    await expect(page.locator('.byd-symbols-set').getByText('{sköld}')).toBeVisible()
    const rows = await page.$$eval('.byd-symbols-colours li', (lis) =>
      lis.map((li) => {
        const name = li.querySelector('input')!.getBoundingClientRect()
        const x = li.querySelector(':scope > button')!.getBoundingClientRect()
        return { role: li.getAttribute('data-role'), sameLine: x.top < name.bottom && x.bottom > name.top }
      }),
    )
    expect(rows).toEqual([
      { role: 'fara', sameLine: true },
      { role: 'lång-betydelse', sameLine: true },
    ])
    expect((await hitOf(page, '.byd-symbols-inks button')).filter(({ w, h }) => w < 44 || h < 44)).toEqual([])
  })
}
