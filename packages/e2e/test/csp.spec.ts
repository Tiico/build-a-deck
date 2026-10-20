import { expect, test } from '../support/test.js'
import { DESK } from '../support/devices.js'

// The page's Content-Security-Policy (#1008, DRIFT §14), on the built app as the box serves it.
//
// What an attacker who got markup into the page would do with it is load a script of their own,
// or write one into an attribute. Both are tried here the way an injection would try them — an
// element put into the live document — and both have to be refused by the browser, not merely
// left unfetched by chance. The foreign address answers with a script that would mark the page if
// it ever ran, so a policy that let it through fails this test rather than passing it quietly.
test.use({ viewport: DESK.viewport })

const EVIL = 'https://evil.example'

test('a script injected from another origin is refused, and so is one written into an attribute', async ({ page, csp }) => {
  let fetched = false
  await page.route(`${EVIL}/**`, (route) => {
    fetched = true
    return route.fulfill({ contentType: 'text/javascript', body: 'window.__pwned = "external"' })
  })
  const res = await page.goto('/')
  expect(res?.headers()['content-security-policy'], 'the page came without its policy').toBeTruthy()
  await expect(page.locator('#root')).not.toBeEmpty()

  await page.evaluate((evil) => {
    const script = document.createElement('script')
    script.src = `${evil}/steal.js`
    document.head.append(script)
    const holder = document.createElement('div')
    holder.innerHTML = '<img src="/nothing-here.png" onerror="window.__pwned = \'inline\'">'
    document.body.append(holder)
  }, EVIL)

  await expect.poll(() => csp.take((v) => v.directive === 'script-src-elem' && v.blocked.startsWith(EVIL)).length).toBe(1)
  await expect.poll(() => csp.take((v) => v.directive === 'script-src-attr').length).toBe(1)
  // The console says the same two refusals; they are the ones this test caused.
  csp.take((v) => v.directive === 'console' && (v.blocked.includes(EVIL) || v.blocked.includes('inline event handler')))
  expect(await page.evaluate(() => (window as unknown as { __pwned?: string }).__pwned)).toBeUndefined()
  expect(fetched, 'the browser asked the foreign origin for the script').toBe(false)
})

// The edge in front of the box writes a script of its own into every page it passes on (#1043,
// DRIFT §14): Cloudflare's JavaScript Detections, inline, with different bytes on every request,
// so no hash in the build can let it through. What Cloudflare does instead is read the nonce off
// the response's policy header and put it on the script it adds. The edge is played here the way
// it behaves: the page as the box sent it, a fresh inline script before `</body>`, carrying the
// nonce the header named — and that script has to run without a refusal anywhere.
test('a script the edge adds with the nonce from the policy header runs, and the nonce is new on every page', async ({ page }) => {
  const nonces: string[] = []
  await page.route(
    (url) => url.pathname === '/' || url.pathname === '/editor',
    async (route) => {
      const res = await route.fetch()
      const policy = res.headers()['content-security-policy'] ?? ''
      const nonce = /'nonce-([^']+)'/.exec(/script-src[^;]*/.exec(policy)?.[0] ?? '')?.[1]
      if (nonce) nonces.push(nonce)
      const edge = `<script nonce="${nonce ?? ''}">window.__edge = ${JSON.stringify(Math.random().toString(36))}</script>`
      return route.fulfill({ response: res, body: (await res.text()).replace('</body>', `${edge}</body>`) })
    },
  )

  for (const path of ['/', '/editor']) {
    await page.goto(path)
    await expect(page.locator('#root')).not.toBeEmpty()
    expect(await page.evaluate(() => typeof (window as unknown as { __edge?: string }).__edge), `the edge's script did not run on ${path}`).toBe('string')
  }
  expect(nonces).toHaveLength(2)
  expect(new Set(nonces).size, 'two pages were sent with the same nonce').toBe(2)
})
