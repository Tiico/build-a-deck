import '../../../test-support/playwright-browsers.js'
import { chromium } from '@playwright/test'

/**
 * A photograph for a board's print (#1533): a JPEG at a print's pixels and close to the upload
 * limit, with the soft shapes and the grain of a photo, so that neither the file nor what Chromium
 * decodes of it is lighter than a designer's own picture would be.
 *
 * A PNG of the load deck's kind (`picture`) cannot be both: at 7276 × 5469 px a PNG that does not
 * compress is ~120 MB, far past the limit, and one that does is flat colour. A photo is a JPEG, so
 * it is drawn and encoded by the browser the tests already have, at the highest quality that fits.
 */
export async function photo(seed: number, size: { width: number; height: number; maxBytes: number }): Promise<Uint8Array> {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    // A string and not a function: tsx names every function it compiles with a helper the page
    // does not have, so a compiled function cannot be handed to `evaluate`.
    const b64 = (await page.evaluate(`(${DRAW})(${JSON.stringify({ seed, ...size })})`)) as string
    return new Uint8Array(Buffer.from(b64, 'base64'))
  } finally {
    await browser.close()
  }
}

const DRAW = `async ({ seed, width, height, maxBytes }) => {
  let a = seed >>> 0
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  const sky = ctx.createLinearGradient(0, 0, 0, height)
  sky.addColorStop(0, '#6d8fb8')
  sky.addColorStop(1, '#4a6b3a')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, width, height)
  for (let i = 0; i < 600; i++) {
    const x = rand() * width
    const y = rand() * height
    const r = 40 + rand() * 900
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, 'rgba(' + Math.floor(rand() * 255) + ',' + Math.floor(rand() * 255) + ',' + Math.floor(rand() * 255) + ',0.55)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
  // The grain, in bands so that no one ImageData is the whole picture.
  for (let y = 0; y < height; y += 256) {
    const h = Math.min(256, height - y)
    const data = ctx.getImageData(0, y, width, h)
    const px = data.data
    for (let i = 0; i < px.length; i += 4) {
      const n = (rand() - 0.5) * 36
      px[i] += n
      px[i + 1] += n
      px[i + 2] += n
    }
    ctx.putImageData(data, 0, y)
  }
  for (let quality = 0.95; quality > 0.3; quality -= 0.05) {
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality })
    if (blob.size <= maxBytes) {
      const bytes = new Uint8Array(await blob.arrayBuffer())
      let s = ''
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
      return btoa(s)
    }
  }
  throw new Error('no quality brings ' + width + ' × ' + height + ' under ' + maxBytes + ' bytes')
}`
