import type { BrowserContext, Page } from '@playwright/test'
import { logIn, makeProject, startTable } from '../support/api.js'
import { DESK } from '../support/devices.js'
import { watchRequests, type Seen } from '../support/requests.js'
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
// `Referer` (`support/requests.ts`), and none of the three is in any of them. The search is shown
// to work first: the key in the address the editor handed the new tab, in its fragment; her name
// and her address in the account's own answer and her name in the table's frames.

// Words no word of the product's contains, so that finding one means finding her.
const NAME = 'Ottilia Wennerqvist'

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

// A designer who has named her account, in the editor of her own game, with every request of the
// context watched from before the editor's first one.
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

// Starts a table from the editor's header, and answers with the tab it opened and every address
// that tab's main frame was at, in the order it was there.
async function startAs(page: Page, seating: 'screen' | 'computer'): Promise<{ tab: Page; at: string[] }> {
  await page.locator('header').getByRole('button', { name: 'Start a table' }).click()
  const dialog = page.getByRole('dialog', { name: 'Start a table' })
  await dialog.getByRole('radio', { name: seating === 'screen' ? 'Around one screen' : 'Each at their own computer' }).check()
  if (seating === 'computer') await dialog.getByRole('textbox', { name: 'Your name at the table' }).fill(NAME)
  const at: string[] = []
  const opened = page.context().waitForEvent('page').then((tab) => {
    tab.on('framenavigated', (frame) => void (frame === tab.mainFrame() && at.push(frame.url())))
    return tab
  })
  await dialog.getByRole('button', { name: seating === 'screen' ? 'Start' : 'Start and sit down', exact: true }).click()
  return { tab: await opened, at }
}

test.describe('the host key and the owner’s name in no address (#1306)', () => {
  test('the table’s screen: started from the editor, opened and reloaded', async ({ open }) => {
    const { page, requests, email } = await designerInTheEditor(open)
    const handed = await keyHandedOut(page)
    const { tab: tv, at } = await startAs(page, 'screen')
    await tv.waitForURL(/\/table\?/)
    // The table's own view, which only the key opens: the table is on the felt and the room code
    // the editor shows stands on the screen.
    await expect(tv.locator('.byd-pile').first()).toBeVisible()
    const code = (await page.locator('[data-room-code]').textContent()) ?? ''
    expect(code).toMatch(/\S+/)
    await expect(tv.getByText(code).first()).toBeVisible()
    const key = handed()
    // The search works: the tab was handed the key, in the fragment of its address, and the
    // screen took it out of the address on arrival.
    expect(at.some((url) => new URL(url).hash === `#host=${key}`), 'the tab was opened with the key in its fragment').toBe(true)
    expect(tv.url()).not.toContain(key)

    // A reload opens the table again, with the key the tab kept.
    await tv.reload()
    await expect(tv.locator('.byd-pile').first()).toBeVisible()
    await expect(tv.getByText(code).first()).toBeVisible()

    await requests.closeAndRead()
    readSomething(requests.seen, ['/sessions/', '/edit'])
    neverIn(requests.seen, 'the host key', key)
    neverIn(requests.seen, 'her name', NAME)
    neverIn(requests.seen, 'her address', email)
  })

  test('the owner’s own seat: started from the editor at her own computer, seated and reloaded', async ({ open }) => {
    const { page, requests, email } = await designerInTheEditor(open)
    const handed = await keyHandedOut(page)
    const { tab: seat } = await startAs(page, 'computer')
    await seat.waitForURL(/\/online\?/)
    expect(new URL(seat.url()).searchParams.get('owner')).toBe('1')
    // Seated under her name, which the table says on its own wire: the search works.
    const mine = seat.locator('.byd-seat-name[data-me="true"]', { hasText: NAME })
    await expect(mine).toBeAttached()
    await expect.poll(() => requests.frames.some((frame) => frame.includes(NAME))).toBe(true)
    const key = handed()

    // A browser that does not remember her seat's name — storage cleared, or another computer —
    // still sits her down under it: the table tells her the name she gave her account.
    await seat.evaluate(() => localStorage.removeItem('byd.hostSeat'))
    const told = requests.frames.length
    await seat.reload()
    await expect(mine).toBeAttached()
    expect(requests.frames.slice(told).some((frame) => frame.includes('"admitted"') && frame.includes(NAME)), 'the table told her the name').toBe(true)

    await requests.closeAndRead()
    readSomething(requests.seen, ['/sessions/', '/edit'])
    neverIn(requests.seen, 'the host key', key)
    neverIn(requests.seen, 'her name', NAME)
    neverIn(requests.seen, 'her address', email)
  })

  // A page that loaded before the box was updated still runs the old client: the table's screen
  // says its key in the socket's address and offers no protocol, and the owner's seat says her name
  // there. Both still get in, as they did, and the seat is told nothing its client does not know.
  test('a page loaded before the deploy still connects the old way', async ({ open }) => {
    const { page } = await open(DESK, 'about:blank')
    await logIn(page.request)
    const project = await makeProject(page.request, { name: 'Fredagskort', players: 2, cards: 3 })
    const table = await startTable(page.request, project.id)
    await page.goto('/')
    const origin = new URL(page.url()).origin.replace(/^http/, 'ws')
    const at = (query: string) => `${origin}/sessions/${encodeURIComponent(table.session)}?${query}`
    const screen = await page.evaluate(oldSocket, at(`host=${encodeURIComponent(table.hostKey)}`))
    const types = (frames: string[]) => frames.map((frame) => (JSON.parse(frame) as { t: string }).t)
    expect(types(screen)).not.toContain('refused')
    expect(screen.some((frame) => frame.includes(`"code":"${table.code}"`)), 'the old screen is the table’s and hears its code').toBe(true)

    const owner = await page.evaluate(oldSocket, at(`seat=A&name=${encodeURIComponent(NAME)}&owner=1`))
    expect(types(owner)).not.toContain('refused')
    expect(types(owner)).toContain('snapshot')
    expect(types(owner), 'an old client is not told a message it does not know').not.toContain('admitted')
  })
})

// The old client's socket: an address, no protocol. Resolves with every frame once the table has let
// it in (its snapshot, and for the table's screen also the room) or turned it away.
function oldSocket(address: string): Promise<string[]> {
  return new Promise<string[]>((resolve, reject) => {
    const got: string[] = []
    const ws = new WebSocket(address)
    ws.onmessage = (ev) => {
      got.push(String(ev.data))
      const types = got.map((frame) => (JSON.parse(frame) as { t: string }).t)
      if (types.includes('refused') || (types.includes('snapshot') && (!address.includes('host=') || types.includes('room')))) {
        ws.close()
        resolve(got)
      }
    }
    ws.onerror = () => reject(new Error(`could not open ${address}`))
  })
}
