// Writes the product's icons in `public/` from the one drawing of the mark (`src/brand/mark.ts`,
// #1082): the tab's favicon.svg and favicon.ico, and the PNGs the home screens are given.
//
// Run by hand after the mark changes: `pnpm --filter @byd/web exec tsx scripts/brand-icons.ts`.
// `test/brand.test.ts` says so when favicon.svg is not the drawing, and the e2e suite reads the
// served PNGs' pixels.
//
// The PNGs are drawn by Chromium, which is already how the repo draws anything (Playwright is the
// browser tests' own), so an icon is what a browser makes of the SVG and nothing else.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { appIconSvg, faviconSvg } from '../src/brand/mark.js'

const PUBLIC = join(import.meta.dirname, '..', 'public')

// An .ico is a directory of images; one 32 px PNG in it is what every browser that still asks for
// /favicon.ico wants.
function ico(png: Buffer): Buffer {
  const head = Buffer.alloc(22)
  head.writeUInt16LE(0, 0) // reserved
  head.writeUInt16LE(1, 2) // an icon
  head.writeUInt16LE(1, 4) // one image
  head.writeUInt8(32, 6) // width
  head.writeUInt8(32, 7) // height
  head.writeUInt8(0, 8) // no palette
  head.writeUInt8(0, 9) // reserved
  head.writeUInt16LE(1, 10) // colour planes
  head.writeUInt16LE(32, 12) // bits per pixel
  head.writeUInt32LE(png.length, 14)
  head.writeUInt32LE(22, 18) // where the image starts
  return Buffer.concat([head, png])
}

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 })
  const draw = async (svg: string, size: number): Promise<Buffer> => {
    await page.setViewportSize({ width: size, height: size })
    await page.setContent(`<html><body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="${size}" height="${size}" style="display:block"></body></html>`)
    await page.locator('img').evaluate((img: HTMLImageElement) => img.decode())
    return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } })
  }
  const favicon = faviconSvg()
  writeFileSync(join(PUBLIC, 'favicon.svg'), favicon)
  writeFileSync(join(PUBLIC, 'favicon.ico'), ico(await draw(favicon, 32)))
  // The login mail's hand (#1098): the tab's free hand at 128 px, shown at 64 in the wood band.
  writeFileSync(join(PUBLIC, 'mark-128.png'), await draw(favicon, 128))
  const app = appIconSvg()
  for (const [file, size] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]] as const) {
    writeFileSync(join(PUBLIC, file), await draw(app, size))
  }
} finally {
  await browser.close()
}
