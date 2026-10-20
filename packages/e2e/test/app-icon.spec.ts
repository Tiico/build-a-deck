import { expect, test } from '../support/test.js'

// The product has a face in the tab (#729, beslut A 2026-10-05): two cards fanned on the table's dark
// ground. Editor, TV and phone in three tabs looked alike behind the browser's blank globe, and a hand
// laid on the home screen got no icon. Served by the built app the way the box serves it.
test('serves the icon in every form a browser asks for, and the page names it', async ({ page, request }) => {
  for (const [path, type] of [
    ['/favicon.svg', 'image/svg+xml'],
    ['/favicon.ico', 'image/x-icon'],
    ['/apple-touch-icon.png', 'image/png'],
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
