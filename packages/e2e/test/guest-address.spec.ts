import type { BrowserContext, Page, Response } from '@playwright/test'
import { PHONE } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// A guest's name and token never leave the phone in an address (#1278, DRIFT §9). Before, the seat
// was `/play?…&name=…&token=…`: her name and her bearer token stood in the history, in every reload
// sent to the box, and as the `Referer` of every request — in the logs of the proxy and of
// Cloudflare, if they log addresses. Now the token is in the fragment, which a browser sends
// nowhere, her name is in no address at all, and the page's `Referrer-Policy` sends only the origin.
//
// Proved on the network, as hidden information is (CLAUDE.md): every request the phone makes, the
// table's WebSocket included, is read for its address and its `Referer`, and neither the name nor
// the token is in any of them. The search is shown to work first, by finding the name in the
// table's own frames and the token in the answer that bought it.

// A name no word of the product's contains, so that finding it means finding her.
const NAME = 'Vendela Qvist'

type Seen = { url: string; referer: string | undefined }

// Every request the context makes, from before the first page is opened, with the `Referer` the
// browser actually sent; and every WebSocket the pages open, whose handshake is a request too.
function watchRequests(context: BrowserContext, page: Page): { seen: Seen[]; settled: () => Promise<void> } {
  const seen: Seen[] = []
  const reading: Promise<void>[] = []
  context.on('request', (request) => {
    reading.push(
      request.allHeaders().then(
        (headers) => void seen.push({ url: request.url(), referer: headers['referer'] }),
        () => void seen.push({ url: request.url(), referer: request.headers()['referer'] }),
      ),
    )
  })
  page.on('websocket', (ws) => void seen.push({ url: ws.url(), referer: undefined }))
  return { seen, settled: () => Promise.all(reading).then(() => undefined) }
}

// The forms a value takes in an address: as it is, and encoded as a query or a path encodes it.
const spellings = (value: string): string[] => [...new Set([value, encodeURIComponent(value), value.replace(/ /g, '+'), value.split(' ')[0] ?? value])]

function neverIn(seen: Seen[], what: string, value: string): void {
  expect(seen.length, 'the journey made requests to read').toBeGreaterThan(10)
  for (const { url, referer } of seen) {
    for (const s of spellings(value)) {
      expect(url, `${what} in the address of a request`).not.toContain(s)
      expect(referer ?? '', `${what} in the Referer of ${url}`).not.toContain(s)
    }
  }
}

// The token the picker bought, read off the answer to the request that bought it. The body is read
// as the answer arrives: the picker leaves the page at once, and the browser lets the body go with it.
function tokenBought(page: Page): Promise<string> {
  return new Promise((resolve, reject) => {
    const heard = (res: Response) => {
      if (!/\/rooms\/[^/]+\/join$/.test(new URL(res.url()).pathname) || res.request().method() !== 'POST') return
      page.off('response', heard)
      res.json().then((body: { token: string }) => resolve(body.token), reject)
    }
    page.on('response', heard)
  })
}

async function answerSurvey(page: Page): Promise<void> {
  await expect(page.locator('.byd-survey')).toBeVisible()
  for (const n of ['4', '3', '2']) {
    await page.getByRole('button', { name: n, exact: true }).click()
    await page.getByRole('button', { name: 'Next' }).click()
  }
  await page.getByRole('button', { name: 'Send' }).click()
}

async function saveAndLogIn(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Save to your account' }).click()
  await page.getByLabel('Email').fill(`e2e-${crypto.randomUUID()}@example.com`)
  await page.getByRole('button', { name: 'Send sign-in link' }).click()
  await expect(page.getByText('Saved to your account.')).toBeVisible()
}

