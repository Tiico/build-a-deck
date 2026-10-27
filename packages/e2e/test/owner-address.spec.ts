import type { BrowserContext, Page } from '@playwright/test'
import { tableProtocols } from '@byd/protocol'
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

  // The old form was read for a while after #1306 and is refused since #1341: a page that still
  // runs the old client — the table's screen saying its key in the socket's address, the owner's
  // seat saying her name there — is turned away and told why, and the same sockets in today's form
  // get in.
  test('a page loaded before #1306 is turned away, and today’s form gets in', async ({ open }) => {
    const { page } = await open(DESK, 'about:blank')
    await logIn(page.request)
    const project = await makeProject(page.request, { name: 'Fredagskort', players: 2, cards: 3 })
    const table = await startTable(page.request, project.id)
    await page.goto('/')
    const origin = new URL(page.url()).origin.replace(/^http/, 'ws')
    const at = (query: string) => `${origin}/sessions/${encodeURIComponent(table.session)}${query ? `?${query}` : ''}`
    const types = (frames: string[]) => frames.map((frame) => (JSON.parse(frame) as { t: string }).t)
    const refusal = (frames: string[]) => frames.map((frame) => JSON.parse(frame) as { t: string; reason?: string }).find((m) => m.t === 'refused')?.reason

    const oldScreen = await page.evaluate(socket, { address: at(`host=${encodeURIComponent(table.hostKey)}`), table: true })
    expect(refusal(oldScreen), 'the old screen is told where the key goes').toBe('the host key goes in the protocol header, not the address: reload the page')
    expect(types(oldScreen)).not.toContain('snapshot')
    const oldSeat = await page.evaluate(socket, { address: at(`seat=A&name=${encodeURIComponent(NAME)}&owner=1`), table: false })
    expect(refusal(oldSeat), 'the old seat is told where her name comes from').toBe('the owner’s seat is named by her account, not the address: reload the page')
    expect(types(oldSeat)).not.toContain('snapshot')

    const screen = await page.evaluate(socket, { address: at(''), protocols: tableProtocols({ host: table.hostKey }), table: true })
    expect(types(screen)).not.toContain('refused')
    expect(screen.some((frame) => frame.includes(`"code":"${table.code}"`)), 'today’s screen is the table’s and hears its code').toBe(true)
    const seat = await page.evaluate(socket, { address: at('seat=A&owner=1'), protocols: tableProtocols(), table: false })
    expect(types(seat)).not.toContain('refused')
    expect(types(seat)).toContain('snapshot')
  })
})

// A raw socket, as a client opens one: an address, and the protocols it offers (none, for the old
// client). Resolves with every frame once the table has let it in (its snapshot, and for the table's
// screen also the room) or turned it away.
function socket({ address, protocols, table }: { address: string; protocols?: string[]; table: boolean }): Promise<string[]> {
  return new Promise<string[]>((resolve, reject) => {
    const got: string[] = []
    const ws = new WebSocket(address, protocols)
    ws.onmessage = (ev) => {
      got.push(String(ev.data))
      const types = got.map((frame) => (JSON.parse(frame) as { t: string }).t)
      if (types.includes('refused') || (types.includes('snapshot') && (!table || types.includes('room')))) {
        ws.close()
        resolve(got)
      }
    }
    ws.onerror = () => reject(new Error(`could not open ${address}`))
  })
}
