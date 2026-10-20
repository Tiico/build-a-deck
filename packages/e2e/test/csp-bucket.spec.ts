import { deflateSync } from 'node:zlib'
import { expect, test } from '../support/test.js'
import type { ProjectDoc } from '../../web/src/editor/types.js'
import { logIn, makeProjectOf } from '../support/api.js'
import { DESK } from '../support/devices.js'
import { gameDoc } from '../support/game.js'

// A picture shown the way the box shows it (#1008, DRIFT §4 and §14): the editor asks the app for
// `/assets/<hash>`, the app answers with a redirect to the object store on an origin of its own,
// and the page's policy has to let the picture be fetched from there. Without an object store the
// app serves the bytes itself and every policy that names only `'self'` is green — which is why
// the stack runs with one (`support/objects.ts`), and why this asks the wire that the picture
// really came from it rather than taking the stack's word for it.
//
// The policy's own refusals are watched by the suite's `test` (`support/csp.ts`); what this adds
// is that the path it would have refused was walked at all.
test.use({ viewport: DESK.viewport })

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
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 120)])
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: h }, () => row)))), chunk('IEND', Buffer.alloc(0))])
}

test('a picture redirected to the object store is fetched from there and drawn under the policy', async ({ page, baseURL }) => {
  test.skip(process.env['BYD_E2E_STORE'] !== 'postgres', 'the object store holds pictures only beside Postgres; a memory run keeps them in the process')
  const bucket = process.env['R2_ENDPOINT']
  expect(bucket, 'the stack runs without an object store').toBeTruthy()
  expect(new URL(bucket ?? '').origin).not.toBe(new URL(baseURL ?? '').origin)

  await logIn(page.request)
  const up = await page.request.post('/assets', { headers: { 'content-type': 'image/png' }, data: png(300, 200) })
  const { hash } = (await up.json()) as { hash: string }
  const doc = gameDoc({ name: 'Skogens herrar', cards: 3 }) as unknown as ProjectDoc
  doc.template.faces['front']!.base.push({ kind: 'image', id: 'art', x: 4, y: 4, w: 55, h: 36, bind: { field: 'art' } } as never)
  for (const row of doc.rows) row.fields['art'] = `asset:${hash}`
  doc.pictures = { [hash]: { name: 'skog.png' } }
  const project = await makeProjectOf(page.request, doc)

  const fromBucket = page.waitForResponse((res) => res.url().startsWith(`${bucket}/`) && res.url().includes(hash) && res.status() === 200)
  await page.goto(project.editorUrl)
  await page.locator('#byd-editor-tab-template').click()
  await fromBucket
  const picture = page.locator(`img[src$="/assets/${hash}"]`).first()
  await expect(picture).toBeAttached()
  await expect.poll(() => picture.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(300)
})