test.describe('the guest’s name and token in no address (#1278)', () => {
  test('a seat: joining, sitting down, reloading, playing, the survey, saving and logging in', async ({ tableOf, open, host }) => {
    const table = await tableOf({ players: 2, counters: [], cards: 6, copies: 1 })
    const phone = await open(PHONE, 'about:blank')
    const { page, wire } = phone
    const requests = watchRequests(phone.context, page)

    const page1 = await page.goto(`/join?code=${table.code}`)
    expect(page1?.headers()['referrer-policy'], 'the page says to send only its origin').toBe('strict-origin')
    await page.locator('button[data-seat="A"]').click()
    await page.getByLabel('Your name').fill(NAME)
    const bought = tokenBought(page)
    await page.getByRole('button', { name: 'Sit down' }).click()
    const token = await bought
    await page.waitForURL('**/play*')

    // The search works: the name is on the table's own wire, the token in the page's fragment.
    await wire.until((frame) => frame.includes(NAME))
    expect(token.length).toBeGreaterThan(20)
    expect(new URL(page.url()).hash).toBe(`#token=${token}`)

    // A reload keeps the seat, from the fragment alone.
    const reloaded = await page.reload()
    expect(reloaded?.headers()['referrer-policy']).toBe('strict-origin')
    await expect(page.locator('[data-page="player"]')).toBeVisible()
    await expect(page.getByText(NAME).first()).toBeVisible()

    // Playing: a card dealt and played from the hand.
    const dealer = await host(table)
    await dealer.send([{ v: 'draw', from: 'draw', to: 'hand:A', count: 2 }])
    const cards = page.locator('[data-hand] [data-hand-card]')
    await expect(cards).toHaveCount(2)
    await cards.first().click()
    await page.locator('[data-hand-bar] button[data-zone]').first().click()
    await expect(cards).toHaveCount(1)

    await dealer.send([{ v: 'session.end' } as never])
    await answerSurvey(page)
    await expect(page.getByText(`Thank you, ${NAME}.`)).toBeVisible()
    await saveAndLogIn(page)
    expect(new URL(page.url()).pathname).toBe('/play')
    expect(new URL(page.url()).hash).toBe(`#token=${token}`)

    await requests.settled()
    neverIn(requests.seen, 'her token', token)
    neverIn(requests.seen, 'her name', NAME)
  })

  test('an observer: joining to watch, reloading, the survey, saving and logging in', async ({ tableOf, open, host }) => {
    const table = await tableOf({ players: 2, counters: [], cards: 6, copies: 1 })
    const phone = await open(PHONE, 'about:blank')
    const { page, wire } = phone
    const requests = watchRequests(phone.context, page)

    await page.goto(`/join?code=${table.code}`)
    await page.getByLabel('Your name').fill(NAME)
    const bought = tokenBought(page)
    await page.getByRole('button', { name: /^Just watch/ }).click()
    const token = await bought
    await page.waitForURL('**/observe*')

    // The search works: the table announces her by name on its own wire (C8).
    await wire.until((frame) => frame.includes(NAME))
    expect(new URL(page.url()).hash).toBe(`#token=${token}`)

    await page.reload()
    await expect(page.locator('.byd-observer')).toBeVisible()
    await wire.until((frame) => frame.includes('"roster"') && frame.includes(NAME))

    const dealer = await host(table)
    await dealer.send([{ v: 'session.end' } as never])
    await answerSurvey(page)
    await expect(page.getByText(`Thank you, ${NAME}.`)).toBeVisible()
    await saveAndLogIn(page)
    expect(new URL(page.url()).pathname).toBe('/observe')

    await requests.settled()
    neverIn(requests.seen, 'her token', token)
    neverIn(requests.seen, 'her name', NAME)
  })

  // A link handed out before #1278 has both in its query. It still opens her seat, and the entry it
  // leaves in the history is the new form: replaced, not added to.
  test('an old address with ?name= and ?token= opens the same seat and leaves a history entry without them', async ({ tableOf, open, request }) => {
    const table = await tableOf({ players: 2, counters: [], cards: 4, copies: 1 })
    const res = await request.post(`/rooms/${encodeURIComponent(table.code)}/join`, { data: { name: NAME, seat: 'A' } })
    const { session, token } = (await res.json()) as { session: string; token: string }
    const phone = await open(PHONE, 'about:blank')
    const { page } = phone
    const requests = watchRequests(phone.context, page)
    const old = `/play?${new URLSearchParams({ session, code: table.code, seat: 'A', name: NAME, token }).toString()}`
    const before = await page.evaluate(() => history.length)
    await page.goto(old)
    await expect(page.locator('[data-page="player"]')).toBeVisible()
    await expect(page.getByText(NAME).first()).toBeVisible()

    const at = new URL(page.url())
    expect(at.searchParams.has('token')).toBe(false)
    expect(at.searchParams.has('name')).toBe(false)
    expect(at.searchParams.get('seat')).toBe('A')
    expect(at.hash).toBe(`#token=${token}`)
    // One entry for the old address: replaced by the new form, not left behind it.
    expect(await page.evaluate(() => history.length)).toBe(before + 1)
    await page.goBack()
    expect(page.url()).toBe('about:blank')

    // Nothing but the old address itself carries them: the page's own requests are clean, and its
    // Referer, by the page's policy, is the origin alone.
    await requests.settled()
    const after = requests.seen.filter(({ url }) => !url.endsWith(old))
    expect(after.length).toBeLessThan(requests.seen.length)
    neverIn(after, 'her token', token)
    neverIn(after, 'her name', NAME)
  })
})
