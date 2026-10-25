import { createServer, type Server, type ServerResponse } from 'node:http'
import { free } from '../support/ports.js'
import { watchRequests } from '../support/requests.js'
import { expect, test } from '../support/test.js'

// The request watcher the address proofs read the network with (#1278) settles when the journey is
// over, and a request the browser never finished is read with the rest (#1320).
//
// `request.allHeaders()` waits for the headers Chromium reports from the network stack, and those
// only come with an answer: for a request still in flight they never come, and for one whose report
// arrives out of order under load they never come either. A proof that waited on all of them hung
// until the test's own minute ran out, after the journey had finished in six seconds.
//
// Held here on purpose, by a server that answers the page and never the picture on it. Not by a
// route: a routed request has its headers the moment it is paused, and would prove nothing.
test('a request never answered is read, with its Referer, and the watcher still settles', async ({ browser }) => {
  const held: ServerResponse[] = []
  let asked: (() => void) | undefined
  const askedFor = new Promise<void>((resolve) => (asked = resolve))
  const server = createServer((req, res) => {
    if (req.url === '/held') {
      held.push(res)
      asked?.()
      return
    }
    // `unsafe-url`, so the page's full address stands in the Referer and the read can be seen to find it.
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'referrer-policy': 'unsafe-url' })
    res.end('<!doctype html><title>held</title><img src="/held" alt="">')
  })
  // On a number from the suite's own band, walking on past one a peer took meanwhile (`support/ports.ts`).
  let port = await free()
  while (!(await listening(server, port))) port = await free(port + 1)
  const origin = `http://127.0.0.1:${port}`
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    const requests = watchRequests(context, page)
    // Not to `load`, which waits for the picture too.
    await page.goto(`${origin}/?mark=findme`, { waitUntil: 'domcontentloaded' })
    await askedFor

    await requests.closeAndRead()
    expect(requests.seen.map(({ url }) => url)).toEqual(expect.arrayContaining([`${origin}/?mark=findme`, `${origin}/held`]))
    expect(requests.seen.find(({ url }) => url.endsWith('/held'))?.referer).toBe(`${origin}/?mark=findme`)
  } finally {
    await context.close()
    for (const res of held) res.destroy()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

const listening = (server: Server, port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const taken = () => resolve(false)
    server.once('error', taken)
    server.listen(port, '127.0.0.1', () => {
      server.off('error', taken)
      resolve(true)
    })
  })
