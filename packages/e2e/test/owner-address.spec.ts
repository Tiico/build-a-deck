import type { BrowserContext, Page, Request } from '@playwright/test'
import { logIn, makeProject } from '../support/api.js'
import { DESK } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// The host key and the owner's name in no address (#1306, DRIFT §9), as #1278 did for a guest.
// The table's screen was `/table?session=…&host=<key>`: the key opens the table, rotates its code
// and kicks its seats, and the address that held it went to the box in the page's own request and
// again in the upgrade of the table's WebSocket (`?host=`) — into the logs of the proxy and of
// Cloudflare, if they log addresses. The owner's own seat was `/online?…&name=<her name>&owner=1`,
// and the editor's socket was `/projects/<id>/edit?name=<her email>`. Now the key is in the
// fragment, which a browser sends nowhere, and in `Sec-WebSocket-Protocol`; her name and her
// address are in no address at all.
//
// Proved on the network, as hidden information is (CLAUDE.md): every request each tab makes — the
// editor's, the table's and the seat's, their WebSockets included — is read for its address and its
// `Referer`, and none of the three is in any of them. The search is shown to work first, on the
// answer that handed out the key, on the account's own answer and on the table's frames.

// Words no word of the product's contains, so that finding one means finding her.
const NAME = 'Ottilia Wennerqvist'

type Seen = { url: string; referer: string | undefined }

// Every request the context makes, in every tab, and every WebSocket its tabs open, whose handshake
// is a request too. The `Referer` is read as Chromium sent it once the request has finished, and the
// read is bounded by the request's own fate (#1320): a request a navigation cut off never gets its
// raw headers, and a read that waited for them waited for ever. The provisional headers, which the
// browser reports as it sends the request, stand in for them then.
function watchRequests(context: BrowserContext): { seen: Seen[]; frames: string[]; settled: () => Promise<void> } {
  const seen: Seen[] = []
  const frames: string[] = []
  const reading: Promise<void>[] = []
  const settles = new Map<Request, (referer: string | undefined) => void>()
  const provisional = (request: Request) => request.headers()['referer']
  context.on('request', (request) => {
    reading.push(
      new Promise<void>((resolve) => {
        const settle = (referer: string | undefined) => {
          if (!settles.delete(request)) return
          seen.push({ url: request.url(), referer })
          resolve()
        }
        settles.set(request, settle)
        // Whatever happens to it, the request is read once and its read is over.
        setTimeout(() => settle(provisional(request)), 5_000)
      }),
    )
  })
  context.on('requestfinished', (request) => {
    void request.allHeaders().then(
      (headers) => settles.get(request)?.(headers['referer']),
      () => settles.get(request)?.(provisional(request)),
    )
  })
  context.on('requestfailed', (request) => settles.get(request)?.(provisional(request)))
  const watch = (page: Page) =>
    page.on('websocket', (ws) => {
      seen.push({ url: ws.url(), referer: undefined })
      ws.on('framereceived', ({ payload }) => void frames.push(String(payload)))
    })
  for (const page of context.pages()) watch(page)
  context.on('page', watch)
  return { seen, frames, settled: () => Promise.all(reading).then(() => undefined) }
}

// The forms a value takes in an address: as it is, and encoded as a query or a path encodes it.
const spellings = (value: string): string[] => [...new Set([value, encodeURIComponent(value), value.replace(/ /g, '+'), value.split(' ')[0] ?? value])]

function neverIn(seen: Seen[], what: string, value: string): void {
  for (const { url, referer } of seen) {
    for (const s of spellings(value)) {
      expect(url, `${what} in the address of a request`).not.toContain(s)
      expect(referer ?? '', `${what} in the Referer of ${url}`).not.toContain(s)
    }
  }
}

// The reading reads something: requests in every tab, a Referer the browser sent, and the sockets.
function readSomething(seen: Seen[], sockets: string[]): void {
  expect(seen.length, 'the journey made requests to read').toBeGreaterThan(10)
  expect(seen.some(({ referer }) => referer !== undefined && referer !== ''), 'a Referer was read').toBe(true)
  for (const path of sockets) expect(seen.some(({ url }) => url.startsWith('ws') && url.includes(path)), `the socket ${path} was among them`).toBe(true)
}

