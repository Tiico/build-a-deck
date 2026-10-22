import { expect, test } from '../support/test.js'

// The product has a face in the tab (#729): editor, TV and phone in three tabs looked alike behind the
// browser's blank globe, and a hand laid on the home screen got no icon. The face is Deckster's hand
// (#1082, beslut B 2026-10-21): three cards in amber, green and paper. Served by the built app the way
// the box serves it.
test('serves the icon in every form a browser asks for, and the page names it', async ({ page, request }) => {
  for (const [path, type] of [
    ['/favicon.svg', 'image/svg+xml'],
    ['/favicon.ico', 'image/x-icon'],
    ['/apple-touch-icon.png', 'image/png'],
    // The login mail's hand (#1098, L72), which a mail client fetches from the site.
    ['/mark-128.png', 'image/png'],
    ['/manifest.webmanifest', 'application/manifest+json'],
  ] as const) {
    const res = await request.get(path)
    expect({ path, status: res.status() }).toEqual({ path, status: 200 })
    expect({ path, type: res.headers()['content-type'] }).toEqual({ path, type })
  }
  await page.goto('/')
  const head = await page.evaluate(`(() => ({
    icon: [...document.querySelectorAll('link[rel~="icon"]')].map((l) => l.getAttribute('href')),
    touch: document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href'),
    manifest: document.querySelector('link[rel="manifest"]')?.getAttribute('href'),
    theme: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
    description: document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '',
  }))()`) as { icon: string[]; touch: string; manifest: string; theme: string; description: string }
  expect(head.icon).toEqual(expect.arrayContaining(['/favicon.svg', '/favicon.ico']))
  expect(head.touch).toBe('/apple-touch-icon.png')
  expect(head.manifest).toBe('/manifest.webmanifest')
  expect(head.theme).toBe('#14161c')
  expect(head.description.length).toBeGreaterThan(20)
})

// What the home screen and the tab are given is read pixel by pixel, as a browser decodes it: the
// three cards' colours are there, and the ground the PNGs stand on is the landing page's wood rather
// than #729's table dark. A PNG left over from an older mark fails here, whatever its name.
test('every icon a browser is given draws the hand: amber, green and paper', async ({ page }) => {
  await page.goto('/')
  for (const [path, size, ground] of [
    ['/favicon.ico', 32, 'none'],
    ['/mark-128.png', 128, 'none'],
    ['/apple-touch-icon.png', 180, 'wood'],
    ['/icon-192.png', 192, 'wood'],
    ['/icon-512.png', 512, 'wood'],
  ] as const) {
    const seen = (await page.evaluate(`(async () => {
      const img = new Image()
      img.src = ${JSON.stringify(path)}
      await img.decode()
      const c = document.createElement('canvas')
      c.width = img.naturalWidth
      c.height = img.naturalHeight
      const g = c.getContext('2d')
      g.drawImage(img, 0, 0)
      const px = g.getImageData(0, 0, c.width, c.height).data
      const near = (i, [r, gr, b]) => Math.abs(px[i] - r) + Math.abs(px[i + 1] - gr) + Math.abs(px[i + 2] - b) < 24 && px[i + 3] > 240
      const share = (rgb) => { let n = 0; for (let i = 0; i < px.length; i += 4) if (near(i, rgb)) n++; return n / (px.length / 4) }
      return {
        size: [c.width, c.height],
        amber: share([0xf0, 0xb6, 0x4a]), green: share([0x7d, 0xd3, 0xa0]), paper: share([0xf4, 0xea, 0xd8]),
        corner: [px[0], px[1], px[2], px[3]],
      }
    })()`)) as { size: [number, number]; amber: number; green: number; paper: number; corner: [number, number, number, number] }
    expect({ path, size: seen.size }).toEqual({ path, size: [size, size] })
    // Each card shows at least a fiftieth of the icon: the two behind show slivers, the paper card its face.
    for (const card of ['amber', 'green', 'paper'] as const) expect({ path, card, enough: seen[card] > 0.02 }).toEqual({ path, card, enough: true })
    if (ground === 'none') expect({ path, corner: seen.corner[3] }).toEqual({ path, corner: 0 })
    else {
      // The wood is a warm near-black: red over blue, and nowhere the table's #14161c.
      const [r, , b, a] = seen.corner
      expect({ path, wood: a === 255 && r >= b && r < 0x30 }).toEqual({ path, wood: true })
    }
  }
})