// The host key the start handed out, read off the answer as it passes through to the editor.
async function keyHandedOut(page: Page): Promise<() => string> {
  let key: string | null = null
  await page.route('**/projects/*/sessions', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    const answer = await route.fetch()
    key = ((await answer.json()) as { hostKey: string }).hostKey
    await route.fulfill({ response: answer })
  })
  return () => {
    if (key === null) throw new Error('the start handed out no host key')
    return key
  }
}

// A designer who has named her account, in the editor of her own game.
async function designerInTheEditor(open: (device: typeof DESK, url: string) => Promise<{ page: Page; context: BrowserContext }>) {
  const { page, context } = await open(DESK, 'about:blank')
  const requests = watchRequests(context)
  const email = await logIn(page.request)
  expect((await page.request.put('/me/name', { data: { name: NAME } })).status()).toBe(200)
  const project = await makeProject(page.request, { name: 'Fredagskort', players: 2, cards: 3 })
  // The search works: the account says her name and her address back, in the answer's body.
  const me = page.waitForResponse((res) => new URL(res.url()).pathname === '/auth/me')
  await page.goto(project.editorUrl)
  const said = await (await me).text()
  expect(said).toContain(NAME)
  expect(said).toContain(email)
  await expect(page.getByText('Fredagskort').first()).toBeVisible()
  return { page, context, requests, email, project }
}

async function startAs(page: Page, seating: 'screen' | 'computer'): Promise<Page> {
  await page.locator('header').getByRole('button', { name: 'Start a table' }).click()
  const dialog = page.getByRole('dialog', { name: 'Start a table' })
  await dialog.getByRole('radio', { name: seating === 'screen' ? 'Around one screen' : 'Each at their own computer' }).check()
  if (seating === 'computer') await dialog.getByRole('textbox', { name: 'Your name at the table' }).fill(NAME)
  const opened = page.context().waitForEvent('page')
  await dialog.getByRole('button', { name: seating === 'screen' ? 'Start' : 'Start and sit down', exact: true }).click()
  return opened
}

test.describe('the host key and the owner’s name in no address (#1306)', () => {
  test('the table’s screen: started from the editor, opened and reloaded', async ({ open }) => {
    const { page, requests, email } = await designerInTheEditor(open)
    const handed = await keyHandedOut(page)
    const tv = await startAs(page, 'screen')
    await tv.waitForURL(/\/table\?/)
    // The table's own view, which only the key opens here: the room code stands on it.
    const code = page.locator('[data-room-code]')
    await expect(code).toHaveText(/\S+/)
    await expect(tv.getByText((await code.textContent()) ?? '').first()).toBeVisible()
    const key = handed()
    expect(key.length).toBeGreaterThan(20)
    // The search works: the key is in the answer that handed it out.
    expect(tv.url()).not.toContain(key)

    // A reload opens the table again, with the key the tab kept.
    await tv.reload()
    await expect(tv.locator('.byd-pile').first()).toBeVisible()
    await expect(tv.locator('[data-status-notice]')).toHaveCount(0)

    await requests.settled()
    readSomething(requests.seen, ['/sessions/', '/edit'])
    neverIn(requests.seen, 'the host key', key)
    neverIn(requests.seen, 'her name', NAME)
    neverIn(requests.seen, 'her address', email)
  })

  test('the owner’s own seat: started from the editor at her own computer, seated and reloaded', async ({ open }) => {
    const { page, requests, email } = await designerInTheEditor(open)
    const handed = await keyHandedOut(page)
    const seat = await startAs(page, 'computer')
    await seat.waitForURL(/\/online\?/)
    expect(new URL(seat.url()).searchParams.get('owner')).toBe('1')
    // Seated under the name she gave, which the table says on its own wire: the search works.
    await expect(seat.locator('.byd-seat-name[data-me="true"]', { hasText: NAME })).toBeAttached()
    await expect.poll(() => requests.frames.some((frame) => frame.includes(NAME))).toBe(true)
    const key = handed()

    await seat.reload()
    await expect(seat.locator('.byd-seat-name[data-me="true"]', { hasText: NAME })).toBeAttached()

    await requests.settled()
    readSomething(requests.seen, ['/sessions/', '/edit'])
    neverIn(requests.seen, 'the host key', key)
    neverIn(requests.seen, 'her name', NAME)
    neverIn(requests.seen, 'her address', email)
  })
})
